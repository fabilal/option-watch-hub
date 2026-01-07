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

Deno.serve(async (req) => {
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

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('Firecrawl error:', result);
        throw new Error(result.error || 'Failed to scrape');
      }

      const markdown = result.data?.markdown || '';
      const baseSymbol = symbol.replace(/1!$/, '');
      return parseFuturesFromMarkdown(markdown, baseSymbol);
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

function parseFuturesFromMarkdown(markdown: string, baseSymbol: string): TVForexFutures[] {
  const futures: TVForexFutures[] = [];
  const lines = markdown.split('\n');

  // Pattern: | ![...][ 6EF2026 ](https://...) [Euro FX Futures (Jan 2026)](...) | 2026-01-16 | 1,16900 | −0,06% | −0,00070 | 1,17085 | 1,16830 | Sell |
  const symbolRegex = new RegExp(`\\[(${baseSymbol}[A-Z]\\d{4})\\]\\(https://`, 'i');

  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('Symbole') || line.includes('---')) continue;

    const symbolMatch = line.match(symbolRegex);
    if (!symbolMatch) continue;

    const contractSymbol = symbolMatch[1];
    
    // Extract name like "Euro FX Futures (Jan 2026)"
    const nameMatch = line.match(/\[([^\]]+\(\w+\s+\d{4}\))\]/);
    const name = nameMatch ? nameMatch[1] : contractSymbol;

    // Split by | and extract columns
    // Columns: Symbol | Expiration | Price | Change % | Change | High | Low | Rating
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 7) continue;

    // Find expiration date (format: 2026-01-16)
    const expirationMatch = cols[1]?.match(/(\d{4}-\d{2}-\d{2})/);
    const expiration = expirationMatch ? expirationMatch[1] : '';

    // Price in column 3 (index 2)
    const priceRaw = cols[2] || '';
    const priceMatch = priceRaw.match(/[\d.,]+/);
    const price = priceMatch ? priceMatch[0].replace(',', '.') : '0';

    // Change % in column 4 (index 3)
    const changePercent = (cols[3] || '').replace(',', '.').trim();

    // Change in column 5 (index 4)
    const change = (cols[4] || '').replace(',', '.').trim();

    // High in column 6 (index 5)
    const highRaw = cols[5] || '';
    const highMatch = highRaw.match(/[\d.,]+/);
    const high = highMatch ? highMatch[0].replace(',', '.') : '';

    // Low in column 7 (index 6)
    const lowRaw = cols[6] || '';
    const lowMatch = lowRaw.match(/[\d.,]+/);
    const low = lowMatch ? lowMatch[0].replace(',', '.') : '';

    // Rating in last column
    const rating = cols[7] || '';

    futures.push({
      symbol: contractSymbol,
      name,
      expiration,
      price,
      change,
      changePercent,
      high,
      low,
      rating,
    });
  }

  return futures;
}
