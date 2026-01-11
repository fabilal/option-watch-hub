import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TVForexFutures {
  symbol: string;
  name: string;
  expiration: string;
  price: string;
  change: string;
  changePercent: string;
  high: string;
  low: string;
  rating: string;
}

interface CacheEntry {
  data: TVForexFutures[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_CACHE_TTL_MS = 60 * 1000; // 1 minute for errors
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<TVForexFutures[]>>();

function getFromCache(key: string): TVForexFutures[] | null | undefined {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }
  cache.delete(key);
  return undefined;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { symbol, exchange } = body;

    if (!symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing symbol' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cacheKey = `tv-forex-futures-${exchange}-${symbol}`;
    
    // Check cache
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log('Returning cached TV forex futures for', symbol);
      return new Response(JSON.stringify({ success: true, data: cached || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if request is in flight
    const existing = inflight.get(cacheKey);
    if (existing) {
      const data = await existing;
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fetchPromise = (async (): Promise<TVForexFutures[]> => {
      const exchangeCode = exchange || 'CME';
      const url = `https://fr.tradingview.com/symbols/${exchangeCode}-${symbol}/contracts/`;
      console.log('Scraping TV forex futures from:', url);

      const schema = {
        type: 'object',
        properties: {
          contracts: {
            type: 'array',
            description: 'ALL futures contracts from the contracts table',
            items: {
              type: 'object',
              properties: {
                symbol: { type: 'string', description: 'Contract symbol like 6EF2026, 6CH2026' },
                name: { type: 'string', description: 'Contract name like Euro FX Futures (Jan 2026)' },
                expiration: { type: 'string', description: 'Expiration date like 2026-01-16' },
                price: { type: 'string', description: 'Last price' },
                changePercent: { type: 'string', description: 'Percent change with % sign' },
                change: { type: 'string', description: 'Price change' },
                high: { type: 'string', description: 'High price' },
                low: { type: 'string', description: 'Low price' },
                rating: { type: 'string', description: 'Rating like Sell, Buy, Neutral' },
              },
              required: ['symbol', 'price'],
            },
          },
        },
        required: ['contracts'],
      };

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
            schema,
            prompt: `Extract ALL futures contracts from the contracts table for ${symbol}.
Each row contains: contract symbol (like 6EF2026), name, expiration date, price, change %, change, high, low, and rating.
Extract EVERY contract shown in the table.`,
          },
          onlyMainContent: true,
          waitFor: 5000,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('Firecrawl error:', result);
        throw new Error(result.error || 'Failed to scrape');
      }

      const extractData = result.data?.extract || result.extract || {};
      const rawContracts = extractData.contracts || [];
      
      console.log(`Extracted ${rawContracts.length} contracts from extract`);
      
      // Map to our interface
      const futures: TVForexFutures[] = rawContracts.map((c: any) => ({
        symbol: c.symbol || '',
        name: c.name || c.symbol || '',
        expiration: c.expiration || '',
        price: c.price || '0',
        change: c.change || '0',
        changePercent: c.changePercent || '0%',
        high: c.high || '',
        low: c.low || '',
        rating: c.rating || '',
      })).filter((f: TVForexFutures) => f.symbol && f.price);

      return futures;
    })();

    inflight.set(cacheKey, fetchPromise);

    try {
      const data = await fetchPromise;
      console.log(`Parsed ${data.length} futures contracts for ${symbol}`);
      
      // Cache the result
      cache.set(cacheKey, { 
        data, 
        expiresAt: Date.now() + (data.length > 0 ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS) 
      });

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      inflight.delete(cacheKey);
    }

  } catch (error) {
    console.error('Error scraping TV forex futures:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Function removed - now using extract format instead of markdown parsing
