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
            formats: [
              {
                type: 'json',
                schema: {
                  type: 'object',
                  properties: {
                    contracts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          symbol: { type: 'string', description: 'Contract symbol like CLH2025' },
                          expiration: { type: 'string', description: 'Expiration date' },
                          daysLeft: { type: 'number', description: 'Days until expiration' },
                          last: { type: 'string', description: 'Last price' },
                          change: { type: 'string', description: 'Price change' },
                          changePercent: { type: 'string', description: 'Percent change' },
                          open: { type: 'string', description: 'Open price' },
                          high: { type: 'string', description: 'High price' },
                          low: { type: 'string', description: 'Low price' },
                          volume: { type: 'string', description: 'Trading volume' },
                          openInterest: { type: 'string', description: 'Open interest' },
                        },
                      },
                    },
                  },
                },
                prompt: `Extract ALL futures contracts from this TradingView page. 
                For each contract row, extract:
                - symbol: The contract symbol (e.g., CLH2025, CLJ2025)
                - expiration: The expiration date
                - daysLeft: Number of days until expiration
                - last: The last traded price
                - change: The price change (can be negative)
                - changePercent: The percentage change
                - open: Opening price
                - high: Daily high
                - low: Daily low
                - volume: Trading volume
                - openInterest: Open interest
                Return ALL contracts visible on the page.`,
              },
              'markdown',
            ],
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

        const jsonData = data.data?.json || data.json;
        let contracts: FuturesContract[] = [];

        if (jsonData?.contracts && Array.isArray(jsonData.contracts)) {
          contracts = jsonData.contracts.filter((c: any) => c.symbol);
          console.log(`Extracted ${contracts.length} contracts from JSON`);
        }

        // Fallback to markdown parsing if JSON extraction failed
        if (contracts.length === 0) {
          const markdown = data.data?.markdown || data.markdown || '';
          contracts = parseContractsFromMarkdown(markdown, symbol);
          console.log(`Extracted ${contracts.length} contracts from markdown`);
        }

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
  
  // Look for table rows with contract data
  const symbolPattern = new RegExp(`${baseSymbol}[A-Z]\\d{4}`, 'gi');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const symbolMatch = line.match(symbolPattern);
    
    if (symbolMatch) {
      // Try to extract data from the line
      const numbers = line.match(/[\d,]+\.?\d*/g) || [];
      const percentMatch = line.match(/[+-]?\d+\.?\d*%/);
      
      contracts.push({
        symbol: symbolMatch[0].toUpperCase(),
        expiration: '',
        daysLeft: parseInt(numbers[0] || '0') || 0,
        last: numbers[1] || '0',
        change: numbers[2] || '0',
        changePercent: percentMatch ? percentMatch[0] : '0%',
        open: numbers[3] || '0',
        high: numbers[4] || '0',
        low: numbers[5] || '0',
        volume: numbers[6] || '0',
        openInterest: numbers[7] || '0',
      });
    }
  }
  
  return contracts;
}
