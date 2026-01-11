// Helper functions for Supabase DB cache
// Used by Edge Functions to persist static data (symbols, maturities)

// Get Supabase URL and service role key from environment
// In Edge Functions, these are automatically available
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 
  Deno.env.get('SUPABASE_PROJECT_URL') || 
  'https://iflnsckduohrcafafcpj.supabase.co';
  
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 
  Deno.env.get('SUPABASE_ANON_KEY') || // Fallback to anon key if service key not available
  '';

// Log key availability (without exposing the key)
if (!SUPABASE_SERVICE_KEY) {
  console.error('[db-cache] WARNING: No SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY found in environment variables!');
  console.error('[db-cache] DB cache operations will fail. Please configure SUPABASE_SERVICE_ROLE_KEY in Edge Function secrets.');
} else {
  const hasServiceKey = !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  console.log(`[db-cache] Using ${hasServiceKey ? 'SERVICE_ROLE_KEY' : 'ANON_KEY'} for DB operations`);
}

interface SupabaseResponse<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * Get Supabase client using service role key (for Edge Functions)
 */
async function supabaseFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<SupabaseResponse<T>> {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('[db-cache] Cannot perform DB operation: No SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY configured');
    return {
      data: null,
      error: {
        message: 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY not configured',
        code: 'NO_KEY',
      },
    };
  }

  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  
  const headers = new Headers(options.headers);
  headers.set('apikey', SUPABASE_SERVICE_KEY);
  headers.set('Authorization', `Bearer ${SUPABASE_SERVICE_KEY}`);
  headers.set('Content-Type', 'application/json');
  headers.set('Prefer', 'return=representation');

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[db-cache] Supabase API error: ${response.status} ${response.statusText}`, errorText.substring(0, 500));
      return {
        data: null,
        error: {
          message: `Supabase error: ${response.status} ${errorText}`,
          code: response.status.toString(),
        },
      };
    }

    const data = await response.json();
    return { data: data as T, error: null };
  } catch (error) {
    console.error('[db-cache] Fetch error:', error);
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Get symbols from DB cache for a category
 */
export async function getSymbolsFromDB(category: string): Promise<{
  success: boolean;
  category: string;
  symbols: Array<{
    symbol: string;
    name: string;
    latest: string;
    change: string;
    volume: string;
  }>;
} | null> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabaseFetch<Array<{
    category: string;
    symbol: string;
    name: string;
    latest: string | null;
    change: string | null;
    volume: string | null;
    expires_at: string;
  }>>(
    `scraped_symbols?category=eq.${encodeURIComponent(category)}&expires_at=gt.${now}&select=*&order=symbol.asc`
  );

  if (error || !data || data.length === 0) {
    return null;
  }

  return {
    success: true,
    category,
    symbols: data.map((row) => ({
      symbol: row.symbol,
      name: row.name,
      latest: row.latest || '',
      change: row.change || '',
      volume: row.volume || '',
    })),
  };
}

/**
 * Save symbols to DB cache
 */
export async function saveSymbolsToDB(
  category: string,
  symbols: Array<{
    symbol: string;
    name: string;
    latest?: string;
    change?: string;
    volume?: string;
  }>,
  ttlDays: number = 7
): Promise<boolean> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  // Delete existing symbols for this category
  await supabaseFetch(`scraped_symbols?category=eq.${encodeURIComponent(category)}`, {
    method: 'DELETE',
  });

  // Insert new symbols
  const rows = symbols.map((s) => ({
    category,
    symbol: s.symbol,
    name: s.name,
    latest: s.latest || '',
    change: s.change || '',
    volume: s.volume || '',
    expires_at: expiresAt.toISOString(),
  }));

  // Insert in batches of 50 (Supabase limit)
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseFetch('scraped_symbols', {
      method: 'POST',
      body: JSON.stringify(batch),
    });

    if (error) {
      console.error(`Error saving symbols batch ${i}-${i + batch.length}:`, error);
      return false;
    }
  }

  console.log(`Saved ${symbols.length} symbols for category ${category} to DB`);
  return true;
}

/**
 * Get maturities from DB cache for a symbol
 */
export async function getMaturitiesFromDB(symbol: string): Promise<{
  success: boolean;
  symbol: string;
  maturities: Array<{
    code: string;
    label: string;
    expiration: string;
  }>;
} | null> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabaseFetch<Array<{
    symbol: string;
    code: string;
    label: string;
    expiration: string;
    expires_at: string;
  }>>(
    `scraped_maturities?symbol=eq.${encodeURIComponent(symbol)}&expires_at=gt.${now}&select=*&order=code.asc`
  );

  if (error || !data || data.length === 0) {
    return null;
  }

  return {
    success: true,
    symbol,
    maturities: data.map((row) => ({
      code: row.code,
      label: row.label,
      expiration: row.expiration,
    })),
  };
}

/**
 * Save maturities to DB cache
 */
export async function saveMaturitiesToDB(
  symbol: string,
  maturities: Array<{
    code: string;
    label: string;
    expiration: string;
  }>,
  ttlDays: number = 30
): Promise<boolean> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  // Delete existing maturities for this symbol
  await supabaseFetch(`scraped_maturities?symbol=eq.${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
  });

  // Insert new maturities
  const rows = maturities.map((m) => ({
    symbol,
    code: m.code,
    label: m.label,
    expiration: m.expiration,
    expires_at: expiresAt.toISOString(),
  }));

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseFetch('scraped_maturities', {
      method: 'POST',
      body: JSON.stringify(batch),
    });

    if (error) {
      console.error(`Error saving maturities batch ${i}-${i + batch.length}:`, error);
      return false;
    }
  }

  console.log(`Saved ${maturities.length} maturities for symbol ${symbol} to DB`);
  return true;
}

/**
 * Get strikes from DB cache for a symbol/exchange
 */
export async function getStrikesFromDB(
  exchange: string,
  symbol: string
): Promise<number[]> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabaseFetch<Array<{
    exchange: string;
    symbol: string;
    strike: number;
    expires_at: string;
  }>>(
    `scraped_strikes?exchange=eq.${encodeURIComponent(exchange)}&symbol=eq.${encodeURIComponent(symbol)}&expires_at=gt.${now}&select=strike&order=strike.asc`
  );

  if (error || !data || data.length === 0) {
    return [];
  }

  return data.map((row) => row.strike);
}

/**
 * Save strikes to DB cache
 */
export async function saveStrikesToDB(
  exchange: string,
  symbol: string,
  strikes: number[],
  ttlDays: number = 7
): Promise<boolean> {
  if (strikes.length === 0) {
    return false;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  // Delete existing strikes for this symbol/exchange
  await supabaseFetch(
    `scraped_strikes?exchange=eq.${encodeURIComponent(exchange)}&symbol=eq.${encodeURIComponent(symbol)}`,
    {
      method: 'DELETE',
    }
  );

  // Insert new strikes
  const rows = strikes.map((strike) => ({
    exchange,
    symbol,
    strike,
    expires_at: expiresAt.toISOString(),
  }));

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseFetch('scraped_strikes', {
      method: 'POST',
      body: JSON.stringify(batch),
    });

    if (error) {
      console.error(`Error saving strikes batch ${i}-${i + batch.length}:`, error);
      return false;
    }
  }

  console.log(`Saved ${strikes.length} strikes for ${exchange}-${symbol} to DB`);
  return true;
}

