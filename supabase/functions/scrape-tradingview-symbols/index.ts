import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSymbolsFromDB, saveSymbolsToDB } from "../_shared/db-cache.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TradingView categories mapping
type TVCategory = 'energy' | 'agriculture' | 'metals';

interface TVSymbol {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

interface CacheEntry {
  expiresAt: number;
  data: TVSymbol[];
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<TVSymbol[]>>();

// Category URL mapping
const CATEGORY_URLS: Record<TVCategory, string> = {
  energy: 'https://fr.tradingview.com/markets/futures/quotes-energy/',
  agriculture: 'https://fr.tradingview.com/markets/futures/quotes-agriculture/',
  metals: 'https://fr.tradingview.com/markets/futures/quotes-metals/',
};

// Fallback symbols - used if scraping fails or returns empty
// These will be saved to DB for future use
const FALLBACK_SYMBOLS: Record<TVCategory, TVSymbol[]> = {
  energy: [
    { symbol: 'CL1!', name: 'Crude Oil WTI', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'BZ1!', name: 'Brent Crude Oil', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'NG1!', name: 'Natural Gas', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'RB1!', name: 'RBOB Gasoline', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'HO1!', name: 'Heating Oil', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'QM1!', name: 'E-mini Crude Oil', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'QG1!', name: 'E-mini Natural Gas', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'MCL1!', name: 'Micro WTI Crude Oil', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'MNG1!', name: 'Micro Natural Gas', exchange: 'NYMEX', type: 'futures' },
  ],
  agriculture: [
    { symbol: 'ZC1!', name: 'Corn', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZS1!', name: 'Soybeans', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZW1!', name: 'Wheat', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZM1!', name: 'Soybean Meal', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZL1!', name: 'Soybean Oil', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZO1!', name: 'Oats', exchange: 'CBOT', type: 'futures' },
    { symbol: 'ZR1!', name: 'Rough Rice', exchange: 'CBOT', type: 'futures' },
    { symbol: 'KE1!', name: 'KC HRW Wheat', exchange: 'CBOT', type: 'futures' },
    { symbol: 'CT1!', name: 'Cotton', exchange: 'ICE', type: 'futures' },
    { symbol: 'KC1!', name: 'Coffee', exchange: 'ICE', type: 'futures' },
    { symbol: 'SB1!', name: 'Sugar', exchange: 'ICE', type: 'futures' },
    { symbol: 'CC1!', name: 'Cocoa', exchange: 'ICE', type: 'futures' },
    { symbol: 'OJ1!', name: 'Orange Juice', exchange: 'ICE', type: 'futures' },
    { symbol: 'LE1!', name: 'Live Cattle', exchange: 'CME', type: 'futures' },
    { symbol: 'HE1!', name: 'Lean Hogs', exchange: 'CME', type: 'futures' },
    { symbol: 'GF1!', name: 'Feeder Cattle', exchange: 'CME', type: 'futures' },
  ],
  metals: [
    { symbol: 'GC1!', name: 'Gold', exchange: 'COMEX', type: 'futures' },
    { symbol: 'SI1!', name: 'Silver', exchange: 'COMEX', type: 'futures' },
    { symbol: 'HG1!', name: 'Copper', exchange: 'COMEX', type: 'futures' },
    { symbol: 'PL1!', name: 'Platinum', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'PA1!', name: 'Palladium', exchange: 'NYMEX', type: 'futures' },
    { symbol: 'MGC1!', name: 'Micro Gold', exchange: 'COMEX', type: 'futures' },
    { symbol: 'SIL1!', name: 'Micro Silver', exchange: 'COMEX', type: 'futures' },
    { symbol: 'MHG1!', name: 'Micro Copper', exchange: 'COMEX', type: 'futures' },
    { symbol: 'ALI1!', name: 'Aluminum', exchange: 'COMEX', type: 'futures' },
  ],
};

// Helper to map category to DB storage key
function getCategoryDBKey(category: TVCategory): string {
  return `tradingview-${category}`;
}

function getFromCache(key: string): TVSymbol[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category } = await req.json();

    if (!category) {
      return new Response(
        JSON.stringify({ success: false, error: 'Category is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validCategory = category.toLowerCase() as TVCategory;
    if (!['energy', 'agriculture', 'metals'].includes(validCategory)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('[scrape-tradingview-symbols] FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Check in-memory cache first (fastest)
    const cached = getFromCache(validCategory);
    if (cached) {
      console.log(`[scrape-tradingview-symbols] In-memory cache hit for category: ${validCategory}`);
      return new Response(
        JSON.stringify({ success: true, data: cached }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check DB cache (persistent)
    const dbKey = getCategoryDBKey(validCategory);
    const dbCached = await getSymbolsFromDB(dbKey);
    if (dbCached && dbCached.symbols.length > 0) {
      console.log(`[scrape-tradingview-symbols] DB cache hit for ${validCategory}: ${dbCached.symbols.length} symbols`);
      
      // Convert DB format to TVSymbol format
      const symbols: TVSymbol[] = dbCached.symbols.map(s => ({
        symbol: s.symbol,
        name: s.name,
        exchange: s.latest || '', // Using 'latest' field for exchange
        type: 'futures'
      }));
      
      // Also update in-memory cache
      cache.set(validCategory, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: symbols,
      });
      
      return new Response(
        JSON.stringify({ success: true, data: symbols, fromDBCache: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check inflight
    if (inflight.has(validCategory)) {
      console.log(`[scrape-tradingview-symbols] Waiting for inflight request: ${validCategory}`);
      const result = await inflight.get(validCategory);
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[scrape-tradingview-symbols] No cache found, will scrape for ${validCategory}...`);

    // 3. Scrape from TradingView
    const url = CATEGORY_URLS[validCategory];
    console.log(`[scrape-tradingview-symbols] Scraping TradingView symbols from: ${url}`);

    const scrapePromise = (async (): Promise<TVSymbol[]> => {
      try {
        const schema = {
          type: 'object',
          properties: {
            symbols: {
              type: 'array',
              description: 'ALL commodity symbols from the main futures table',
              items: {
                type: 'object',
                properties: {
                  symbol: { type: 'string', description: 'Symbol code like CL1!, BZ1!, NG1!, etc.' },
                  name: { type: 'string', description: 'Full name like Crude Oil WTI, Brent Crude Oil, Natural Gas' },
                  exchange: { type: 'string', description: 'Exchange like NYMEX, COMEX, CME, CBOT' },
                },
                required: ['symbol', 'name'],
              },
            },
          },
          required: ['symbols'],
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
              prompt: `Extract ALL commodity futures symbols from the main table on this page for category: ${validCategory}.
Each row typically contains: Symbol (like CL1!, BZ1!, NG1!), Name (like Crude Oil WTI, Brent Crude Oil), Exchange (NYMEX, COMEX, etc.).
Extract EVERY symbol visible in the table. Do not skip any rows.
Include all variations (standard, mini, micro versions).`,
            },
            onlyMainContent: true,
            waitFor: 5000,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(`[scrape-tradingview-symbols] Firecrawl error for ${validCategory}:`, data);
          return [];
        }

        const extractData = data.data?.extract || data.extract || {};
        const symbolsData = extractData.symbols || [];
        
        console.log(`[scrape-tradingview-symbols] Extracted ${symbolsData.length} symbols for ${validCategory}`);
        
        if (symbolsData.length === 0) {
          console.warn(`[scrape-tradingview-symbols] ⚠️ No symbols extracted for ${validCategory}!`);
          return [];
        }

        let symbols: TVSymbol[] = symbolsData.map((s: any) => ({
          symbol: s.symbol || '',
          name: s.name || '',
          exchange: s.exchange || 'NYMEX',
          type: 'futures'
        })).filter((s: TVSymbol) => s.symbol && s.name);

        console.log(`[scrape-tradingview-symbols] ✅ Parsed ${symbols.length} valid symbols for ${validCategory}`);
        
        // If scraping failed or returned 0 symbols, use fallback
        if (symbols.length === 0) {
          console.warn(`[scrape-tradingview-symbols] ⚠️ Scraping returned 0 symbols for ${validCategory}, using fallback symbols`);
          symbols = FALLBACK_SYMBOLS[validCategory];
          console.log(`[scrape-tradingview-symbols] Using ${symbols.length} fallback symbols for ${validCategory}`);
        } else {
          console.log(`[scrape-tradingview-symbols] Sample symbols:`, symbols.slice(0, 5).map(s => `${s.symbol} (${s.name})`).join(', '));
        }

        // Save to DB cache (async, non-blocking) - always save, whether scraped or fallback
        if (symbols.length > 0) {
          console.log(`[scrape-tradingview-symbols] Saving ${symbols.length} symbols to DB for ${validCategory}`);
          
          // Convert to DB format (using 'latest' field for exchange to fit the schema)
          const dbSymbols = symbols.map(s => ({
            symbol: s.symbol,
            name: s.name,
            latest: s.exchange, // Store exchange in 'latest' field
            change: '',
            volume: ''
          }));
          
          saveSymbolsToDB(dbKey, dbSymbols, 'tradingview', 7)
            .then((success) => {
              if (success) {
                console.log(`[scrape-tradingview-symbols] ✅ Successfully saved ${symbols.length} symbols to DB`);
              } else {
                console.error(`[scrape-tradingview-symbols] ❌ Failed to save symbols to DB`);
              }
            })
            .catch((err) => {
              console.error('[scrape-tradingview-symbols] ❌ Error saving symbols to DB (non-blocking):', err);
            });
        }

        // Update in-memory cache
        cache.set(validCategory, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          data: symbols,
        });

        return symbols;
      } catch (err) {
        console.error(`[scrape-tradingview-symbols] ❌ Scrape error for ${validCategory}:`, err);
        console.warn(`[scrape-tradingview-symbols] ⚠️ Using fallback symbols due to error`);
        
        // Use fallback symbols
        const fallbackSymbols = FALLBACK_SYMBOLS[validCategory];
        
        // Save fallback to DB so it's available next time
        if (fallbackSymbols.length > 0) {
          const dbSymbols = fallbackSymbols.map(s => ({
            symbol: s.symbol,
            name: s.name,
            latest: s.exchange,
            change: '',
            volume: ''
          }));
          
          saveSymbolsToDB(dbKey, dbSymbols, 'tradingview', 7).catch((err) => {
            console.error('[scrape-tradingview-symbols] ❌ Error saving fallback symbols to DB:', err);
          });
        }
        
        // Update in-memory cache
        cache.set(validCategory, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          data: fallbackSymbols,
        });
        
        return fallbackSymbols;
      } finally {
        inflight.delete(validCategory);
      }
    })();

    inflight.set(validCategory, scrapePromise);
    const symbols = await scrapePromise;

    return new Response(
      JSON.stringify({ success: true, data: symbols }),
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
