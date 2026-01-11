import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptionData {
  strike: number;
  type: 'Call' | 'Put';
  latest: string;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  ivSkew: number;
  lastTrade: string;
}

interface OptionsChainResponse {
  success: boolean;
  symbol: string;
  name: string;
  maturity: string;
  daysToExpiration: number;
  impliedVolatility: number;
  priceOfOptionPoint: number;
  calls: OptionData[];
  puts: OptionData[];
  error?: string;
  code?: 'RATE_LIMIT' | 'SCRAPE_FAILED';
  retryAfterSeconds?: number;
  fromCache?: boolean;
  cacheAge?: number;
}

interface ExtractedOption {
  strike: number;
  type: string;
  latest: string;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  ivSkew: number;
  lastTrade: string;
}

interface ExtractedData {
  daysToExpiration?: number;
  impliedVolatility?: number;
  maturity?: string;
  options?: ExtractedOption[];
}

type OptionsCacheEntry = {
  createdAt: number;
  expiresAt: number;
  data: OptionsChainResponse;
};

// Cache TTL: 24 hours for successful data, 5 minutes for errors
const OPTIONS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OPTIONS_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const optionsCache = new Map<string, OptionsCacheEntry>();
const optionsInflight = new Map<string, Promise<OptionsChainResponse>>();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, maturityCode, name, optionPointValue, forceRefresh } = await req.json();

    if (!symbol || !maturityCode) {
      return new Response(
        JSON.stringify({ success: false, error: 'Symbol and maturityCode are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fullSymbol = `${symbol}${maturityCode}`;
    const cacheKey = fullSymbol;

    // Check cache unless forceRefresh is requested
    if (!forceRefresh) {
      const cached = getFromCache(optionsCache, cacheKey);
      if (cached) {
        const cacheAge = Math.round((Date.now() - cached.createdAt) / 1000);
        console.log(`Cache hit for ${cacheKey} (age: ${cacheAge}s)`);
        return new Response(JSON.stringify({
          ...cached.data,
          fromCache: true,
          cacheAge
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.log(`Force refresh requested for ${cacheKey}`);
      optionsCache.delete(cacheKey);
    }

    const url = `https://www.barchart.com/futures/quotes/${fullSymbol}/volatility-greeks?futuresOptionsView=merged`;

    console.log(`Scraping options data for: ${fullSymbol}`);
    console.log(`URL: ${url}`);

    const existingPromise = optionsInflight.get(cacheKey);
    const isOwner = !existingPromise;

    const workPromise =
      existingPromise ??
      (async (): Promise<OptionsChainResponse> => {
        try {
          const isTimeoutError = (scrapeData: any) => {
            const msg: string | undefined = scrapeData?.error;
            return (
              (typeof scrapeData?.code === 'string' && scrapeData.code.toUpperCase().includes('TIMEOUT')) ||
              (typeof msg === 'string' && msg.toLowerCase().includes('timed out'))
            );
          };

          const tryScrape = async (body: Record<string, unknown>) => {
            const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            });

            const scrapeData = await scrapeResponse.json();
            return { scrapeResponse, scrapeData };
          };

          // 1) Fast path: HTML scrape + deterministic parsing (no LLM extraction)
          console.log('Starting Firecrawl HTML scrape (fast path)...');

          let { scrapeResponse, scrapeData } = await tryScrape({
            url,
            formats: ['html'],
            onlyMainContent: true,
            waitFor: 2000,
          });

          if ((!scrapeResponse.ok || !scrapeData.success) && isTimeoutError(scrapeData)) {
            console.warn('Firecrawl HTML scrape timed out; retrying once with waitFor=0');
            ({ scrapeResponse, scrapeData } = await tryScrape({
              url,
              formats: ['html'],
              onlyMainContent: true,
              waitFor: 0,
            }));
          }

          if (scrapeResponse.ok && scrapeData.success) {
            const html = scrapeData.data?.html || scrapeData.html || '';
            const parsedFromHtml = parseOptionsFromHtml(
              html,
              fullSymbol,
              name || fullSymbol,
              optionPointValue || 1000,
              {}
            );

            if (parsedFromHtml.calls.length > 0 || parsedFromHtml.puts.length > 0) {
              console.log(`HTML parsing - Calls: ${parsedFromHtml.calls.length}, Puts: ${parsedFromHtml.puts.length}`);
              return parsedFromHtml;
            }

            console.warn('HTML scrape succeeded but no rows parsed; falling back to extract');
          }

          // 2) Fallback: JSON extraction (LLM-based)
          const extractionSchema = {
            type: "object",
            properties: {
              daysToExpiration: { type: "number", description: "Number of days until expiration" },
              impliedVolatility: { type: "number", description: "Overall implied volatility percentage" },
              maturity: { type: "string", description: "Maturity date string like 'Jan 26' or 'February 2026'" },
              options: {
                type: "array",
                description: "ALL options from both Calls and Puts tables. Extract EVERY single row.",
                items: {
                  type: "object",
                  properties: {
                    strike: { type: "number", description: "Strike price" },
                    type: { type: "string", enum: ["Call", "Put"], description: "Option type: Call or Put" },
                    latest: { type: "string", description: "Latest price" },
                    iv: { type: "number", description: "Implied Volatility %" },
                    delta: { type: "number", description: "Delta greek" },
                    gamma: { type: "number", description: "Gamma greek" },
                    theta: { type: "number", description: "Theta greek" },
                    vega: { type: "number", description: "Vega greek" },
                    ivSkew: { type: "number", description: "IV Skew %" },
                    lastTrade: { type: "string", description: "Last trade date" }
                  },
                  required: ["strike", "type", "iv"]
                }
              }
            },
            required: ["options"]
          };

          console.log('Starting Firecrawl extraction (fallback)...');

          ({ scrapeResponse, scrapeData } = await tryScrape({
            url,
            formats: ['extract'],
            extract: {
              schema: extractionSchema,
              prompt:
                `Extract ALL options rows from the Calls table and the Puts table (do not skip strikes). For each row: strike, type (Call/Put), latest, iv, delta, gamma, theta, vega, ivSkew, lastTrade. Also extract daysToExpiration, impliedVolatility, maturity.`
            },
            onlyMainContent: true,
            waitFor: 2000,
          }));

          if ((!scrapeResponse.ok || !scrapeData.success) && isTimeoutError(scrapeData)) {
            console.warn('Firecrawl extract timed out; retrying once with waitFor=0');
            ({ scrapeResponse, scrapeData } = await tryScrape({
              url,
              formats: ['extract'],
              extract: {
                schema: extractionSchema,
                prompt:
                  `Extract ALL options rows from the Calls table and the Puts table (do not skip strikes). For each row: strike, type (Call/Put), latest, iv, delta, gamma, theta, vega, ivSkew, lastTrade. Also extract daysToExpiration, impliedVolatility, maturity.`
              },
              onlyMainContent: true,
              waitFor: 0,
            }));
          }

          if (!scrapeResponse.ok || !scrapeData.success) {
            const msg: string | undefined = scrapeData?.error;
            const isRateLimit = isRateLimitError(msg);
            const retryAfterSeconds = isRateLimit ? extractRetryAfterSeconds(msg) ?? 60 : undefined;

            console.error('Firecrawl scrape error:', scrapeData);

            return {
              success: false,
              symbol: fullSymbol,
              name: name || fullSymbol,
              maturity: '',
              daysToExpiration: 0,
              impliedVolatility: 0,
              priceOfOptionPoint: optionPointValue || 1000,
              calls: [],
              puts: [],
              code: isRateLimit ? 'RATE_LIMIT' : 'SCRAPE_FAILED',
              retryAfterSeconds,
              error: msg || `Failed to scrape Barchart page`,
            };
          }

          console.log('Extraction successful, processing data...');

          const extractedData: ExtractedData = scrapeData.data?.extract || scrapeData.extract || {};

          // Process extracted options
          const calls: OptionData[] = [];
          const puts: OptionData[] = [];

          if (extractedData.options && Array.isArray(extractedData.options)) {
            for (const opt of extractedData.options) {
              const option: OptionData = {
                strike: Number(opt.strike) || 0,
                type: opt.type === 'Put' ? 'Put' : 'Call',
                latest: String(opt.latest || '0.00'),
                iv: Number(opt.iv) || 0,
                delta: Number(opt.delta) || 0,
                gamma: Number(opt.gamma) || 0,
                theta: Number(opt.theta) || 0,
                vega: Number(opt.vega) || 0,
                ivSkew: Number(opt.ivSkew) || 0,
                lastTrade: String(opt.lastTrade || ''),
              };

              if (option.strike > 0) {
                if (option.type === 'Call') {
                  calls.push(option);
                } else {
                  puts.push(option);
                }
              }
            }
          }

          console.log(`Processed - Calls: ${calls.length}, Puts: ${puts.length}`);

          return {
            success: calls.length > 0 || puts.length > 0,
            symbol: fullSymbol,
            name: name || fullSymbol,
            maturity: extractedData.maturity || '',
            daysToExpiration: Number(extractedData.daysToExpiration) || 0,
            impliedVolatility: Math.round((Number(extractedData.impliedVolatility) || 0) * 100) / 100,
            priceOfOptionPoint: optionPointValue || 1000,
            calls: calls.sort((a, b) => a.strike - b.strike),
            puts: puts.sort((a, b) => a.strike - b.strike),
          };
        } catch (error) {
          console.error('Error in scrape-barchart-options:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to scrape options data';
          return {
            success: false,
            symbol: fullSymbol,
            name: name || fullSymbol,
            maturity: '',
            daysToExpiration: 0,
            impliedVolatility: 0,
            priceOfOptionPoint: optionPointValue || 1000,
            calls: [],
            puts: [],
            code: 'SCRAPE_FAILED',
            error: errorMessage,
          };
        }
      })();

    if (isOwner) {
      optionsInflight.set(cacheKey, workPromise);
    }

    try {
      const parsedData = await workPromise;

      console.log(`Final result - Calls: ${parsedData.calls.length}, Puts: ${parsedData.puts.length}`);

      // Cache the result
      const now = Date.now();
      optionsCache.set(cacheKey, {
        createdAt: now,
        expiresAt: now + (parsedData.success ? OPTIONS_CACHE_TTL_MS : OPTIONS_NEGATIVE_CACHE_TTL_MS),
        data: parsedData,
      });

      return new Response(JSON.stringify(parsedData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      if (isOwner) {
        optionsInflight.delete(cacheKey);
      }
    }

  } catch (error) {
    console.error('Error in scrape-barchart-options:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    const payload: OptionsChainResponse = {
      success: false,
      symbol: '',
      name: '',
      maturity: '',
      daysToExpiration: 0,
      impliedVolatility: 0,
      priceOfOptionPoint: 1000,
      calls: [],
      puts: [],
      code: 'SCRAPE_FAILED',
      error: errorMessage,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getFromCache(cache: Map<string, OptionsCacheEntry>, key: string): OptionsCacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function isRateLimitError(message?: string): boolean {
  return !!message && message.toLowerCase().includes('rate limit');
}

function extractRetryAfterSeconds(message?: string): number | null {
  if (!message) return null;
  const match = message.match(/retry after\s*(\d+)s/i) || message.match(/after\s*(\d+)s/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

// Parse options data from raw HTML
function parseOptionsFromHtml(
  html: string,
  symbol: string,
  name: string,
  optionPointValue: number,
  extractedMeta: ExtractedData
): OptionsChainResponse {
  const calls: OptionData[] = [];
  const puts: OptionData[] = [];

  // Extract days to expiration
  const daysMatch = html.match(/(\d+)\s*Days?\s*to\s*expiration/i);
  const daysToExpiration = daysMatch ? parseInt(daysMatch[1], 10) : (extractedMeta.daysToExpiration || 0);

  // Extract implied volatility
  const ivMatch = html.match(/Implied\s*Volatility[:\s]*(\d+\.?\d*)%/i);
  const impliedVolatility = ivMatch ? parseFloat(ivMatch[1]) : (extractedMeta.impliedVolatility || 0);

  // Try to extract table rows using regex
  // Look for patterns like: strike number followed by Call/Put and then numeric data
  
  // Pattern for table cells with option data
  const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowPattern) || [];
  
  console.log(`Found ${rows.length} table rows`);

  for (const row of rows) {
    // Skip header rows
    if (row.includes('<th') || row.includes('Strike') && row.includes('Type')) {
      continue;
    }

    // Extract cell contents
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;
    
    while ((cellMatch = cellPattern.exec(row)) !== null) {
      // Clean HTML tags and get text content
      const cellText = cellMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
      cells.push(cellText);
    }

    // Need at least strike, type, and some data
    if (cells.length >= 5) {
      const strikeStr = cells[0];
      const typeStr = cells[1];
      
      const strike = parseFloat(strikeStr.replace(/[,$]/g, ''));
      
      if (!isNaN(strike) && strike > 0 && (typeStr === 'Call' || typeStr === 'Put')) {
        const option: OptionData = {
          strike,
          type: typeStr as 'Call' | 'Put',
          latest: cells[2] || '0.00',
          iv: parseFloat(cells[3]?.replace('%', '') || '0') || 0,
          delta: parseFloat(cells[4] || '0') || 0,
          gamma: parseFloat(cells[5] || '0') || 0,
          theta: parseFloat(cells[6] || '0') || 0,
          vega: parseFloat(cells[7] || '0') || 0,
          ivSkew: parseFloat(cells[8]?.replace('%', '').replace('+', '') || '0') || 0,
          lastTrade: cells[9] || '',
        };

        if (option.type === 'Call') {
          calls.push(option);
        } else {
          puts.push(option);
        }
      }
    }
  }

  console.log(`HTML parsing result - Calls: ${calls.length}, Puts: ${puts.length}`);

  return {
    success: calls.length > 0 || puts.length > 0,
    symbol,
    name,
    maturity: extractedMeta.maturity || '',
    daysToExpiration,
    impliedVolatility: Math.round(impliedVolatility * 100) / 100,
    priceOfOptionPoint: optionPointValue,
    calls: calls.sort((a, b) => a.strike - b.strike),
    puts: puts.sort((a, b) => a.strike - b.strike),
  };
}
