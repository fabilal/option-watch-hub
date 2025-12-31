import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FuturesPrice {
  contract: string;
  month: string;
  last: string;
  change: string;
  percentChange: string;
  open: string;
  high: string;
  low: string;
  volume: string;
  openInterest: string;
  time: string;
}

interface FuturesPricesResponse {
  success: boolean;
  symbol: string;
  name: string;
  futures: FuturesPrice[];
  error?: string;
  code?: 'RATE_LIMIT' | 'SCRAPE_FAILED';
  retryAfterSeconds?: number;
}

type CacheEntry = {
  expiresAt: number;
  data: FuturesPricesResponse;
};

const CACHE_TTL_MS = 60_000; // 1 minute cache
const NEGATIVE_CACHE_TTL_MS = 10_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FuturesPricesResponse>>();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, maturityCode, name } = await req.json();

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

    // Check cache
    const cached = getFromCache(cache, cacheKey);
    if (cached) {
      console.log(`Cache hit for futures ${cacheKey}`);
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = `https://www.barchart.com/futures/quotes/${fullSymbol}/futures-prices`;

    console.log(`Scraping futures prices for: ${fullSymbol}`);
    console.log(`URL: ${url}`);

    const existingPromise = inflight.get(cacheKey);
    const isOwner = !existingPromise;

    const workPromise =
      existingPromise ??
      (async (): Promise<FuturesPricesResponse> => {
        try {
          const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url,
              formats: ['markdown'],
              onlyMainContent: false,
              waitFor: 5000,
            }),
          });

          const scrapeData = await scrapeResponse.json();

          if (!scrapeResponse.ok || !scrapeData.success) {
            const msg: string | undefined = scrapeData?.error;
            const isRateLimit = isRateLimitError(msg);
            const retryAfterSeconds = isRateLimit ? extractRetryAfterSeconds(msg) ?? undefined : undefined;

            console.error('Firecrawl scrape error:', scrapeData);

            return {
              success: false,
              symbol: fullSymbol,
              name: name || fullSymbol,
              futures: [],
              code: isRateLimit ? 'RATE_LIMIT' : 'SCRAPE_FAILED',
              retryAfterSeconds,
              error: msg || 'Failed to scrape Barchart page',
            };
          }

          console.log('Scrape successful, parsing futures data...');

          const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
          console.log(`Markdown length: ${markdown.length}`);

          return parseFuturesFromMarkdown(markdown, fullSymbol, name || fullSymbol);
        } catch (error) {
          console.error('Error in scrape-barchart-futures:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to scrape futures data';
          return {
            success: false,
            symbol: fullSymbol,
            name: name || fullSymbol,
            futures: [],
            code: 'SCRAPE_FAILED',
            error: errorMessage,
          };
        }
      })();

    if (isOwner) {
      inflight.set(cacheKey, workPromise);
    }

    try {
      const parsedData = await workPromise;

      console.log(`Parsed ${parsedData.futures.length} futures contracts`);

      cache.set(cacheKey, {
        expiresAt: Date.now() + (parsedData.success ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
        data: parsedData,
      });

      return new Response(JSON.stringify(parsedData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      if (isOwner) {
        inflight.delete(cacheKey);
      }
    }

  } catch (error) {
    console.error('Error in scrape-barchart-futures:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    const payload: FuturesPricesResponse = {
      success: false,
      symbol: '',
      name: '',
      futures: [],
      code: 'SCRAPE_FAILED',
      error: errorMessage,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getFromCache<T>(cacheMap: Map<string, { expiresAt: number; data: T }>, key: string): T | null {
  const entry = cacheMap.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheMap.delete(key);
    return null;
  }
  return entry.data;
}

function isRateLimitError(message?: string): boolean {
  return !!message && message.toLowerCase().includes('rate limit');
}

function extractRetryAfterSeconds(message?: string): number | null {
  if (!message) return null;
  const match = message.match(/retry after\s*(\d+)s/i) || message.match(/after\s*(\d+)s/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseFuturesFromMarkdown(
  markdown: string,
  symbol: string,
  name: string
): FuturesPricesResponse {
  const futures: FuturesPrice[] = [];

  const lines = markdown.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Look for table data pattern: Contract | Month | Last | Change | %Chg | Open | High | Low | Volume | Open Int | Time
  // The markdown table format may look like:
  // | CLG25 | Feb '25 | 72.50 | +0.45 | +0.62% | 72.00 | 72.80 | 71.50 | 125,432 | 345,678 | 12:30 |
  
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip headers and separator rows
    if (line.includes('Contract') && line.includes('Month')) {
      inTable = true;
      continue;
    }
    
    if (line.startsWith('|--') || line.startsWith('| --')) {
      continue;
    }
    
    // Parse table rows
    if (inTable && line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      
      if (cells.length >= 6) {
        // Extract contract symbol - should match pattern like CLG25, CLH25, etc.
        const contractMatch = cells[0].match(/^([A-Z]{2,4}[FGHJKMNQUVXZ]\d{2})$/);
        if (contractMatch) {
          futures.push({
            contract: cells[0] || '',
            month: cells[1] || '',
            last: cells[2] || '',
            change: cells[3] || '',
            percentChange: cells[4] || '',
            open: cells[5] || '',
            high: cells[6] || '',
            low: cells[7] || '',
            volume: cells[8] || '',
            openInterest: cells[9] || '',
            time: cells[10] || '',
          });
        }
      }
    }
    
    // Also try to parse non-table format (line by line data)
    // Look for patterns like: CLG25 followed by price data
    const contractLineMatch = line.match(/^([A-Z]{2,4}[FGHJKMNQUVXZ]\d{2})$/);
    if (contractLineMatch) {
      const contract = contractLineMatch[1];
      
      // Collect following lines as fields
      const nextLines: string[] = [];
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const nextLine = lines[j];
        // Stop if we hit another contract or section header
        if (/^[A-Z]{2,4}[FGHJKMNQUVXZ]\d{2}$/.test(nextLine) || nextLine.includes('Contract')) {
          break;
        }
        if (nextLine && !nextLine.startsWith('[') && !nextLine.includes('Please wait')) {
          nextLines.push(nextLine);
        }
      }
      
      if (nextLines.length >= 4) {
        // Try to extract month pattern like "Feb '25" or "February 2025"
        const monthLine = nextLines.find(l => /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(l));
        
        futures.push({
          contract,
          month: monthLine || '',
          last: nextLines[0] || '',
          change: nextLines[1] || '',
          percentChange: nextLines[2] || '',
          open: nextLines[3] || '',
          high: nextLines[4] || '',
          low: nextLines[5] || '',
          volume: nextLines[6] || '',
          openInterest: nextLines[7] || '',
          time: nextLines[8] || '',
        });
      }
    }
  }

  // Deduplicate by contract
  const seen = new Set<string>();
  const uniqueFutures = futures.filter(f => {
    if (seen.has(f.contract)) return false;
    seen.add(f.contract);
    return true;
  });

  console.log(`Final count - Futures contracts: ${uniqueFutures.length}`);

  return {
    success: true,
    symbol,
    name,
    futures: uniqueFutures,
  };
}
