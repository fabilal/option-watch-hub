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
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  volume: string;
  openInterest: string;
}

interface OptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  futuresContract: string;
  daysToExpiration: number;
  calls: OptionContract[];
  puts: OptionContract[];
}

interface CacheEntry {
  expiresAt: number;
  data: OptionsChain | null;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OptionsChain | null>>();

function getFromCache(key: string): OptionsChain | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

// Schema for Firecrawl extract
const optionsSchema = {
  type: "object",
  properties: {
    underlyingPrice: {
      type: "string",
      description: "Current price of the underlying futures contract"
    },
    daysToExpiration: {
      type: "number",
      description: "Days until options expiration"
    },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          strike: { type: "number", description: "Strike price" },
          callLast: { type: "string", description: "Call option last price" },
          callIV: { type: "number", description: "Call implied volatility as percentage" },
          callDelta: { type: "number", description: "Call delta" },
          callGamma: { type: "number", description: "Call gamma" },
          callTheta: { type: "number", description: "Call theta" },
          callVega: { type: "number", description: "Call vega" },
          callVolume: { type: "string", description: "Call volume" },
          callOI: { type: "string", description: "Call open interest" },
          putLast: { type: "string", description: "Put option last price" },
          putIV: { type: "number", description: "Put implied volatility as percentage" },
          putDelta: { type: "number", description: "Put delta" },
          putGamma: { type: "number", description: "Put gamma" },
          putTheta: { type: "number", description: "Put theta" },
          putVega: { type: "number", description: "Put vega" },
          putVolume: { type: "string", description: "Put volume" },
          putOI: { type: "string", description: "Put open interest" },
        },
        required: ["strike"]
      }
    }
  },
  required: ["options"]
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { futuresContract, symbol } = await req.json();

    // Accept either futuresContract (like "E6H26") or symbol
    const contractSymbol = futuresContract || symbol;

    if (!contractSymbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing futuresContract or symbol' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const cacheKey = `barchart-options-${contractSymbol}`;
    
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log(`[scrape-forex-options] Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify({ success: cached !== null, data: cached, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (inflight.has(cacheKey)) {
      console.log(`[scrape-forex-options] Waiting for inflight: ${cacheKey}`);
      const data = await inflight.get(cacheKey);
      return new Response(
        JSON.stringify({ success: data !== null, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      console.error('[scrape-forex-options] FIRECRAWL_API_KEY not set');
      return new Response(
        JSON.stringify({ success: false, error: 'Scraper not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const promise = (async (): Promise<OptionsChain | null> => {
      try {
        // Barchart options URL with volatility-greeks view
        const url = `https://www.barchart.com/futures/quotes/${contractSymbol}/volatility-greeks?futuresOptionsView=merged&moneyness=allRows`;
        console.log(`[scrape-forex-options] Scraping: ${url}`);

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
              prompt: `IMPORTANT: Extract ALL option strikes from the volatility-greeks table - there can be 50-200+ rows. Do NOT skip any strikes. 
The table structure is: Call data columns | Strike | Put data columns.
For EVERY single row in the table, extract:
- Strike price (center column)
- Call side: Last, IV%, Delta, Gamma, Theta, Vega, Volume, Open Interest
- Put side: Last, IV%, Delta, Gamma, Theta, Vega, Volume, Open Interest
Extract the complete list from the first strike to the last strike. Include ALL rows even if some values are empty or zero.
Also extract the underlying futures price shown at the top and days to expiration.`
            },
            waitFor: 12000,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[scrape-forex-options] Firecrawl error: ${response.status}`, errorText);
          throw new Error(`Firecrawl error: ${response.status}`);
        }

        const result = await response.json();
        console.log(`[scrape-forex-options] Extract result keys:`, Object.keys(result));
        
        const extractData = result.data?.extract || result.extract || {};
        const optionsData = extractData.options || [];
        
        console.log(`[scrape-forex-options] Extracted ${optionsData.length} option rows`);

        const chain: OptionsChain = {
          underlyingSymbol: contractSymbol.substring(0, 2), // E6, B6, etc.
          underlyingPrice: extractData.underlyingPrice || '0',
          futuresContract: contractSymbol,
          daysToExpiration: extractData.daysToExpiration || 0,
          calls: [],
          puts: [],
        };

        for (const opt of optionsData) {
          if (!opt.strike || opt.strike <= 0) continue;

          // Add call option
          chain.calls.push({
            strike: opt.strike,
            type: 'Call',
            symbol: `${contractSymbol}C${opt.strike}`,
            last: opt.callLast || '0',
            iv: opt.callIV || 0,
            delta: opt.callDelta || 0,
            gamma: opt.callGamma || 0,
            theta: opt.callTheta || 0,
            vega: opt.callVega || 0,
            volume: opt.callVolume || '0',
            openInterest: opt.callOI || '0',
          });

          // Add put option
          chain.puts.push({
            strike: opt.strike,
            type: 'Put',
            symbol: `${contractSymbol}P${opt.strike}`,
            last: opt.putLast || '0',
            iv: opt.putIV || 0,
            delta: opt.putDelta || 0,
            gamma: opt.putGamma || 0,
            theta: opt.putTheta || 0,
            vega: opt.putVega || 0,
            volume: opt.putVolume || '0',
            openInterest: opt.putOI || '0',
          });
        }

        // Sort by strike
        chain.calls.sort((a, b) => a.strike - b.strike);
        chain.puts.sort((a, b) => a.strike - b.strike);

        console.log(`[scrape-forex-options] Final: ${chain.calls.length} calls, ${chain.puts.length} puts`);

        if (optionsData.length > 0) {
          console.log(`[scrape-forex-options] Sample:`, JSON.stringify(optionsData[0]));
        }

        cache.set(cacheKey, { 
          expiresAt: Date.now() + CACHE_TTL_MS, 
          data: chain 
        });
        
        return chain;
      } catch (error) {
        console.error(`[scrape-forex-options] Error:`, error);
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
    console.error('[scrape-forex-options] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
