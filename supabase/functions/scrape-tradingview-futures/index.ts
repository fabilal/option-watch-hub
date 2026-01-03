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
  error?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const NEGATIVE_CACHE_TTL_MS = 30 * 1000; // 30 seconds

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FuturesContract[] | null>>();

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

    const cacheKey = `${exchange}-${symbol}`;
    
    // Check cache
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log(`Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify({ success: true, data: cached }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check inflight
    if (inflight.has(cacheKey)) {
      console.log(`Waiting for inflight request: ${cacheKey}`);
      const result = await inflight.get(cacheKey);
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build URL: https://fr.tradingview.com/symbols/NYMEX-CL1!/contracts/
    const url = `https://www.tradingview.com/symbols/${exchange}-${symbol}/contracts/`;
    console.log(`Scraping TradingView futures: ${url}`);

    const scrapePromise = (async (): Promise<FuturesContract[] | null> => {
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          console.error('Firecrawl error:', data);
          cache.set(cacheKey, { 
            expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, 
            data: null,
            error: data.error 
          });
          return null;
        }

        const markdown = data.data?.markdown || data.markdown || '';
        console.log('Markdown length:', markdown.length);
        
        const contracts = parseContractsFromMarkdown(markdown, symbol);
        console.log(`Extracted ${contracts.length} contracts from markdown`);

        cache.set(cacheKey, { 
          expiresAt: Date.now() + CACHE_TTL_MS, 
          data: contracts 
        });

        return contracts;
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
      JSON.stringify({ success: true, data: result }),
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

function parseContractsFromMarkdown(markdown: string, baseSymbol: string): FuturesContract[] {
  const contracts: FuturesContract[] = [];
  const lines = markdown.split('\n');
  
  // Clean the base symbol (remove trailing 1! etc)
  const cleanSymbol = baseSymbol.replace(/\d*!$/, '');
  
  // Pattern to match contract symbols like CLG2026, CLH2026, etc.
  const symbolPattern = new RegExp(`\\[${cleanSymbol}[A-Z]\\d{4}\\]`, 'gi');
  
  for (const line of lines) {
    // Only process table rows (starting with |)
    if (!line.startsWith('|')) continue;
    
    const symbolMatch = line.match(symbolPattern);
    if (!symbolMatch) continue;
    
    // Extract the symbol without brackets
    const contractSymbol = symbolMatch[0].replace(/[\[\]]/g, '');
    
    // Split by | to get table cells
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    
    if (cells.length >= 7) {
      // Parse the row - format: Symbol/Name | Expiration | Price | Change% | Change | High | Low | Rating
      const expiration = cells[1] || '';
      const price = cells[2] || '0';
      const changePercent = cells[3] || '0%';
      const change = cells[4] || '0';
      const high = cells[5] || '0';
      const low = cells[6] || '0';
      
      contracts.push({
        symbol: contractSymbol,
        expiration,
        daysLeft: 0, // Calculate from expiration if needed
        last: price,
        change,
        changePercent,
        open: '-',
        high,
        low,
        volume: '-',
        openInterest: '-',
      });
    }
  }
  
  console.log(`Found ${contracts.length} contracts for ${cleanSymbol}`);
  return contracts;
}
