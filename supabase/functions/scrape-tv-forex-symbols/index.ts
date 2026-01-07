const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TVForexSymbol {
  symbol: string;
  name: string;
  exchange: string;
  price: string;
  change: string;
  changePercent: string;
}

interface CacheEntry {
  data: TVForexSymbol[];
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CacheEntry>();

function getFromCache(key: string): TVForexSymbol[] | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cacheKey = 'tv-forex-symbols';
    
    // Check cache
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log('Returning cached TV forex symbols');
      return new Response(JSON.stringify({ success: true, data: cached }), {
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

    const url = 'https://fr.tradingview.com/markets/futures/quotes-currencies/';
    console.log('Scraping TV forex symbols from:', url);

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
      return new Response(
        JSON.stringify({ success: false, error: result.error || 'Failed to scrape' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = result.data?.markdown || '';
    const symbols = parseSymbolsFromMarkdown(markdown);
    console.log(`Parsed ${symbols.length} TV forex symbols`);

    // Cache the result
    cache.set(cacheKey, { data: symbols, expiresAt: Date.now() + CACHE_TTL_MS });

    return new Response(JSON.stringify({ success: true, data: symbols }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error scraping TV forex symbols:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseSymbolsFromMarkdown(markdown: string): TVForexSymbol[] {
  const symbols: TVForexSymbol[] = [];
  const lines = markdown.split('\n');

  // Parse table rows - looking for pattern like:
  // | ![](...)[ 6A1! ](https://fr.tradingview.com/symbols/CME-6A1!/ "6A1! − Australian Dollar Futures") [Australian Dollar Futures](...) | 0,67245 | −0,13% | −0,00085 | ...
  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('Symbole') || line.includes('---')) continue;

    // Extract symbol code like 6A1!, 6E1!, BTC1!, etc.
    const symbolMatch = line.match(/\[([A-Z0-9]+1!)\]\(https:\/\/fr\.tradingview\.com\/symbols\/([A-Z_]+)-([A-Z0-9]+1!)\/[^)]*\)/i);
    if (!symbolMatch) continue;

    const [, symbol, exchange] = symbolMatch;
    
    // Extract name like "Australian Dollar Futures"
    const nameMatch = line.match(/\[([A-Za-z\s\/\(\)]+(?:Futures|Index|Rate|FX|USD)(?:[^[\]]*)?)\]\(/);
    const name = nameMatch ? nameMatch[1].trim() : symbol;

    // Extract price and changes - columns are: Symbol | Price | Change % | Change | High | Low | Rating
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 4) continue;

    // Price is in column 2 (index 1), Change % in column 3 (index 2), Change in column 4 (index 3)
    const priceCol = cols[1] || '';
    const changePercentCol = cols[2] || '';
    const changeCol = cols[3] || '';

    // Extract numeric price
    const priceMatch = priceCol.match(/[\d.,]+/);
    const price = priceMatch ? priceMatch[0].replace(',', '.') : '0';

    // Extract change percent
    const changePercent = changePercentCol.replace(',', '.').trim();

    // Extract change
    const change = changeCol.replace(',', '.').trim();

    symbols.push({
      symbol,
      name,
      exchange: exchange || 'CME',
      price,
      change,
      changePercent,
    });
  }

  // Remove duplicates by symbol
  const uniqueSymbols = new Map<string, TVForexSymbol>();
  for (const s of symbols) {
    if (!uniqueSymbols.has(s.symbol)) {
      uniqueSymbols.set(s.symbol, s);
    }
  }

  return Array.from(uniqueSymbols.values());
}
