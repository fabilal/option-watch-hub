// Helper functions for Supabase DB cache
// Used by Edge Functions to persist scraped data (symbols, maturities, futures, options)

// Get Supabase URL and service role key from environment
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 
  Deno.env.get('SUPABASE_PROJECT_URL') || 
  'https://eugvjubeuyukhgcwfncr.supabase.co';
  
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 
  Deno.env.get('SUPABASE_ANON_KEY') || '';

// Log key availability (without exposing the key)
if (!SUPABASE_SERVICE_KEY) {
  console.error('[db-cache] WARNING: No SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY found!');
} else {
  const hasServiceKey = !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  console.log(`[db-cache] Using ${hasServiceKey ? 'SERVICE_ROLE_KEY' : 'ANON_KEY'} for DB operations`);
}

interface SupabaseResponse<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * Fetch wrapper for Supabase REST API
 */
async function supabaseFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<SupabaseResponse<T>> {
  if (!SUPABASE_SERVICE_KEY) {
    return {
      data: null,
      error: { message: 'SUPABASE_SERVICE_ROLE_KEY not configured', code: 'NO_KEY' },
    };
  }

  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  
  const headers = new Headers(options.headers);
  headers.set('apikey', SUPABASE_SERVICE_KEY);
  headers.set('Authorization', `Bearer ${SUPABASE_SERVICE_KEY}`);
  headers.set('Content-Type', 'application/json');
  headers.set('Prefer', options.method === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation');

  try {
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[db-cache] Supabase API error: ${response.status}`, errorText.substring(0, 300));
      return {
        data: null,
        error: { message: `Supabase error: ${response.status}`, code: response.status.toString() },
      };
    }

    const data = await response.json();
    return { data: data as T, error: null };
  } catch (error) {
    console.error('[db-cache] Fetch error:', error);
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

// ============= SYMBOLS =============

export interface SymbolData {
  symbol: string;
  name: string;
  latest?: string;
  change?: string;
  volume?: string;
}

export async function getSymbolsFromDB(
  category: string,
  source: string = 'barchart'
): Promise<{ success: boolean; category: string; symbols: SymbolData[] } | null> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabaseFetch<Array<{
    symbol: string;
    name: string;
    latest: string | null;
    change: string | null;
    volume: string | null;
  }>>(
    `scraped_symbols?category=eq.${encodeURIComponent(category)}&source=eq.${encodeURIComponent(source)}&expires_at=gt.${now}&select=symbol,name,latest,change,volume&order=symbol.asc`
  );

  if (error || !data || data.length === 0) {
    console.log(`[db-cache] No symbols found in DB for ${source}/${category}`);
    return null;
  }

  console.log(`[db-cache] Found ${data.length} symbols in DB for ${source}/${category}`);
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

export async function saveSymbolsToDB(
  category: string,
  symbols: SymbolData[],
  source: string = 'barchart',
  ttlDays: number = 7
): Promise<boolean> {
  if (symbols.length === 0) return false;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  // Delete existing then insert (upsert with ON CONFLICT)
  const rows = symbols.map((s) => ({
    category,
    symbol: s.symbol,
    name: s.name,
    latest: s.latest || '',
    change: s.change || '',
    volume: s.volume || '',
    source,
    expires_at: expiresAt.toISOString(),
  }));

  // Batch insert with upsert
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseFetch('scraped_symbols?on_conflict=category,symbol,source', {
      method: 'POST',
      body: JSON.stringify(batch),
    });

    if (error) {
      console.error(`[db-cache] Error saving symbols batch:`, error);
      return false;
    }
  }

  console.log(`[db-cache] Saved ${symbols.length} symbols for ${source}/${category}`);
  return true;
}

// ============= MATURITIES =============

export interface MaturityData {
  code: string;
  label: string;
  expiration: string;
}

export async function getMaturitiesFromDB(
  symbol: string,
  source: string = 'barchart'
): Promise<{ success: boolean; symbol: string; maturities: MaturityData[] } | null> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabaseFetch<Array<{
    code: string;
    label: string;
    expiration: string;
  }>>(
    `scraped_maturities?symbol=eq.${encodeURIComponent(symbol)}&source=eq.${encodeURIComponent(source)}&expires_at=gt.${now}&select=code,label,expiration&order=code.asc`
  );

  if (error || !data || data.length === 0) {
    console.log(`[db-cache] No maturities found in DB for ${source}/${symbol}`);
    return null;
  }

  console.log(`[db-cache] Found ${data.length} maturities in DB for ${source}/${symbol}`);
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

export async function saveMaturitiesToDB(
  symbol: string,
  maturities: MaturityData[],
  source: string = 'barchart',
  ttlDays: number = 30
): Promise<boolean> {
  if (maturities.length === 0) return false;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const rows = maturities.map((m) => ({
    symbol,
    code: m.code,
    label: m.label,
    expiration: m.expiration,
    source,
    expires_at: expiresAt.toISOString(),
  }));

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseFetch('scraped_maturities?on_conflict=symbol,code,source', {
      method: 'POST',
      body: JSON.stringify(batch),
    });

    if (error) {
      console.error(`[db-cache] Error saving maturities batch:`, error);
      return false;
    }
  }

  console.log(`[db-cache] Saved ${maturities.length} maturities for ${source}/${symbol}`);
  return true;
}

// ============= STRIKES =============

export async function getStrikesFromDB(
  exchange: string,
  symbol: string
): Promise<number[]> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabaseFetch<Array<{ strike: number }>>(
    `scraped_strikes?exchange=eq.${encodeURIComponent(exchange)}&symbol=eq.${encodeURIComponent(symbol)}&expires_at=gt.${now}&select=strike&order=strike.asc`
  );

  if (error || !data || data.length === 0) {
    return [];
  }

  console.log(`[db-cache] Found ${data.length} strikes in DB for ${exchange}/${symbol}`);
  return data.map((row) => row.strike);
}

export async function saveStrikesToDB(
  exchange: string,
  symbol: string,
  strikes: number[],
  ttlDays: number = 7
): Promise<boolean> {
  if (strikes.length === 0) return false;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const rows = strikes.map((strike) => ({
    exchange,
    symbol,
    strike,
    expires_at: expiresAt.toISOString(),
  }));

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseFetch('scraped_strikes?on_conflict=exchange,symbol,strike', {
      method: 'POST',
      body: JSON.stringify(batch),
    });

    if (error) {
      console.error(`[db-cache] Error saving strikes batch:`, error);
      return false;
    }
  }

  console.log(`[db-cache] Saved ${strikes.length} strikes for ${exchange}/${symbol}`);
  return true;
}

// ============= FUTURES =============

export interface FuturesData {
  contract: string;
  month: string;
  last: string;
  change: string;
  percentChange: string;
  open: string;
  high: string;
  low: string;
  volume: string;
  openInterest: string;
  time: string;
}

export async function getFuturesFromDB(
  symbol: string,
  source: string = 'barchart'
): Promise<{ success: boolean; symbol: string; futures: FuturesData[] } | null> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabaseFetch<Array<{
    contract: string;
    month: string;
    last: string;
    change: string;
    percent_change: string;
    open: string;
    high: string;
    low: string;
    volume: string;
    open_interest: string;
    time: string;
  }>>(
    `scraped_futures?symbol=eq.${encodeURIComponent(symbol)}&source=eq.${encodeURIComponent(source)}&expires_at=gt.${now}&select=contract,month,last,change,percent_change,open,high,low,volume,open_interest,time&order=contract.asc`
  );

  if (error || !data || data.length === 0) {
    console.log(`[db-cache] No futures found in DB for ${source}/${symbol}`);
    return null;
  }

  console.log(`[db-cache] Found ${data.length} futures in DB for ${source}/${symbol}`);
  return {
    success: true,
    symbol,
    futures: data.map((row) => ({
      contract: row.contract,
      month: row.month,
      last: row.last,
      change: row.change,
      percentChange: row.percent_change,
      open: row.open,
      high: row.high,
      low: row.low,
      volume: row.volume,
      openInterest: row.open_interest,
      time: row.time,
    })),
  };
}

export async function saveFuturesToDB(
  symbol: string,
  futures: FuturesData[],
  source: string = 'barchart',
  ttlHours: number = 24
): Promise<boolean> {
  if (futures.length === 0) return false;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);

  const rows = futures.map((f) => ({
    symbol,
    contract: f.contract,
    month: f.month || '',
    last: f.last || '',
    change: f.change || '',
    percent_change: f.percentChange || '',
    open: f.open || '',
    high: f.high || '',
    low: f.low || '',
    volume: f.volume || '',
    open_interest: f.openInterest || '',
    time: f.time || '',
    source,
    expires_at: expiresAt.toISOString(),
  }));

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseFetch('scraped_futures?on_conflict=symbol,contract,source', {
      method: 'POST',
      body: JSON.stringify(batch),
    });

    if (error) {
      console.error(`[db-cache] Error saving futures batch:`, error);
      return false;
    }
  }

  console.log(`[db-cache] Saved ${futures.length} futures for ${source}/${symbol}`);
  return true;
}

// ============= OPTIONS =============

export interface OptionData {
  strike: string;
  last: string;
  change: string;
  bid: string;
  ask: string;
  volume: string;
  openInterest: string;
  iv: string;
  delta?: string;
  gamma?: string;
  theta?: string;
  vega?: string;
}

export interface OptionsChainData {
  calls: OptionData[];
  puts: OptionData[];
}

export async function getOptionsFromDB(
  symbol: string,
  maturity: string,
  source: string = 'barchart'
): Promise<{ success: boolean; symbol: string; maturity: string; calls: OptionData[]; puts: OptionData[] } | null> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabaseFetch<Array<{
    option_type: string;
    strike: string;
    last: string;
    change: string;
    bid: string;
    ask: string;
    volume: string;
    open_interest: string;
    iv: string;
    delta: string;
    gamma: string;
    theta: string;
    vega: string;
  }>>(
    `scraped_options?symbol=eq.${encodeURIComponent(symbol)}&maturity=eq.${encodeURIComponent(maturity)}&source=eq.${encodeURIComponent(source)}&expires_at=gt.${now}&select=option_type,strike,last,change,bid,ask,volume,open_interest,iv,delta,gamma,theta,vega&order=strike.asc`
  );

  if (error || !data || data.length === 0) {
    console.log(`[db-cache] No options found in DB for ${source}/${symbol}/${maturity}`);
    return null;
  }

  const calls: OptionData[] = [];
  const puts: OptionData[] = [];

  for (const row of data) {
    const option: OptionData = {
      strike: row.strike,
      last: row.last,
      change: row.change,
      bid: row.bid,
      ask: row.ask,
      volume: row.volume,
      openInterest: row.open_interest,
      iv: row.iv,
      delta: row.delta,
      gamma: row.gamma,
      theta: row.theta,
      vega: row.vega,
    };

    if (row.option_type === 'call') {
      calls.push(option);
    } else {
      puts.push(option);
    }
  }

  console.log(`[db-cache] Found ${calls.length} calls and ${puts.length} puts in DB for ${source}/${symbol}/${maturity}`);
  return { success: true, symbol, maturity, calls, puts };
}

export async function saveOptionsToDB(
  symbol: string,
  maturity: string,
  calls: OptionData[],
  puts: OptionData[],
  source: string = 'barchart',
  ttlHours: number = 24
): Promise<boolean> {
  const allOptions = [
    ...calls.map(o => ({ ...o, option_type: 'call' })),
    ...puts.map(o => ({ ...o, option_type: 'put' })),
  ];

  if (allOptions.length === 0) return false;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);

  const rows = allOptions.map((o) => ({
    symbol,
    maturity,
    option_type: o.option_type,
    strike: o.strike || '',
    last: o.last || '',
    change: o.change || '',
    bid: o.bid || '',
    ask: o.ask || '',
    volume: o.volume || '',
    open_interest: o.openInterest || '',
    iv: o.iv || '',
    delta: o.delta || '',
    gamma: o.gamma || '',
    theta: o.theta || '',
    vega: o.vega || '',
    source,
    expires_at: expiresAt.toISOString(),
  }));

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseFetch('scraped_options?on_conflict=symbol,maturity,option_type,strike,source', {
      method: 'POST',
      body: JSON.stringify(batch),
    });

    if (error) {
      console.error(`[db-cache] Error saving options batch:`, error);
      return false;
    }
  }

  console.log(`[db-cache] Saved ${calls.length} calls and ${puts.length} puts for ${source}/${symbol}/${maturity}`);
  return true;
}

// ============= UTILITY =============

export async function cleanupExpiredData(): Promise<void> {
  const now = new Date().toISOString();
  
  await Promise.all([
    supabaseFetch(`scraped_symbols?expires_at=lt.${now}`, { method: 'DELETE' }),
    supabaseFetch(`scraped_maturities?expires_at=lt.${now}`, { method: 'DELETE' }),
    supabaseFetch(`scraped_strikes?expires_at=lt.${now}`, { method: 'DELETE' }),
    supabaseFetch(`scraped_futures?expires_at=lt.${now}`, { method: 'DELETE' }),
    supabaseFetch(`scraped_options?expires_at=lt.${now}`, { method: 'DELETE' }),
  ]);

  console.log('[db-cache] Cleaned up expired data');
}
