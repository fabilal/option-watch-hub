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
  bid: string;
  ask: string;
  volume: string;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

interface OptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  maturities: string[];
  selectedMaturity: string;
  calls: OptionContract[];
  puts: OptionContract[];
}

interface CacheEntry {
  expiresAt: number;
  data: OptionsChain | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 30 * 1000;

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { exchange, symbol, maturity } = await req.json();

    if (!exchange || !symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing exchange or symbol' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const cacheKey = `${exchange}-${symbol}-${maturity || 'default'}`;
    
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
        const url = `https://www.tradingview.com/symbols/${exchange}-${symbol}/options/chain/`;
        console.log(`[scrape-forex-options] Scraping: ${url}`);

        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            waitFor: 12000,
          }),
        });

        if (!response.ok) {
          throw new Error(`Firecrawl error: ${response.status}`);
        }

        const result = await response.json();
        const markdown = result.data?.markdown || '';
        
        const chain = parseOptionsChain(markdown, symbol, maturity);
        
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

function parseOptionsChain(markdown: string, symbol: string, requestedMaturity?: string): OptionsChain {
  const chain: OptionsChain = {
    underlyingSymbol: symbol,
    underlyingPrice: '0',
    maturities: [],
    selectedMaturity: requestedMaturity || '',
    calls: [],
    puts: [],
  };

  const lines = markdown.split('\n');
  
  // Try to find maturities
  for (const line of lines) {
    // Look for date patterns like "Jan 2025", "Feb 2025", etc.
    const maturityMatches = line.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/gi);
    if (maturityMatches) {
      for (const mat of maturityMatches) {
        if (!chain.maturities.includes(mat)) {
          chain.maturities.push(mat);
        }
      }
    }
  }

  // If no maturities found, add a default
  if (chain.maturities.length === 0) {
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    chain.maturities.push(`${months[now.getMonth()]} ${now.getFullYear()}`);
  }

  chain.selectedMaturity = requestedMaturity || chain.maturities[0] || '';

  // Parse options from table structure
  let inOptionsTable = false;
  let headerParts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect header row
    if (line.includes('Strike') || line.includes('IV') || line.includes('Delta')) {
      inOptionsTable = true;
      headerParts = line.split('|').map(p => p.trim().toLowerCase());
      continue;
    }

    if (!inOptionsTable) continue;

    // Parse data rows
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 5) continue;

    // Try to find strike price
    let strike = 0;
    for (const part of parts) {
      const num = parseFloat(part.replace(/[^\d.]/g, ''));
      if (!isNaN(num) && num > 0 && num < 100) { // Forex strikes are typically < 100
        strike = num;
        break;
      }
    }

    if (strike > 0) {
      const optionBase = {
        strike,
        symbol: `${symbol}_${strike}`,
        last: parts[1] || '0',
        bid: parts[2] || '0',
        ask: parts[3] || '0',
        volume: parts[4] || '0',
        iv: parseFloat(parts[5]?.replace(/[^\d.]/g, '') || '0'),
        delta: parseFloat(parts[6]?.replace(/[^\d.-]/g, '') || '0'),
        gamma: parseFloat(parts[7]?.replace(/[^\d.]/g, '') || '0'),
        theta: parseFloat(parts[8]?.replace(/[^\d.-]/g, '') || '0'),
        vega: parseFloat(parts[9]?.replace(/[^\d.]/g, '') || '0'),
      };

      // Add as both call and put for now (real parsing would differentiate)
      chain.calls.push({ ...optionBase, type: 'Call' });
      chain.puts.push({ ...optionBase, type: 'Put' });
    }
  }

  console.log(`[scrape-forex-options] Parsed ${chain.calls.length} calls, ${chain.puts.length} puts, ${chain.maturities.length} maturities`);
  
  return chain;
}
