import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TVOptionContract {
  strike: number;
  type: 'Call' | 'Put';
  symbol: string;
  last: string;
  change: string;
  changePercent: string;
  bid: string;
  ask: string;
  volume: string;
  openInterest: string;
  iv: number;
}

interface TVOptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  expirationDate: string;
  calls: TVOptionContract[];
  puts: TVOptionContract[];
}

interface CacheEntry {
  expiresAt: number;
  data: TVOptionsChain | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 30 * 1000;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<TVOptionsChain | null>>();

function getFromCache(key: string): TVOptionsChain | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

// Schema for extracting options data
const optionsSchema = {
  type: "object",
  properties: {
    underlyingPrice: {
      type: "string",
      description: "Current price of the underlying futures contract shown at the top"
    },
    expirationDate: {
      type: "string",
      description: "Expiration date of the options"
    },
    calls: {
      type: "array",
      description: "ALL call options from the options chain table",
      items: {
        type: "object",
        properties: {
          strike: { type: "number", description: "Strike price" },
          symbol: { type: "string", description: "Option symbol/name" },
          last: { type: "string", description: "Last traded price" },
          change: { type: "string", description: "Price change" },
          changePercent: { type: "string", description: "Percentage change" },
          bid: { type: "string", description: "Bid price" },
          ask: { type: "string", description: "Ask price" },
          volume: { type: "string", description: "Trading volume" },
          openInterest: { type: "string", description: "Open interest" },
          iv: { type: "number", description: "Implied volatility as percentage" }
        },
        required: ["strike"]
      }
    },
    puts: {
      type: "array",
      description: "ALL put options from the options chain table",
      items: {
        type: "object",
        properties: {
          strike: { type: "number", description: "Strike price" },
          symbol: { type: "string", description: "Option symbol/name" },
          last: { type: "string", description: "Last traded price" },
          change: { type: "string", description: "Price change" },
          changePercent: { type: "string", description: "Percentage change" },
          bid: { type: "string", description: "Bid price" },
          ask: { type: "string", description: "Ask price" },
          volume: { type: "string", description: "Trading volume" },
          openInterest: { type: "string", description: "Open interest" },
          iv: { type: "number", description: "Implied volatility as percentage" }
        },
        required: ["strike"]
      }
    }
  },
  required: ["calls", "puts"]
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, exchange } = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing symbol' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const exchangeCode = exchange || 'CME';
    const cacheKey = `tv-forex-options-${exchangeCode}-${symbol}`;
    
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log(`[scrape-tv-forex-options] Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify({ success: cached !== null, data: cached, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (inflight.has(cacheKey)) {
      console.log(`[scrape-tv-forex-options] Waiting for inflight: ${cacheKey}`);
      const data = await inflight.get(cacheKey);
      return new Response(
        JSON.stringify({ success: data !== null, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      console.error('[scrape-tv-forex-options] FIRECRAWL_API_KEY not set');
      return new Response(
        JSON.stringify({ success: false, error: 'Scraper not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const promise = (async (): Promise<TVOptionsChain | null> => {
      try {
        // TradingView options chain URL
        const url = `https://fr.tradingview.com/symbols/${exchangeCode}-${symbol}/options-chain/`;
        console.log(`[scrape-tv-forex-options] Scraping: ${url}`);

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
              schema: optionsSchema,
              prompt: `IMPORTANT: Extract ALL options from the options chain table. 
Do NOT skip any strikes - include every single row.
The page shows calls and puts for different strikes.
For each option extract: strike, symbol, last price, change, change%, bid, ask, volume, open interest, and implied volatility (IV).
Make sure to capture ALL strikes from the lowest to the highest available.
Extract the underlying price from the top of the page.
The options may be shown in a table format with calls on one side and puts on the other.`
            },
            waitFor: 12000,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[scrape-tv-forex-options] Firecrawl error: ${response.status}`, errorText);
          throw new Error(`Firecrawl error: ${response.status}`);
        }

        const result = await response.json();
        console.log(`[scrape-tv-forex-options] Extract result keys:`, Object.keys(result));
        
        const extractData = result.data?.extract || result.extract || {};
        const callsData = extractData.calls || [];
        const putsData = extractData.puts || [];
        
        console.log(`[scrape-tv-forex-options] Extracted ${callsData.length} calls, ${putsData.length} puts`);

        const chain: TVOptionsChain = {
          underlyingSymbol: symbol,
          underlyingPrice: extractData.underlyingPrice || '0',
          expirationDate: extractData.expirationDate || '',
          calls: callsData.map((opt: any) => ({
            strike: opt.strike || 0,
            type: 'Call' as const,
            symbol: opt.symbol || `${symbol}C${opt.strike}`,
            last: opt.last || '0',
            change: opt.change || '0',
            changePercent: opt.changePercent || '0%',
            bid: opt.bid || '0',
            ask: opt.ask || '0',
            volume: opt.volume || '0',
            openInterest: opt.openInterest || '0',
            iv: opt.iv || 0,
          })).filter((o: TVOptionContract) => o.strike > 0),
          puts: putsData.map((opt: any) => ({
            strike: opt.strike || 0,
            type: 'Put' as const,
            symbol: opt.symbol || `${symbol}P${opt.strike}`,
            last: opt.last || '0',
            change: opt.change || '0',
            changePercent: opt.changePercent || '0%',
            bid: opt.bid || '0',
            ask: opt.ask || '0',
            volume: opt.volume || '0',
            openInterest: opt.openInterest || '0',
            iv: opt.iv || 0,
          })).filter((o: TVOptionContract) => o.strike > 0),
        };

        // Sort by strike
        chain.calls.sort((a, b) => a.strike - b.strike);
        chain.puts.sort((a, b) => a.strike - b.strike);

        console.log(`[scrape-tv-forex-options] Final: ${chain.calls.length} calls, ${chain.puts.length} puts`);

        cache.set(cacheKey, { 
          expiresAt: Date.now() + CACHE_TTL_MS, 
          data: chain 
        });
        
        return chain;
      } catch (error) {
        console.error(`[scrape-tv-forex-options] Error:`, error);
        cache.set(cacheKey, { 
          expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, 
          data: null 
        });
        return null;
      } finally {
        inflight.delete(cacheKey);
      }
    })();

    inflight.set(cacheKey, promise);
    const data = await promise;

    return new Response(
      JSON.stringify({ success: data !== null, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[scrape-tv-forex-options] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
