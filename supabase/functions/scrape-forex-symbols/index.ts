import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ForexCategory = 'majors' | 'minors' | 'exotics';

interface ForexSymbol {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

// Static forex symbols - Barchart format (CME currency futures)
const FOREX_SYMBOLS: Record<ForexCategory, ForexSymbol[]> = {
  majors: [
    { symbol: 'E6', name: 'Euro FX', exchange: 'CME', type: 'futures' },
    { symbol: 'B6', name: 'British Pound', exchange: 'CME', type: 'futures' },
    { symbol: 'J6', name: 'Japanese Yen', exchange: 'CME', type: 'futures' },
    { symbol: 'D6', name: 'Canadian Dollar', exchange: 'CME', type: 'futures' },
    { symbol: 'A6', name: 'Australian Dollar', exchange: 'CME', type: 'futures' },
    { symbol: 'S6', name: 'Swiss Franc', exchange: 'CME', type: 'futures' },
  ],
  minors: [
    { symbol: 'N6', name: 'New Zealand Dollar', exchange: 'CME', type: 'futures' },
    { symbol: 'M6', name: 'Mexican Peso', exchange: 'CME', type: 'futures' },
    { symbol: 'L6', name: 'Brazilian Real', exchange: 'CME', type: 'futures' },
    { symbol: 'RA', name: 'South African Rand', exchange: 'CME', type: 'futures' },
  ],
  exotics: [
    { symbol: 'DX', name: 'US Dollar Index', exchange: 'ICE', type: 'futures' },
    { symbol: 'BTC', name: 'Bitcoin Futures', exchange: 'CME', type: 'crypto' },
    { symbol: 'ETH', name: 'Ether Futures', exchange: 'CME', type: 'crypto' },
  ],
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category } = await req.json();
    
    if (!category || !FOREX_SYMBOLS[category as ForexCategory]) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid category. Must be one of: majors, minors, exotics' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const symbols = FOREX_SYMBOLS[category as ForexCategory];
    
    console.log(`[scrape-forex-symbols] Returning ${symbols.length} symbols for category: ${category}`);

    return new Response(
      JSON.stringify({ success: true, data: symbols }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[scrape-forex-symbols] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
