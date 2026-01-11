import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSymbolsFromDB, saveSymbolsToDB } from "../_shared/db-cache.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FuturesSymbol {
  symbol: string;
  name: string;
  latest: string;
  change: string;
  volume: string;
}

type SymbolsCacheEntry = {
  expiresAt: number;
  data: { success: boolean; category: string; symbols: FuturesSymbol[]; error?: string; code?: 'RATE_LIMIT' | 'SCRAPE_FAILED'; retryAfterSeconds?: number };
};

const SYMBOLS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SYMBOLS_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const symbolsCache = new Map<string, SymbolsCacheEntry>();
const symbolsInflight = new Map<string, Promise<SymbolsCacheEntry['data']>>();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category, forceRefresh } = await req.json();

    if (!category) {
      return new Response(
        JSON.stringify({ success: false, error: 'Category is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const categoryUrls: Record<string, string> = {
      energies: 'https://www.barchart.com/futures/energies',
      grains: 'https://www.barchart.com/futures/grains',
      metals: 'https://www.barchart.com/futures/metals',
      softs: 'https://www.barchart.com/futures/softs',
    };

    const url = categoryUrls[category.toLowerCase()];
    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid category: ${category}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scraping symbols for category: ${category}`);
    console.log(`URL: ${url}`);

    const cacheKey = category.toLowerCase();
    
    if (!forceRefresh) {
      // 1. Check in-memory cache first (fastest)
      const cached = getFromCache(symbolsCache, cacheKey);
      if (cached) {
        console.log(`[scrape-barchart-symbols] In-memory cache hit for symbols: ${cacheKey} (skipping DB save)`);
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 2. Check DB cache (persistent)
      const dbCached = await getSymbolsFromDB(cacheKey);
      if (dbCached && dbCached.symbols.length > 0) {
        console.log(`[scrape-barchart-symbols] DB cache hit for symbols: ${cacheKey} (${dbCached.symbols.length} symbols)`);
        
        // Also update in-memory cache for faster next access
        symbolsCache.set(cacheKey, {
          expiresAt: Date.now() + SYMBOLS_CACHE_TTL_MS,
          data: dbCached,
        });
        
        return new Response(JSON.stringify({
          ...dbCached,
          fromDBCache: true,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.log(`[scrape-barchart-symbols] forceRefresh=true, skipping cache for ${cacheKey}`);
    }
    
    console.log(`[scrape-barchart-symbols] No cache found (or forceRefresh), will scrape for ${cacheKey}...`);

    const existingPromise = symbolsInflight.get(cacheKey);
    const isOwner = !existingPromise;

    const workPromise =
      existingPromise ??
      (async (): Promise<SymbolsCacheEntry['data']> => {
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: false,
            waitFor: 3000,
          }),
        });

        const scrapeData = await scrapeResponse.json();

        if (!scrapeResponse.ok || !scrapeData.success) {
          const msg: string | undefined = scrapeData?.error;
          const isRateLimit = isRateLimitError(msg);
          const retryAfterSeconds = isRateLimit ? extractRetryAfterSeconds(msg) ?? undefined : undefined;

          console.error('Firecrawl scrape error:', scrapeData);

          return {
            success: false,
            category,
            symbols: [],
            code: isRateLimit ? 'RATE_LIMIT' : 'SCRAPE_FAILED',
            retryAfterSeconds,
            error: msg || `Failed to scrape Barchart ${category} page`,
          };
        }

        console.log('Scrape successful, parsing symbols...');

        const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
        const symbols = parseSymbolsFromContent(markdown, category);

        console.log(`[scrape-barchart-symbols] Parsed ${symbols.length} symbols for ${category}`);
        if (symbols.length === 0) {
          console.warn(`[scrape-barchart-symbols] WARNING: No symbols parsed for category ${category}! Markdown length: ${markdown.length}`);
          console.log(`[scrape-barchart-symbols] Markdown preview (first 1000 chars):`, markdown.substring(0, 1000));
        } else {
          console.log(`[scrape-barchart-symbols] First 3 symbols:`, symbols.slice(0, 3).map(s => `${s.symbol} (${s.name})`).join(', '));
        }

        const result = {
          success: true,
          category,
          symbols,
        };

        // Save to DB cache for persistence (async, don't wait)
        if (symbols.length > 0) {
          console.log(`[scrape-barchart-symbols] Attempting to save ${symbols.length} symbols to DB for category: ${category}`);
          saveSymbolsToDB(category, symbols, 7)
            .then((success) => {
              if (success) {
                console.log(`[scrape-barchart-symbols] ✅ Successfully saved ${symbols.length} symbols to DB for category: ${category}`);
              } else {
                console.error(`[scrape-barchart-symbols] ❌ Failed to save symbols to DB for category: ${category} (saveSymbolsToDB returned false)`);
              }
            })
            .catch((err) => {
              console.error('[scrape-barchart-symbols] ❌ Error saving symbols to DB (non-blocking):', err);
            });
        } else {
          console.warn(`[scrape-barchart-symbols] ⚠️ Skipping DB save: symbols.length is 0 for category: ${category}`);
        }

        return result;
      })();

    if (isOwner) {
      symbolsInflight.set(cacheKey, workPromise);
    }

    try {
      const payload = await workPromise;

      symbolsCache.set(cacheKey, {
        expiresAt: Date.now() + (payload.success ? SYMBOLS_CACHE_TTL_MS : SYMBOLS_NEGATIVE_CACHE_TTL_MS),
        data: payload,
      });

      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      if (isOwner) {
        symbolsInflight.delete(cacheKey);
      }
    }

  } catch (error) {
    // IMPORTANT: always return 200 so the client can read the payload
    console.error('Error in scrape-barchart-symbols:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    return new Response(
      JSON.stringify({
        success: false,
        category: '',
        symbols: [],
        code: 'SCRAPE_FAILED',
        error: errorMessage,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getFromCache<T>(cache: Map<string, { expiresAt: number; data: T }>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function isRateLimitError(message?: string): boolean {
  return !!message && message.toLowerCase().includes('rate limit');
}

function extractRetryAfterSeconds(message?: string): number | null {
  if (!message) return null;
  const match = message.match(/retry after\s*(\d+)s/i) || message.match(/after\s*(\d+)s/i);
  return match ? Number.parseInt(match[1], 10) : null;
}


function parseSymbolsFromContent(markdown: string, category: string): FuturesSymbol[] {
  const symbols: FuturesSymbol[] = [];
  const seenSymbols = new Set<string>();
  
  // Pattern 1: [CLG26](url) followed by [Crude Oil WTI (Feb '26)](url)
  // Match: [SYMBOL](url)\n\n[Name (Month 'Year)](url)
  const lines = markdown.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for symbol links like [CLG26](https://www.barchart.com/futures/quotes/CLG26/overview)
    const symbolMatch = line.match(/^\[([A-Z]{2,4})([FGHJKMNQUVXZ])(\d{2})\]\(https:\/\/www\.barchart\.com\/futures\/quotes\//);
    
    if (symbolMatch) {
      const baseSymbol = symbolMatch[1];
      
      if (!seenSymbols.has(baseSymbol)) {
        // Look ahead for the name in the next few lines
        let name = '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          // Match: [Crude Oil WTI (Feb '26)](url) or [Name (Month 'Year)](url)
          const nameMatch = nextLine.match(/^\[([^\]]+)\s*\([^)]+\)\]\(/);
          if (nameMatch) {
            name = nameMatch[1].trim();
            break;
          }
        }
        
        if (name) {
          seenSymbols.add(baseSymbol);
          symbols.push({
            symbol: baseSymbol,
            name: name,
            latest: '',
            change: '',
            volume: '',
          });
        }
      }
    }
  }
  
  // If parsing failed, return empty (no fallback mock data)
  if (symbols.length === 0) {
    console.log('No symbols parsed for', category);
  }
  
  return symbols;
}
