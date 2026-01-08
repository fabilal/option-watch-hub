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
  delta: string;
  gamma: string;
  theta: string;
}

interface TVOptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  expirationDate: string;
  maturities: string[]; // Available expiration dates
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

// Schema for extracting maturities only (fast call)
const maturitiesSchema = {
  type: "object",
  properties: {
    maturities: {
      type: "array",
      description: "ALL available expiration dates shown in the date selector at the top of the options chain. Extract ALL dates shown (can be 20-50+ dates). Format: 'DD MMM YYYY' or similar",
      items: { type: "string" }
    },
    currentExpiration: {
      type: "string",
      description: "The currently selected/highlighted expiration date"
    }
  },
  required: ["maturities"]
};

// Schema for extracting full options data
const optionsSchema = {
  type: "object",
  properties: {
    underlyingPrice: {
      type: "string",
      description: "Current price of the underlying futures contract"
    },
    expirationDate: {
      type: "string",
      description: "Selected expiration date of the options"
    },
    calls: {
      type: "array",
      description: "ALL call options from the left side of the options chain. Extract EVERY SINGLE ROW - there can be 50-200+ strikes. Do NOT skip any.",
      items: {
        type: "object",
        properties: {
          strike: { type: "number", description: "Strike price (middle column)" },
          theta: { type: "string", description: "Theta value" },
          gamma: { type: "string", description: "Gamma value" },
          delta: { type: "string", description: "Delta value" },
          last: { type: "string", description: "Prix/Last price" },
          bid: { type: "string", description: "Demande/Bid price" },
          ask: { type: "string", description: "Offre/Ask price" },
          volume: { type: "string", description: "Volume" },
          iv: { type: "number", description: "IV % - Implied volatility percentage" }
        },
        required: ["strike"]
      }
    },
    puts: {
      type: "array",
      description: "ALL put options from the right side of the options chain. Extract EVERY SINGLE ROW - there can be 50-200+ strikes. Do NOT skip any.",
      items: {
        type: "object",
        properties: {
          strike: { type: "number", description: "Strike price (middle column)" },
          theta: { type: "string", description: "Theta value" },
          gamma: { type: "string", description: "Gamma value" },
          delta: { type: "string", description: "Delta value" },
          last: { type: "string", description: "Prix/Last price" },
          bid: { type: "string", description: "Demande/Bid price" },
          ask: { type: "string", description: "Offre/Ask price" },
          volume: { type: "string", description: "Volume" },
          iv: { type: "number", description: "IV % - Implied volatility percentage" }
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
    const { symbol, exchange, maturity, fetchMaturitiesOnly } = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing symbol' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const exchangeCode = exchange || 'CME';
    const maturitySuffix = maturity ? `-${maturity.replace(/\s+/g, '_')}` : '';
    const cacheKey = fetchMaturitiesOnly 
      ? `tv-forex-options-maturities-${exchangeCode}-${symbol}`
      : `tv-forex-options-${exchangeCode}-${symbol}${maturitySuffix}`;
    
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
        console.log(`[scrape-tv-forex-options] Scraping: ${url}, maturity: ${maturity || 'default'}, maturitiesOnly: ${fetchMaturitiesOnly}`);

        // If only fetching maturities, use a simpler/faster extraction
        if (fetchMaturitiesOnly) {
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
                schema: maturitiesSchema,
                prompt: `Extract ALL available expiration dates from the options chain page.
Look at the date selector/calendar at the top of the page.
These dates are shown as clickable items (like "14", "15", "16" for days, organized by months).
Convert them to a readable format with full date: "14 Jan 2025", "15 Jan 2025", etc.
Include ALL available dates - there can be 30-50+ dates across multiple months.
Also identify which date is currently selected/highlighted.`
              },
              waitFor: 8000,
            }),
          });

          if (!response.ok) {
            throw new Error(`Firecrawl error: ${response.status}`);
          }

          const result = await response.json();
          const extractData = result.data?.extract || result.extract || {};
          
          const chain: TVOptionsChain = {
            underlyingSymbol: symbol,
            underlyingPrice: '0',
            expirationDate: extractData.currentExpiration || '',
            maturities: extractData.maturities || [],
            calls: [],
            puts: [],
          };

          console.log(`[scrape-tv-forex-options] Found ${chain.maturities.length} maturities`);
          
          cache.set(cacheKey, { 
            expiresAt: Date.now() + CACHE_TTL_MS, 
            data: chain 
          });
          
          return chain;
        }

        // Full options chain extraction
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
              prompt: `CRITICAL: Extract EVERY SINGLE OPTION from the options chain table. Do NOT skip ANY strikes.

The page shows an options chain with:
- CALLS on the LEFT side (columns: Theta, Gamma, Delta, Prix, Demande, Offre, Volume)
- STRIKES in the MIDDLE column
- IV % next to strikes
- PUTS on the RIGHT side (columns: Volume, Offre, Demande, Prix, Delta, Gamma, Theta)

There can be 50-200+ different strike prices. You MUST extract ALL of them.
For each row, extract all available data: strike, theta, gamma, delta, last price (Prix), bid (Demande), ask (Offre), volume, and IV%.

The currently selected maturity is: ${maturity || 'the default/first one shown'}

IMPORTANT: Scroll through the ENTIRE table if needed. Do not stop at the first few rows.`
            },
            waitFor: 15000,
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
          expirationDate: extractData.expirationDate || maturity || '',
          maturities: [], // Will be fetched separately
          calls: callsData.map((opt: any) => ({
            strike: opt.strike || 0,
            type: 'Call' as const,
            symbol: opt.symbol || `${symbol}C${opt.strike}`,
            last: opt.last || opt.prix || '0',
            change: opt.change || '0',
            changePercent: opt.changePercent || '0%',
            bid: opt.bid || opt.demande || '0',
            ask: opt.ask || opt.offre || '0',
            volume: opt.volume || '0',
            openInterest: opt.openInterest || '0',
            iv: opt.iv || 0,
            delta: opt.delta || '0',
            gamma: opt.gamma || '0',
            theta: opt.theta || '0',
          })).filter((o: TVOptionContract) => o.strike > 0),
          puts: putsData.map((opt: any) => ({
            strike: opt.strike || 0,
            type: 'Put' as const,
            symbol: opt.symbol || `${symbol}P${opt.strike}`,
            last: opt.last || opt.prix || '0',
            change: opt.change || '0',
            changePercent: opt.changePercent || '0%',
            bid: opt.bid || opt.demande || '0',
            ask: opt.ask || opt.offre || '0',
            volume: opt.volume || '0',
            openInterest: opt.openInterest || '0',
            iv: opt.iv || 0,
            delta: opt.delta || '0',
            gamma: opt.gamma || '0',
            theta: opt.theta || '0',
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
