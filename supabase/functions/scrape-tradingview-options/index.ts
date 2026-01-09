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

interface OptionsChainData {
  underlyingSymbol: string;
  underlyingPrice: string;
  maturities: string[];
  strikes: number[];
  selectedMaturity: string;
  selectedStrike: number | null;
  calls: OptionContract[];
  puts: OptionContract[];
}

interface CacheEntry {
  expiresAt: number;
  data: OptionsChainData | null;
  error?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 30 * 1000;

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
      description: "ALL strike prices shown in the horizontal header bar. There can be 100+ strikes. Extract ALL of them as numbers.",
      items: { type: "number" }
    },
    underlyingPrice: {
      type: "string",
      description: "Current price of the underlying futures contract"
    },
    options: {
      type: "array",
      description: "ALL option rows from the table. Each row represents a different expiration date. Extract EVERY row - there can be 20-50+ expirations.",
      items: {
        type: "object",
        properties: {
          expiration: { type: "string", description: "Expiration date (e.g., '9 janv. 2026' or 'CLG2026')" },
          symbol: { type: "string", description: "Contract symbol if shown" },
          callBidIV: { type: "number", description: "Call Bid IV %" },
          callAskIV: { type: "number", description: "Call Ask IV %" },
          callIntrinsic: { type: "string", description: "Call intrinsic value" },
          callTimeValue: { type: "string", description: "Call time value" },
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
          putTimeValue: { type: "string", description: "Put time value" },
          putIntrinsic: { type: "string", description: "Put intrinsic value" },
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
    const { exchange, symbol, strike, fetchStrikesOnly } = await req.json();

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

    const cacheKey = fetchStrikesOnly 
      ? `tv-options-strikes-${exchange}-${symbol}`
      : `tv-options-${exchange}-${symbol}-${strike || 'default'}`;
    
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log(`Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify({ success: true, data: cached }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (inflight.has(cacheKey)) {
      console.log(`Waiting for inflight request: ${cacheKey}`);
      const result = await inflight.get(cacheKey);
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the strikes view URL format
    let url = `https://fr.tradingview.com/options/chain/${exchange}-${symbol}/?view=strikes`;
    if (strike) {
      url += `&strike=${strike}`;
    }
    console.log(`Scraping TradingView options (strikes view): ${url}`);

    const scrapePromise = (async (): Promise<OptionsChainData | null> => {
      try {
        // If only fetching strikes list, do a quick scrape
        if (fetchStrikesOnly) {
          const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
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
                      description: "ALL strike prices from the horizontal strike selector bar at the top. Extract ALL numeric values - there can be 100+ strikes.",
                      items: { type: "number" }
                    },
                    currentStrike: {
                      type: "number", 
                      description: "The currently selected/highlighted strike"
                    }
                  },
                  required: ["strikes"]
                },
                prompt: `Extract ALL available strike prices from the horizontal bar at the top of the page.
The strikes are shown as numbers like 0.50, 1.00, 1.50, 2.00, ... up to 100+.
Extract EVERY strike shown - do not skip any.
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
          
          const data: OptionsChainData = {
            underlyingSymbol: symbol,
            underlyingPrice: '0',
            maturities: [],
            strikes: (extractData.strikes || []).filter((s: number) => s > 0).sort((a: number, b: number) => a - b),
            selectedMaturity: '',
            selectedStrike: extractData.currentStrike || null,
            calls: [],
            puts: [],
          };

          console.log(`Found ${data.strikes.length} strikes`);
          cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data });
          return data;
        }

        // Full options data extraction for a specific strike
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['extract'],
            extract: {
              schema: strikesViewSchema,
              prompt: `CRITICAL: Extract ALL option data from this TradingView options chain page in STRIKES VIEW.

The page shows options organized by STRIKE (selected at top) with multiple EXPIRATIONS (rows).

Layout:
- Top bar: Strike selector showing all available strikes (0.50, 1.00, 1.50, ... up to 100+)
- Table header row: "Calls" on left, "Date d'expiration" in middle, "Puts" on right
- Column headers (left to right for Calls): Bid IV%, Ask IV%, Valeur intr., Valeur temps, Rho, Vega, Theta, Gamma, Delta, Prix, Demande, Offre, Volume
- Middle column: Date d'expiration (expiration date)
- Column headers (left to right for Puts): Volume, Offre, Demande, Prix, Delta, Gamma, Theta, Vega, Rho, Valeur temps, Valeur intr., Ask IV%, Bid IV%

Extract:
1. ALL strike prices from the top selector bar
2. The currently selected strike
3. ALL option rows - each row is a different expiration date
4. For each row: all Call data (left side), expiration date (middle), all Put data (right side)

There can be 20-50+ expiration dates. Extract EVERY single one.
Currently viewing strike: ${strike || 'default (center/ATM)'}

French column names:
- Prix = Price/Last
- Demande = Bid
- Offre = Ask
- Valeur intr. = Intrinsic Value
- Valeur temps = Time Value`
            },
            waitFor: 12000,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Firecrawl error:', errorText);
          throw new Error(`Firecrawl error: ${response.status}`);
        }

        const result = await response.json();
        const extractData = result.data?.extract || result.extract || {};
        
        console.log(`Extract result: ${extractData.options?.length || 0} option rows, ${extractData.availableStrikes?.length || 0} strikes`);

        const selectedStrikeValue = strike ? parseFloat(strike) : (extractData.currentStrike || null);
        const options = extractData.options || [];
        
        // Convert options to calls and puts arrays
        const calls: OptionContract[] = [];
        const puts: OptionContract[] = [];
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

        const data: OptionsChainData = {
          underlyingSymbol: symbol,
          underlyingPrice: extractData.underlyingPrice || '0',
          maturities,
          strikes: (extractData.availableStrikes || []).filter((s: number) => s > 0).sort((a: number, b: number) => a - b),
          selectedMaturity: '',
          selectedStrike: selectedStrikeValue,
          calls,
          puts,
        };

        console.log(`Parsed: ${calls.length} calls, ${puts.length} puts, ${maturities.length} maturities, ${data.strikes.length} strikes`);

        cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data });
        return data;
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
      JSON.stringify({ success: result !== null, data: result }),
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
  // Remove spaces from numbers like "1 234"
  return s.replace(/\s/g, '');
}

function computeIV(bidIV: number | undefined, askIV: number | undefined): number {
  if (bidIV && askIV && bidIV > 0 && askIV > 0) {
    return (bidIV + askIV) / 2;
  }
  return bidIV || askIV || 0;
}
