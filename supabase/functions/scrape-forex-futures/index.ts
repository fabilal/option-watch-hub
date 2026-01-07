import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FuturesContract {
  symbol: string;
  expiration: string;
  last: string;
  change: string;
  changePercent: string;
  open: string;
  high: string;
  low: string;
  volume: string;
  openInterest: string;
}

interface CacheEntry {
  expiresAt: number;
  data: FuturesContract[] | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_CACHE_TTL_MS = 30 * 1000; // 30 seconds for errors

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FuturesContract[]>>();

function getFromCache(key: string): FuturesContract[] | null | undefined {
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
    const { symbol } = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing symbol' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const cacheKey = `forex-${symbol}`;
    
    // Check cache first
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log(`[scrape-forex-futures] Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify({ success: cached !== null, data: cached || [], cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check inflight
    if (inflight.has(cacheKey)) {
      console.log(`[scrape-forex-futures] Waiting for inflight request: ${cacheKey}`);
      const data = await inflight.get(cacheKey);
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      console.error('[scrape-forex-futures] FIRECRAWL_API_KEY not set');
      return new Response(
        JSON.stringify({ success: false, error: 'Scraper not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const promise = (async () => {
      try {
        const url = `https://www.barchart.com/futures/quotes/${symbol}*0/futures-prices`;
        console.log(`[scrape-forex-futures] Scraping with extract: ${url}`);

        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({
            url,
            formats: ['extract'],
            extract: {
              schema: {
                type: 'object',
                properties: {
                  contracts: {
                    type: 'array',
                    description: 'List of all futures contracts from the table',
                    items: {
                      type: 'object',
                      properties: {
                        symbol: { type: 'string', description: 'Contract symbol like E6H26, B6M26' },
                        month: { type: 'string', description: 'Contract month like Jan 26, Feb 26, Mar 26' },
                        last: { type: 'string', description: 'Last traded price' },
                        change: { type: 'string', description: 'Price change (can be negative)' },
                        percentChange: { type: 'string', description: 'Percent change with % sign' },
                        open: { type: 'string', description: 'Opening price' },
                        high: { type: 'string', description: 'High price' },
                        low: { type: 'string', description: 'Low price' },
                        volume: { type: 'string', description: 'Trading volume' },
                        openInterest: { type: 'string', description: 'Open interest' },
                      },
                      required: ['symbol', 'last'],
                    },
                  },
                },
                required: ['contracts'],
              },
              prompt: `Extract all futures contracts from the price table. Each row has: contract symbol (like ${symbol}H26), month (like Jan 26), last price, change, percent change, open, high, low, volume, and open interest. Extract numeric values accurately.`,
            },
            waitFor: 8000,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[scrape-forex-futures] Firecrawl error: ${response.status}`, errorText);
          throw new Error(`Firecrawl error: ${response.status}`);
        }

        const result = await response.json();
        console.log(`[scrape-forex-futures] Raw extract result keys:`, Object.keys(result.data || {}));
        
        const extractedData = result.data?.extract || result.extract || {};
        const rawContracts = extractedData.contracts || [];
        
        console.log(`[scrape-forex-futures] Extracted ${rawContracts.length} contracts`);

        // Map to our interface
        const contracts: FuturesContract[] = rawContracts.map((c: Record<string, string>) => ({
          symbol: c.symbol || '',
          expiration: c.month || '',
          last: c.last || '',
          change: c.change || '',
          changePercent: c.percentChange || c.percent_change || '',
          open: c.open || '',
          high: c.high || '',
          low: c.low || '',
          volume: c.volume || '',
          openInterest: c.openInterest || c.open_interest || '',
        })).filter((c: FuturesContract) => c.symbol && c.last);

        // Remove duplicates
        const seen = new Set<string>();
        const unique = contracts.filter((c: FuturesContract) => {
          if (seen.has(c.symbol)) return false;
          seen.add(c.symbol);
          return true;
        });

        console.log(`[scrape-forex-futures] Final ${unique.length} unique contracts`);
        if (unique.length > 0) {
          console.log(`[scrape-forex-futures] Sample:`, JSON.stringify(unique[0]));
        }
        
        cache.set(cacheKey, { 
          expiresAt: Date.now() + CACHE_TTL_MS, 
          data: unique 
        });
        
        return unique;
      } catch (error) {
        console.error(`[scrape-forex-futures] Error scraping ${cacheKey}:`, error);
        cache.set(cacheKey, { 
          expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, 
          data: null 
        });
        return [];
      } finally {
        inflight.delete(cacheKey);
      }
    })();

    inflight.set(cacheKey, promise);
    const data = await promise;

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[scrape-forex-futures] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
