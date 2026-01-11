import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { saveStrikesToDB } from "../_shared/db-cache.ts";

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

// New interface for strike-based view (all maturities for a strike)
interface TVOptionsByStrike {
  underlyingSymbol: string;
  underlyingPrice: string;
  strike: number;
  maturities: Array<{
    maturity: string; // Expiration date
    maturityCode: string; // Contract code like CLH2026
    call: {
      last: string;
      bid: string;
      ask: string;
      volume: string;
      openInterest: string;
      iv: number;
      delta: string;
      gamma: string;
      theta: string;
    } | null;
    put: {
      last: string;
      bid: string;
      ask: string;
      volume: string;
      openInterest: string;
      iv: number;
      delta: string;
      gamma: string;
      theta: string;
    } | null;
  }>;
}

interface CacheEntry {
  expiresAt: number;
  data: TVOptionsChain | TVOptionsByStrike | null;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<TVOptionsChain | TVOptionsByStrike | null>>();

function getFromCache(key: string): TVOptionsChain | TVOptionsByStrike | null | undefined {
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

// Schema for extracting full options data (by maturity - old mode)
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

// Schema for extracting options by strike (new mode - all maturities for a strike)
const optionsByStrikeSchema = {
  type: "object",
  properties: {
    underlyingPrice: {
      type: "string",
      description: "Current price of the underlying futures contract"
    },
    maturities: {
      type: "array",
      description: "ALL maturities (expiration dates) shown as COLUMNS in the table. Each column represents a different maturity. Extract ALL columns visible.",
      items: {
        type: "object",
        properties: {
          maturityCode: { type: "string", description: "Contract code like CLH2026, CLM2026, CLU2028" },
          maturity: { type: "string", description: "Expiration date like 2026-02-09 or Feb 2026" },
          call: {
            type: "object",
            description: "Call option data for this maturity",
            properties: {
              last: { type: "string", description: "Last price" },
              bid: { type: "string", description: "Bid price" },
              ask: { type: "string", description: "Ask price" },
              volume: { type: "string", description: "Volume" },
              openInterest: { type: "string", description: "Open interest" },
              iv: { type: "number", description: "IV % - Implied volatility percentage" },
              delta: { type: "string", description: "Delta value" },
              gamma: { type: "string", description: "Gamma value" },
              theta: { type: "string", description: "Theta value" }
            }
          },
          put: {
            type: "object",
            description: "Put option data for this maturity",
            properties: {
              last: { type: "string", description: "Last price" },
              bid: { type: "string", description: "Bid price" },
              ask: { type: "string", description: "Ask price" },
              volume: { type: "string", description: "Volume" },
              openInterest: { type: "string", description: "Open interest" },
              iv: { type: "number", description: "IV % - Implied volatility percentage" },
              delta: { type: "string", description: "Delta value" },
              gamma: { type: "string", description: "Gamma value" },
              theta: { type: "string", description: "Theta value" }
            }
          }
        },
        required: ["maturityCode"]
      }
    }
  },
  required: ["maturities"]
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, exchange, maturity, strike, fetchMaturitiesOnly, viewMode } = await req.json();
    
    // Determine view mode: 'strike' (new) or 'maturity' (old)
    const mode = viewMode || (strike !== undefined && strike !== null ? 'strike' : 'maturity');

    if (!symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing symbol' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const exchangeCode = exchange || 'CME';
    
    // Build cache key based on mode
    let cacheKey: string;
    if (fetchMaturitiesOnly) {
      cacheKey = `tv-forex-options-maturities-${exchangeCode}-${symbol}`;
    } else if (mode === 'strike' && strike !== undefined && strike !== null) {
      cacheKey = `tv-forex-options-strike-${exchangeCode}-${symbol}-${strike}`;
    } else {
      const maturitySuffix = maturity ? `-${maturity.replace(/\s+/g, '_')}` : '';
      cacheKey = `tv-forex-options-${exchangeCode}-${symbol}${maturitySuffix}`;
    }
    
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

    const promise = (async (): Promise<TVOptionsChain | TVOptionsByStrike | null> => {
      try {
        let url: string;
        
        // Build URL based on mode
        if (mode === 'strike' && strike !== undefined && strike !== null) {
          // New: View by strike - shows all maturities for the strike
          url = `https://fr.tradingview.com/options/chain/${exchangeCode}-${symbol}/?view=strikes&strike=${strike}`;
          console.log(`[scrape-tv-forex-options] Scraping by STRIKE: ${url}, strike: ${strike}`);
        } else {
          // Old: View by maturity - shows all strikes for the maturity
          url = `https://fr.tradingview.com/symbols/${exchangeCode}-${symbol}/options-chain/`;
          console.log(`[scrape-tv-forex-options] Scraping by MATURITY: ${url}, maturity: ${maturity || 'default'}, maturitiesOnly: ${fetchMaturitiesOnly}`);
        }

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

        // Choose schema and prompt based on mode
        let schema: any;
        let prompt: string;
        
        if (mode === 'strike') {
          // New mode: Extract all maturities for the selected strike
          schema = optionsByStrikeSchema;
          prompt = `CRITICAL: Extract ALL maturities (expiration dates) for strike ${strike}.

The page shows a table with:
- ROWS: "Calls" section on the left, "Puts" section on the right
- COLUMNS: Each column represents a different maturity/expiration date (like CLH2026, CLM2026, CLU2028, etc.)

For EACH maturity column, extract:
- Maturity code (contract symbol like CLH2026)
- Expiration date
- Call option data: Last, Bid, Ask, Volume, Open Interest, IV%, Delta, Gamma, Theta
- Put option data: Last, Bid, Ask, Volume, Open Interest, IV%, Delta, Gamma, Theta

Extract ALL visible maturity columns. There can be 10-30+ different maturities.
If a value is empty or not available, use empty string or 0.`;
        } else {
          // Old mode: Extract all strikes for the selected maturity
          schema = optionsSchema;
          prompt = `CRITICAL: Extract EVERY SINGLE OPTION from the options chain table. Do NOT skip ANY strikes.

The page shows an options chain with:
- CALLS on the LEFT side (columns: Theta, Gamma, Delta, Prix, Demande, Offre, Volume)
- STRIKES in the MIDDLE column
- IV % next to strikes
- PUTS on the RIGHT side (columns: Volume, Offre, Demande, Prix, Delta, Gamma, Theta)

There can be 50-200+ different strike prices. You MUST extract ALL of them.
For each row, extract all available data: strike, theta, gamma, delta, last price (Prix), bid (Demande), ask (Offre), volume, and IV%.

The currently selected maturity is: ${maturity || 'the default/first one shown'}

IMPORTANT: Scroll through the ENTIRE table if needed. Do not stop at the first few rows.`;
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
              schema,
              prompt,
            },
            waitFor: mode === 'strike' ? 8000 : 15000,
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
        
        if (mode === 'strike') {
          // New mode: Return data by strike (all maturities)
          const maturitiesData = extractData.maturities || [];
          console.log(`[scrape-tv-forex-options] Extracted ${maturitiesData.length} maturities for strike ${strike}`);
          
            // Helper to normalize maturity codes (CLG202757 -> CLG2027, CLH202757 -> CLH2027)
            const normalizeMaturityCode = (code: string): string => {
              if (!code) return '';
              // Pattern: CLG202757 -> extract CL (base) + G (month) + 2027 (year, first 4 digits after month)
              // Or: CLG2027 -> already correct
              const match = code.match(/^([A-Z0-9]{2,3})([A-Z])(\d{4,6})/);
              if (match) {
                const base = match[1];      // CL, 6E, etc.
                const month = match[2];     // G, H, F, etc.
                const digits = match[3];    // 202757, 2027, etc.
                
                // Extract year: take first 4 digits
                const year = digits.substring(0, 4);
                
                return `${base}${month}${year}`;
              }
              return code; // Return as-is if pattern doesn't match
            };
            
            const byStrike: TVOptionsByStrike = {
            underlyingSymbol: symbol,
            underlyingPrice: extractData.underlyingPrice || '0',
            strike: strike as number,
            maturities: maturitiesData.map((m: any) => ({
              maturityCode: normalizeMaturityCode(m.maturityCode || ''),
              maturity: m.maturity || '',
              call: m.call ? {
                last: m.call.last || '0',
                bid: m.call.bid || '0',
                ask: m.call.ask || '0',
                volume: m.call.volume || '0',
                openInterest: m.call.openInterest || '0',
                iv: m.call.iv || 0,
                delta: m.call.delta || '0',
                gamma: m.call.gamma || '0',
                theta: m.call.theta || '0',
              } : null,
              put: m.put ? {
                last: m.put.last || '0',
                bid: m.put.bid || '0',
                ask: m.put.ask || '0',
                volume: m.put.volume || '0',
                openInterest: m.put.openInterest || '0',
                iv: m.put.iv || 0,
                delta: m.put.delta || '0',
                gamma: m.put.gamma || '0',
                theta: m.put.theta || '0',
              } : null,
            })).filter((m: any) => m.maturityCode),
          };
          
          console.log(`[scrape-tv-forex-options] Final: ${byStrike.maturities.length} maturities for strike ${strike}`);
          return byStrike;
        } else {
          // Old mode: Return data by maturity (all strikes)
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
          
          // Extract and save strikes to DB (when scraping by maturity)
          const allStrikes = new Set<number>();
          chain.calls.forEach(call => allStrikes.add(call.strike));
          chain.puts.forEach(put => allStrikes.add(put.strike));
          
          if (allStrikes.size > 0) {
            const strikesArray = Array.from(allStrikes).sort((a, b) => a - b);
            console.log(`[scrape-tv-forex-options] Saving ${strikesArray.length} strikes to DB for ${exchangeCode}-${symbol}`);
            await saveStrikesToDB(exchangeCode, symbol, strikesArray).catch(err => {
              console.error('Error saving strikes to DB:', err);
            });
          }
          
          cache.set(cacheKey, { 
            expiresAt: Date.now() + CACHE_TTL_MS, 
            data: chain 
          });
          
          return chain;
        }
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
