import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TradingView categories mapping
type TVCategory = 'energy' | 'agriculture' | 'metals';

interface TVSymbol {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

interface CacheEntry {
  expiresAt: number;
  data: TVSymbol[];
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<TVSymbol[]>>();

// Static fallback symbols for each category based on TradingView
const FALLBACK_SYMBOLS: Record<TVCategory, TVSymbol[]> = {
  energy: [
    { symbol: 'CL1!', name: 'Crude Oil WTI', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'BZ1!', name: 'Brent Crude Oil', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'NG1!', name: 'Natural Gas', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'RB1!', name: 'RBOB Gasoline', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'HO1!', name: 'Heating Oil', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'QM1!', name: 'E-mini Crude Oil', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'QG1!', name: 'E-mini Natural Gas', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'MCL1!', name: 'Micro WTI Crude Oil', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'MNG1!', name: 'Micro Natural Gas', exchange: 'NYMEX', type: 'futures' },
  ],
  agriculture: [
    { symbol: 'ZC1!', name: 'Corn', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZS1!', name: 'Soybeans', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZW1!', name: 'Wheat', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZM1!', name: 'Soybean Meal', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZL1!', name: 'Soybean Oil', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZO1!', name: 'Oats', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZR1!', name: 'Rough Rice', exchange: 'CBOT', type: 'futures' },
    { symbol: 'KE1!', name: 'KC HRW Wheat', exchange: 'CBOT', type: 'futures' },
    { symbol: 'CT1!', name: 'Cotton', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'KC1!', name: 'Coffee', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'SB1!', name: 'Sugar', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'CC1!', name: 'Cocoa', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'OJ1!', name: 'Orange Juice', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'LE1!', name: 'Live Cattle', exchange: 'CME', type: 'futures' },
    { symbol: 'HE1!', name: 'Lean Hogs', exchange: 'CME', type: 'futures' },
    { symbol: 'GF1!', name: 'Feeder Cattle', exchange: 'CME', type: 'futures' },
  ],
  metals: [
    { symbol: 'GC1!', name: 'Gold', exchange: 'COMEX', type: 'futures' },
    { symbol: 'SI1!', name: 'Silver', exchange: 'COMEX', type: 'futures' },
    { symbol: 'HG1!', name: 'Copper', exchange: 'COMEX', type: 'futures' },
    { symbol: 'PL1!', name: 'Platinum', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'PA1!', name: 'Palladium', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'MGC1!', name: 'Micro Gold', exchange: 'COMEX', type: 'futures' },
    { symbol: 'SIL1!', name: 'Micro Silver', exchange: 'COMEX', type: 'futures' },
    { symbol: 'MHG1!', name: 'Micro Copper', exchange: 'COMEX', type: 'futures' },
    { symbol: 'ALI1!', name: 'Aluminum', exchange: 'COMEX', type: 'futures' },
  ],
};

function getFromCache(key: string): TVSymbol[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category } = await req.json();

    if (!category) {
      return new Response(
        JSON.stringify({ success: false, error: 'Category is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validCategory = category.toLowerCase() as TVCategory;
    if (!['energy', 'agriculture', 'metals'].includes(validCategory)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache first
    const cached = getFromCache(validCategory);
    if (cached) {
      console.log(`Cache hit for category: ${validCategory}`);
      return new Response(
        JSON.stringify({ success: true, data: cached }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check inflight
    if (inflight.has(validCategory)) {
      console.log(`Waiting for inflight request: ${validCategory}`);
      const result = await inflight.get(validCategory);
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For TradingView, we use static symbols since scraping their symbol list is complex
    // The symbols are well-known and stable
    console.log(`Using static symbols for category: ${validCategory}`);
    
    const symbols = FALLBACK_SYMBOLS[validCategory];
    cache.set(validCategory, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: symbols,
    });

    return new Response(
      JSON.stringify({ success: true, data: symbols }),
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
