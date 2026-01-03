import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MaturityItem = {
  code: string;
  label: string;
  expiration: string;
};

type MaturitiesResponse = {
  success: boolean;
  symbol: string;
  maturities: MaturityItem[];
  error?: string;
  code?: 'RATE_LIMIT' | 'SCRAPE_FAILED';
  retryAfterSeconds?: number;
  fromCache?: boolean;
  cacheAge?: number;
};

type CacheEntry = {
  createdAt: number;
  expiresAt: number;
  data: MaturitiesResponse;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const NEGATIVE_CACHE_TTL_MS = 60_000; // 1min

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<MaturitiesResponse>>();

const MONTH_CODES: Record<string, { name: string; monthIndex: number }> = {
  F: { name: 'Jan', monthIndex: 0 },
  G: { name: 'Feb', monthIndex: 1 },
  H: { name: 'Mar', monthIndex: 2 },
  J: { name: 'Apr', monthIndex: 3 },
  K: { name: 'May', monthIndex: 4 },
  M: { name: 'Jun', monthIndex: 5 },
  N: { name: 'Jul', monthIndex: 6 },
  Q: { name: 'Aug', monthIndex: 7 },
  U: { name: 'Sep', monthIndex: 8 },
  V: { name: 'Oct', monthIndex: 9 },
  X: { name: 'Nov', monthIndex: 10 },
  Z: { name: 'Dec', monthIndex: 11 },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, forceRefresh } = await req.json();

    if (!symbol || typeof symbol !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'symbol is required', symbol: '', maturities: [], code: 'SCRAPE_FAILED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured', symbol, maturities: [], code: 'SCRAPE_FAILED' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cacheKey = symbol;

    if (!forceRefresh) {
      const cached = getFromCache(cache, cacheKey);
      if (cached) {
        const cacheAge = Math.round((Date.now() - cached.createdAt) / 1000);
        console.log(`Maturities cache hit for ${symbol} (age: ${cacheAge}s)`);
        return new Response(JSON.stringify({ ...cached.data, fromCache: true, cacheAge }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.log(`Force refresh maturities for ${symbol}`);
      cache.delete(cacheKey);
    }

    const existing = inflight.get(cacheKey);
    const isOwner = !existing;

    const workPromise =
      existing ??
      (async (): Promise<MaturitiesResponse> => {
        try {
          const url = `https://www.barchart.com/futures/quotes/${symbol}*0/futures-prices?viewName=main`;
          console.log(`Scraping maturities for: ${symbol}`);
          console.log(`URL: ${url}`);

          const schema = {
            type: 'object',
            properties: {
              contracts: {
                type: 'array',
                description: 'ALL futures rows from the futures prices table',
                items: {
                  type: 'object',
                  properties: {
                    contract: { type: 'string', description: 'Contract code like CLG26' },
                    month: { type: 'string', description: 'Display month like Feb 2026' },
                  },
                  required: ['contract'],
                },
              },
            },
            required: ['contracts'],
          };

          const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
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
                prompt: `Extract ALL available futures contracts from the main futures prices table for ${symbol}.

Return EVERY row (20-40+ contracts, multiple years). For each row:
- contract: exact contract code (e.g., CLG26)
- month: the displayed month/year label (e.g., Feb 2026)

Do not skip rows.`,
              },
              onlyMainContent: true,
              waitFor: 1500,
            }),
          });

          const scrapeData = await scrapeResponse.json();

          if (!scrapeResponse.ok || !scrapeData.success) {
            const msg: string | undefined = scrapeData?.error;
            const isRateLimit = isRateLimitError(msg);
            const retryAfterSeconds = isRateLimit ? extractRetryAfterSeconds(msg) ?? 60 : undefined;

            console.error('Firecrawl maturities scrape error:', scrapeData);

            return {
              success: false,
              symbol,
              maturities: [],
              code: isRateLimit ? 'RATE_LIMIT' : 'SCRAPE_FAILED',
              retryAfterSeconds,
              error: msg || 'Failed to scrape maturities',
            };
          }

          const extracted = scrapeData.data?.extract || scrapeData.extract || {};
          const rows: Array<{ contract?: string; month?: string }> = Array.isArray(extracted.contracts)
            ? extracted.contracts
            : [];

          console.log(`Extracted maturities rows: ${rows.length}`);

          const maturities = normalizeMaturities(symbol, rows);

          console.log(`Normalized maturities: ${maturities.length}`);

          return {
            success: maturities.length > 0,
            symbol,
            maturities,
          };
        } catch (error) {
          console.error('Error in scrape-barchart-maturities:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to scrape maturities';
          return {
            success: false,
            symbol,
            maturities: [],
            code: 'SCRAPE_FAILED',
            error: errorMessage,
          };
        }
      })();

    if (isOwner) {
      inflight.set(cacheKey, workPromise);
    }

    try {
      const result = await workPromise;
      const now = Date.now();

      cache.set(cacheKey, {
        createdAt: now,
        expiresAt: now + (result.success ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
        data: result,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      if (isOwner) inflight.delete(cacheKey);
    }
  } catch (error) {
    console.error('Error in scrape-barchart-maturities:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

    const payload: MaturitiesResponse = {
      success: false,
      symbol: '',
      maturities: [],
      code: 'SCRAPE_FAILED',
      error: errorMessage,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getFromCache(cache: Map<string, CacheEntry>, key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function isRateLimitError(message?: string): boolean {
  return !!message && message.toLowerCase().includes('rate limit');
}

function extractRetryAfterSeconds(message?: string): number | null {
  if (!message) return null;
  const match = message.match(/retry after\s*(\d+)s/i) || message.match(/after\s*(\d+)s/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function normalizeMaturities(
  baseSymbol: string,
  rows: Array<{ contract?: string; month?: string }>
): MaturityItem[] {
  const byCode = new Map<string, { code: string; label: string; expiration: string; sortKey: number }>();

  for (const row of rows) {
    const contractRaw = (row.contract || '').trim();
    if (!contractRaw) continue;

    // Ensure contract begins with baseSymbol; if not, still try to parse maturity code
    const contract = contractRaw.replace(/\s+/g, '');
    const code = contract.startsWith(baseSymbol) ? contract.slice(baseSymbol.length) : contract.slice(-3);
    if (!code || code.length < 3) continue;

    const parsed = parseMaturityLabel(code, row.month);
    if (!parsed) continue;

    const sortKey = parsed.year * 100 + parsed.monthIndex;

    if (!byCode.has(code)) {
      byCode.set(code, {
        code,
        label: `${parsed.monthName} ${parsed.year}`,
        expiration: buildExpiration(parsed.year, parsed.monthIndex),
        sortKey,
      });
    }
  }

  return Array.from(byCode.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ code, label, expiration }) => ({ code, label, expiration }));
}

function parseMaturityLabel(
  code: string,
  monthLabel?: string
): { year: number; monthIndex: number; monthName: string } | null {
  // Prefer month label if provided (e.g., "Feb 2026" or "Feb '26")
  if (monthLabel) {
    const m = monthLabel.trim().match(/([A-Za-z]{3})\s*'?\s*(\d{2,4})/);
    if (m) {
      const monthName = capitalize3(m[1]);
      const yearNumRaw = m[2];
      const year = yearNumRaw.length === 2 ? 2000 + Number(yearNumRaw) : Number(yearNumRaw);
      const monthIndex = monthIndexFromName(monthName);
      if (!Number.isNaN(year) && monthIndex !== null) {
        return { year, monthIndex, monthName };
      }
    }
  }

  // Fallback: derive from code like "G26"
  const monthCode = code[0]?.toUpperCase();
  const yearSuffix = code.slice(1).replace(/[^0-9]/g, '').slice(0, 2);
  if (!monthCode || yearSuffix.length !== 2) return null;

  const map = MONTH_CODES[monthCode];
  if (!map) return null;

  const year = 2000 + Number(yearSuffix);
  if (Number.isNaN(year)) return null;

  return { year, monthIndex: map.monthIndex, monthName: map.name };
}

function monthIndexFromName(name: string): number | null {
  const normalized = name.slice(0, 3).toLowerCase();
  const map: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  return map[normalized] ?? null;
}

function capitalize3(s: string): string {
  const v = s.slice(0, 3).toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function buildExpiration(year: number, monthIndex: number): string {
  // Keep consistent with existing frontend expectations: mid-month ISO date
  const d = new Date(Date.UTC(year, monthIndex, 14));
  return d.toISOString().split('T')[0];
}
