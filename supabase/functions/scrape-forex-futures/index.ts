import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FuturesContract {
  symbol: string;
  expiration: string;
  daysLeft: number;
  last: string;
  change: string;
  changePercent: string;
  open: string;
  high: string;
  low: string;
  volume: string;
  openInterest: string;
}

interface CacheEntry {
  expiresAt: number;
  data: FuturesContract[] | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_CACHE_TTL_MS = 30 * 1000; // 30 seconds for errors

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FuturesContract[]>>();

function getFromCache(key: string): FuturesContract[] | null | undefined {
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
    const { exchange, symbol } = await req.json();

    if (!exchange || !symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing exchange or symbol' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const cacheKey = `${exchange}-${symbol}`;
    
    // Check cache first
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log(`[scrape-forex-futures] Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify({ success: cached !== null, data: cached || [], cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check inflight
    if (inflight.has(cacheKey)) {
      console.log(`[scrape-forex-futures] Waiting for inflight request: ${cacheKey}`);
      const data = await inflight.get(cacheKey);
      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      console.error('[scrape-forex-futures] FIRECRAWL_API_KEY not set');
      return new Response(
        JSON.stringify({ success: false, error: 'Scraper not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const promise = (async () => {
      try {
        const url = `https://www.tradingview.com/symbols/${exchange}-${symbol}/futures/`;
        console.log(`[scrape-forex-futures] Scraping: ${url}`);

        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            waitFor: 10000,
          }),
        });

        if (!response.ok) {
          throw new Error(`Firecrawl error: ${response.status}`);
        }

        const result = await response.json();
        const markdown = result.data?.markdown || '';
        
        const contracts = parseContractsFromMarkdown(markdown, symbol);
        
        cache.set(cacheKey, { 
          expiresAt: Date.now() + CACHE_TTL_MS, 
          data: contracts 
        });
        
        return contracts;
      } catch (error) {
        console.error(`[scrape-forex-futures] Error scraping ${cacheKey}:`, error);
        cache.set(cacheKey, { 
          expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, 
          data: null 
        });
        return [];
      } finally {
        inflight.delete(cacheKey);
      }
    })();

    inflight.set(cacheKey, promise);
    const data = await promise;

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[scrape-forex-futures] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function parseContractsFromMarkdown(markdown: string, baseSymbol: string): FuturesContract[] {
  const contracts: FuturesContract[] = [];
  const lines = markdown.split('\n');
  
  // Clean up the base symbol (remove "1!" suffix)
  const cleanBase = baseSymbol.replace(/\d+!$/, '');
  
  // Look for table rows with contract symbols
  const contractRegex = new RegExp(`(${cleanBase}[A-Z]\\d{4})`, 'g');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(contractRegex);
    
    if (matches && matches.length > 0) {
      const contractSymbol = matches[0];
      
      // Parse the line for data
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      
      if (parts.length >= 3) {
        contracts.push({
          symbol: contractSymbol,
          expiration: parts[1] || '',
          daysLeft: parseInt(parts[2]) || 0,
          last: parts[3] || '',
          change: parts[4] || '',
          changePercent: parts[5] || '',
          open: parts[6] || '',
          high: parts[7] || '',
          low: parts[8] || '',
          volume: parts[9] || '',
          openInterest: parts[10] || '',
        });
      }
    }
  }
  
  console.log(`[scrape-forex-futures] Parsed ${contracts.length} contracts`);
  return contracts;
}
