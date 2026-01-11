import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getStrikesFromDB } from "../_shared/db-cache.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { exchange, symbol } = await req.json();

    if (!exchange || !symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Exchange and symbol are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[get-strikes] Fetching strikes for ${exchange}-${symbol}`);
    const strikes = await getStrikesFromDB(exchange, symbol);
    console.log(`[get-strikes] Found ${strikes.length} strikes for ${exchange}-${symbol}`);

    return new Response(
      JSON.stringify({ success: true, data: strikes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[get-strikes] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

