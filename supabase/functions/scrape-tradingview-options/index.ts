import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptionContract {
  strike: number;
  type: 'Call' | 'Put';
  symbol: string;
  last: string;
  change: string;
  bid: string;
  ask: string;
  volume: string;
  openInterest: string;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

interface OptionsChainData {
  underlyingSymbol: string;
  underlyingPrice: string;
  maturities: string[];
  selectedMaturity: string;
  calls: OptionContract[];
  puts: OptionContract[];
}

interface CacheEntry {
  expiresAt: number;
  data: OptionsChainData | null;
  error?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const NEGATIVE_CACHE_TTL_MS = 30 * 1000; // 30 seconds

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OptionsChainData | null>>();

function getFromCache(key: string): OptionsChainData | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { exchange, symbol, maturity } = await req.json();

    if (!exchange || !symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Exchange and symbol are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cacheKey = `${exchange}-${symbol}-${maturity || 'default'}`;
    
    // Check cache
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log(`Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify({ success: true, data: cached }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check inflight
    if (inflight.has(cacheKey)) {
      console.log(`Waiting for inflight request: ${cacheKey}`);
      const result = await inflight.get(cacheKey);
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build URL: https://www.tradingview.com/symbols/NYMEX-CL1!/options-chain/
    let url = `https://www.tradingview.com/symbols/${exchange}-${symbol}/options-chain/`;
    if (maturity) {
      url += `?expiration=${encodeURIComponent(maturity)}`;
    }
    console.log(`Scraping TradingView options: ${url}`);

    const scrapePromise = (async (): Promise<OptionsChainData | null> => {
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: [
              {
                type: 'json',
                schema: {
                  type: 'object',
                  properties: {
                    underlyingSymbol: { type: 'string', description: 'The underlying futures symbol' },
                    underlyingPrice: { type: 'string', description: 'Current price of underlying' },
                    maturities: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: 'List of available expiration dates' 
                    },
                    selectedMaturity: { type: 'string', description: 'Currently selected expiration' },
                    calls: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          strike: { type: 'number', description: 'Strike price' },
                          symbol: { type: 'string', description: 'Option symbol' },
                          last: { type: 'string', description: 'Last price' },
                          change: { type: 'string', description: 'Price change' },
                          bid: { type: 'string', description: 'Bid price' },
                          ask: { type: 'string', description: 'Ask price' },
                          volume: { type: 'string', description: 'Volume' },
                          openInterest: { type: 'string', description: 'Open interest' },
                          iv: { type: 'number', description: 'Implied volatility as decimal' },
                          delta: { type: 'number', description: 'Delta greek' },
                          gamma: { type: 'number', description: 'Gamma greek' },
                          theta: { type: 'number', description: 'Theta greek' },
                          vega: { type: 'number', description: 'Vega greek' },
                        },
                      },
                    },
                    puts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          strike: { type: 'number', description: 'Strike price' },
                          symbol: { type: 'string', description: 'Option symbol' },
                          last: { type: 'string', description: 'Last price' },
                          change: { type: 'string', description: 'Price change' },
                          bid: { type: 'string', description: 'Bid price' },
                          ask: { type: 'string', description: 'Ask price' },
                          volume: { type: 'string', description: 'Volume' },
                          openInterest: { type: 'string', description: 'Open interest' },
                          iv: { type: 'number', description: 'Implied volatility as decimal' },
                          delta: { type: 'number', description: 'Delta greek' },
                          gamma: { type: 'number', description: 'Gamma greek' },
                          theta: { type: 'number', description: 'Theta greek' },
                          vega: { type: 'number', description: 'Vega greek' },
                        },
                      },
                    },
                  },
                },
                prompt: `Extract the complete options chain from this TradingView page.
                
                1. Find the underlying symbol and current price
                2. Extract ALL available expiration dates/maturities from the dropdown or list
                3. For CALLS section, extract each row with:
                   - strike price
                   - option symbol
                   - last price, change, bid, ask
                   - volume, open interest
                   - Greeks: IV (implied volatility as decimal like 0.25 for 25%), delta, gamma, theta, vega
                4. For PUTS section, extract the same fields
                
                Make sure to capture ALL strikes visible on the page.
                Convert percentages to decimals for IV (25% = 0.25).`,
              },
              'markdown',
            ],
            onlyMainContent: true,
            waitFor: 4000,
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          console.error('Firecrawl error:', data);
          cache.set(cacheKey, { 
            expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, 
            data: null,
            error: data.error 
          });
          return null;
        }

        const jsonData = data.data?.json || data.json;
        let optionsData: OptionsChainData | null = null;

        if (jsonData) {
          optionsData = {
            underlyingSymbol: jsonData.underlyingSymbol || symbol,
            underlyingPrice: jsonData.underlyingPrice || '0',
            maturities: jsonData.maturities || [],
            selectedMaturity: jsonData.selectedMaturity || maturity || '',
            calls: (jsonData.calls || []).map((c: any) => ({
              ...c,
              type: 'Call' as const,
              strike: parseFloat(c.strike) || 0,
              iv: parseFloat(c.iv) || 0,
              delta: parseFloat(c.delta) || 0,
              gamma: parseFloat(c.gamma) || 0,
              theta: parseFloat(c.theta) || 0,
              vega: parseFloat(c.vega) || 0,
            })),
            puts: (jsonData.puts || []).map((p: any) => ({
              ...p,
              type: 'Put' as const,
              strike: parseFloat(p.strike) || 0,
              iv: parseFloat(p.iv) || 0,
              delta: parseFloat(p.delta) || 0,
              gamma: parseFloat(p.gamma) || 0,
              theta: parseFloat(p.theta) || 0,
              vega: parseFloat(p.vega) || 0,
            })),
          };
          console.log(`Extracted ${optionsData.calls.length} calls and ${optionsData.puts.length} puts`);
        }

        // Fallback: try markdown parsing
        if (!optionsData || (optionsData.calls.length === 0 && optionsData.puts.length === 0)) {
          const markdown = data.data?.markdown || data.markdown || '';
          const parsed = parseOptionsFromMarkdown(markdown, symbol);
          if (parsed.calls.length > 0 || parsed.puts.length > 0) {
            optionsData = parsed;
            console.log(`Parsed from markdown: ${optionsData.calls.length} calls, ${optionsData.puts.length} puts`);
          }
        }

        cache.set(cacheKey, { 
          expiresAt: Date.now() + CACHE_TTL_MS, 
          data: optionsData 
        });

        return optionsData;
      } catch (err) {
        console.error('Scrape error:', err);
        cache.set(cacheKey, { 
          expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, 
          data: null,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
        return null;
      } finally {
        inflight.delete(cacheKey);
      }
    })();

    inflight.set(cacheKey, scrapePromise);
    const result = await scrapePromise;

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Handler error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseOptionsFromMarkdown(markdown: string, symbol: string): OptionsChainData {
  const result: OptionsChainData = {
    underlyingSymbol: symbol,
    underlyingPrice: '0',
    maturities: [],
    selectedMaturity: '',
    calls: [],
    puts: [],
  };

  const lines = markdown.split('\n');
  let inCalls = false;
  let inPuts = false;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('call')) {
      inCalls = true;
      inPuts = false;
    } else if (lowerLine.includes('put')) {
      inPuts = true;
      inCalls = false;
    }

    // Look for strike prices (numbers with decimals)
    const strikeMatch = line.match(/\b(\d+(?:\.\d+)?)\b/);
    if (strikeMatch) {
      const strike = parseFloat(strikeMatch[1]);
      if (strike > 0 && strike < 100000) {
        const numbers = line.match(/[\d,]+\.?\d*/g) || [];
        
        const option: OptionContract = {
          strike,
          type: inPuts ? 'Put' : 'Call',
          symbol: '',
          last: numbers[1] || '0',
          change: '0',
          bid: numbers[2] || '0',
          ask: numbers[3] || '0',
          volume: numbers[4] || '0',
          openInterest: numbers[5] || '0',
          iv: 0,
          delta: 0,
          gamma: 0,
          theta: 0,
          vega: 0,
        };

        if (inPuts) {
          result.puts.push(option);
        } else if (inCalls) {
          result.calls.push(option);
        }
      }
    }
  }

  return result;
}
