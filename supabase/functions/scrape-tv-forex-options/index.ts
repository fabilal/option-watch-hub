import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TVOptionContract {
  strike: number;
  type: 'Call' | 'Put';
  symbol: string;
  expiration: string;
  last: string;
  bid: string;
  ask: string;
  volume: string;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

interface TVOptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  maturities: string[];
  strikes: number[];
  selectedStrike: number | null;
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

// Schema for extracting strikes view data
const strikesViewSchema = {
  type: "object",
  properties: {
    currentStrike: {
      type: "number",
      description: "The currently selected/highlighted strike price shown at the top"
    },
    availableStrikes: {
      type: "array",
      description: "ALL strike prices from the horizontal bar. There can be 100+ strikes. Extract ALL as numbers.",
      items: { type: "number" }
    },
    underlyingPrice: {
      type: "string",
      description: "Current price of the underlying"
    },
    options: {
      type: "array",
      description: "ALL option rows. Each row = different expiration. Extract EVERY row (20-50+ expirations).",
      items: {
        type: "object",
        properties: {
          expiration: { type: "string", description: "Expiration date (e.g., '9 janv. 2026')" },
          symbol: { type: "string", description: "Contract symbol" },
          callBidIV: { type: "number", description: "Call Bid IV %" },
          callAskIV: { type: "number", description: "Call Ask IV %" },
          callRho: { type: "number", description: "Call Rho" },
          callVega: { type: "number", description: "Call Vega" },
          callTheta: { type: "number", description: "Call Theta" },
          callGamma: { type: "number", description: "Call Gamma" },
          callDelta: { type: "number", description: "Call Delta" },
          callPrice: { type: "string", description: "Call Prix/Price" },
          callBid: { type: "string", description: "Call Demande/Bid" },
          callAsk: { type: "string", description: "Call Offre/Ask" },
          callVolume: { type: "string", description: "Call Volume" },
          putVolume: { type: "string", description: "Put Volume" },
          putAsk: { type: "string", description: "Put Offre/Ask" },
          putBid: { type: "string", description: "Put Demande/Bid" },
          putPrice: { type: "string", description: "Put Prix/Price" },
          putDelta: { type: "number", description: "Put Delta" },
          putGamma: { type: "number", description: "Put Gamma" },
          putTheta: { type: "number", description: "Put Theta" },
          putVega: { type: "number", description: "Put Vega" },
          putRho: { type: "number", description: "Put Rho" },
          putBidIV: { type: "number", description: "Put Bid IV %" },
          putAskIV: { type: "number", description: "Put Ask IV %" }
        },
        required: ["expiration"]
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
    const { symbol, exchange, strike, fetchStrikesOnly } = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing symbol' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const exchangeCode = exchange || 'CME';
    const cacheKey = fetchStrikesOnly 
      ? `tv-forex-options-strikes-${exchangeCode}-${symbol}`
      : `tv-forex-options-${exchangeCode}-${symbol}-${strike || 'default'}`;
    
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
        // Use strikes view URL format
        let url = `https://fr.tradingview.com/options/chain/${exchangeCode}-${symbol}/?view=strikes`;
        if (strike) {
          url += `&strike=${strike}`;
        }
        console.log(`[scrape-tv-forex-options] Scraping: ${url}, fetchStrikesOnly: ${fetchStrikesOnly}`);

        // If only fetching strikes list
        if (fetchStrikesOnly) {
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
                  type: "object",
                  properties: {
                    strikes: {
                      type: "array",
                      description: "ALL strike prices from the horizontal selector. 100+ strikes possible. Extract ALL.",
                      items: { type: "number" }
                    },
                    currentStrike: {
                      type: "number", 
                      description: "Currently selected strike"
                    }
                  },
                  required: ["strikes"]
                },
                prompt: `Extract ALL available strike prices from the horizontal bar at the top.
Look for numeric values like 0.50, 1.00, 1.50, 2.00, etc.
These are displayed across the top of the options chain.
Extract EVERY strike - do not skip any.
Also identify which strike is currently selected/highlighted.`
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
            maturities: [],
            strikes: (extractData.strikes || []).filter((s: number) => s > 0).sort((a: number, b: number) => a - b),
            selectedStrike: extractData.currentStrike || null,
            calls: [],
            puts: [],
          };

          console.log(`[scrape-tv-forex-options] Found ${chain.strikes.length} strikes`);
          cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: chain });
          return chain;
        }

        // Full options data extraction
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
              schema: strikesViewSchema,
              prompt: `CRITICAL: Extract ALL option data from this TradingView options chain (STRIKES VIEW).

Page layout:
- Top bar: Strike selector with all available strikes
- Table: CALLS on left | Date d'expiration in middle | PUTS on right
- Each ROW = different expiration date

Call columns (left to right): Bid IV%, Ask IV%, Valeur intr., Valeur temps, Rho, Vega, Theta, Gamma, Delta, Prix, Demande, Offre, Volume
Put columns (left to right): Volume, Offre, Demande, Prix, Delta, Gamma, Theta, Vega, Rho, Valeur temps, Valeur intr., Ask IV%, Bid IV%

Extract:
1. ALL strike prices from top bar
2. Currently selected strike
3. ALL option rows (20-50+ expirations)
4. For each row: Call data, expiration, Put data

Currently viewing strike: ${strike || 'default/ATM'}

French terms: Prix=Price, Demande=Bid, Offre=Ask, Valeur intr.=Intrinsic, Valeur temps=Time Value`
            },
            waitFor: 12000,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[scrape-tv-forex-options] Firecrawl error:`, errorText);
          throw new Error(`Firecrawl error: ${response.status}`);
        }

        const result = await response.json();
        const extractData = result.data?.extract || result.extract || {};
        
        console.log(`[scrape-tv-forex-options] Got ${extractData.options?.length || 0} rows, ${extractData.availableStrikes?.length || 0} strikes`);

        const selectedStrikeValue = strike ? parseFloat(strike) : (extractData.currentStrike || null);
        const options = extractData.options || [];
        
        const calls: TVOptionContract[] = [];
        const puts: TVOptionContract[] = [];
        const maturities: string[] = [];

        for (const opt of options) {
          if (!opt.expiration) continue;
          
          const expDate = opt.expiration;
          if (!maturities.includes(expDate)) {
            maturities.push(expDate);
          }

          // Call option
          const callIV = computeIV(opt.callBidIV, opt.callAskIV);
          if (opt.callPrice || opt.callBid || opt.callAsk || callIV > 0) {
            calls.push({
              strike: selectedStrikeValue || 0,
              type: 'Call',
              symbol: opt.symbol || '',
              expiration: expDate,
              last: normalizePrice(opt.callPrice),
              bid: normalizePrice(opt.callBid),
              ask: normalizePrice(opt.callAsk),
              volume: normalizeVolume(opt.callVolume),
              iv: callIV,
              delta: opt.callDelta || 0,
              gamma: opt.callGamma || 0,
              theta: opt.callTheta || 0,
              vega: opt.callVega || 0,
              rho: opt.callRho || 0,
            });
          }

          // Put option
          const putIV = computeIV(opt.putBidIV, opt.putAskIV);
          if (opt.putPrice || opt.putBid || opt.putAsk || putIV > 0) {
            puts.push({
              strike: selectedStrikeValue || 0,
              type: 'Put',
              symbol: opt.symbol || '',
              expiration: expDate,
              last: normalizePrice(opt.putPrice),
              bid: normalizePrice(opt.putBid),
              ask: normalizePrice(opt.putAsk),
              volume: normalizeVolume(opt.putVolume),
              iv: putIV,
              delta: opt.putDelta || 0,
              gamma: opt.putGamma || 0,
              theta: opt.putTheta || 0,
              vega: opt.putVega || 0,
              rho: opt.putRho || 0,
            });
          }
        }

        const chain: TVOptionsChain = {
          underlyingSymbol: symbol,
          underlyingPrice: extractData.underlyingPrice || '0',
          maturities,
          strikes: (extractData.availableStrikes || []).filter((s: number) => s > 0).sort((a: number, b: number) => a - b),
          selectedStrike: selectedStrikeValue,
          calls,
          puts,
        };

        console.log(`[scrape-tv-forex-options] Final: ${calls.length} calls, ${puts.length} puts, ${maturities.length} maturities`);

        cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: chain });
        return chain;
      } catch (error) {
        console.error(`[scrape-tv-forex-options] Error:`, error);
        cache.set(cacheKey, { expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, data: null });
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

function normalizePrice(val: any): string {
  if (!val) return '0';
  const s = String(val).trim();
  if (s === '—' || s === '-' || s === '−' || s === '') return '0';
  return s.replace(',', '.');
}

function normalizeVolume(val: any): string {
  if (!val) return '0';
  const s = String(val).trim();
  if (s === '—' || s === '-' || s === '−' || s === '') return '0';
  return s.replace(/\s/g, '');
}

function computeIV(bidIV: number | undefined, askIV: number | undefined): number {
  if (bidIV && askIV && bidIV > 0 && askIV > 0) {
    return (bidIV + askIV) / 2;
  }
  return bidIV || askIV || 0;
}
