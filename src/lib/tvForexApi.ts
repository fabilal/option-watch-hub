import { supabase } from "@/integrations/supabase/client";

export interface TVForexSymbol {
  symbol: string;
  name: string;
  exchange: string;
  price: string;
  change: string;
  changePercent: string;
}

export interface TVForexFutures {
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

export interface TVForexOptionContract {
  strike: number;
  type: 'Call' | 'Put';
  symbol: string;
  last: string;
  change: string;
  changePercent: string;
  bid: string;
  ask: string;
  volume: string;
  openInterest: string;
  iv: number;
  delta: string;
  gamma: string;
  theta: string;
}

export interface TVForexOptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  expirationDate: string;
  maturities: string[];
  calls: TVForexOptionContract[];
  puts: TVForexOptionContract[];
}

// New interface for strike-based view (all maturities for a strike)
export interface TVForexOptionsByStrike {
  underlyingSymbol: string;
  underlyingPrice: string;
  strike: number;
  maturities: Array<{
    maturity: string; // Expiration date
    maturityCode: string; // Contract code like CLH2026
    call: {
      last: string;
      bid: string;
      ask: string;
      volume: string;
      openInterest: string;
      iv: number;
      delta: string;
      gamma: string;
      theta: string;
    } | null;
    put: {
      last: string;
      bid: string;
      ask: string;
      volume: string;
      openInterest: string;
      iv: number;
      delta: string;
      gamma: string;
      theta: string;
    } | null;
  }>;
}

// In-flight request deduplication
const symbolsInflight = new Map<string, Promise<TVForexSymbol[]>>();
const futuresInflight = new Map<string, Promise<TVForexFutures[]>>();
const optionsInflight = new Map<string, Promise<TVForexOptionsChain | null>>();
const optionsByStrikeInflight = new Map<string, Promise<TVForexOptionsByStrike | null>>();
const maturitiesInflight = new Map<string, Promise<string[]>>();
const strikesInflight = new Map<string, Promise<number[]>>();

export async function fetchTVForexSymbols(): Promise<TVForexSymbol[]> {
  const cacheKey = 'tv-forex-symbols';
  
  const existing = symbolsInflight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<TVForexSymbol[]> => {
    try {
      console.log('Fetching TV forex symbols...');
      
      const { data, error } = await supabase.functions.invoke('scrape-tv-forex-symbols', {
        body: {},
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to fetch TV forex symbols');
      }

      if (!data?.success || !data?.data?.length) {
        console.warn('No TV forex symbols returned from scraping');
        return [];
      }

      console.log(`Fetched ${data.data.length} TV forex symbols`);
      return data.data;
    } catch (err) {
      console.error('Failed to fetch TV forex symbols:', err);
      throw err;
    } finally {
      symbolsInflight.delete(cacheKey);
    }
  })();

  symbolsInflight.set(cacheKey, promise);
  return promise;
}

export async function fetchTVForexFutures(symbol: TVForexSymbol): Promise<TVForexFutures[]> {
  const cacheKey = `tv-forex-futures-${symbol.exchange}-${symbol.symbol}`;
  
  const existing = futuresInflight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<TVForexFutures[]> => {
    try {
      console.log(`Fetching TV forex futures for ${symbol.symbol}...`);
      
      const { data, error } = await supabase.functions.invoke('scrape-tv-forex-futures', {
        body: { symbol: symbol.symbol, exchange: symbol.exchange },
      });

      if (error) {
        console.error('Edge function error:', error);
        return [];
      }

      if (!data?.success) {
        console.warn('No TV forex futures returned:', data);
        return [];
      }

      const contracts = data.data || [];
      console.log(`Fetched ${contracts.length} TV forex futures contracts`);
      
      if (contracts.length === 0) {
        console.warn('Empty contracts array returned from scrape-tv-forex-futures');
      }
      
      return contracts;
    } catch (err) {
      console.error('Failed to fetch TV forex futures:', err);
      return [];
    } finally {
      futuresInflight.delete(cacheKey);
    }
  })();

  futuresInflight.set(cacheKey, promise);
  return promise;
}

// Fetch available maturities for options
export async function fetchTVForexOptionsMaturities(symbol: TVForexSymbol): Promise<string[]> {
  const cacheKey = `tv-forex-options-maturities-${symbol.exchange}-${symbol.symbol}`;
  
  const existing = maturitiesInflight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<string[]> => {
    try {
      console.log(`Fetching TV forex options maturities for ${symbol.symbol}...`);
      
      const { data, error } = await supabase.functions.invoke('scrape-tv-forex-options', {
        body: { 
          symbol: symbol.symbol, 
          exchange: symbol.exchange,
          fetchMaturitiesOnly: true
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        return [];
      }

      if (!data?.success || !data?.data?.maturities) {
        console.warn('No TV forex options maturities returned');
        return [];
      }

      console.log(`Fetched ${data.data.maturities.length} maturities`);
      return data.data.maturities;
    } catch (err) {
      console.error('Failed to fetch TV forex options maturities:', err);
      return [];
    } finally {
      maturitiesInflight.delete(cacheKey);
    }
  })();

  maturitiesInflight.set(cacheKey, promise);
  return promise;
}

// Fetch options chain for a specific maturity
export async function fetchTVForexOptions(
  symbol: TVForexSymbol, 
  maturity?: string
): Promise<TVForexOptionsChain | null> {
  const cacheKey = `tv-forex-options-${symbol.exchange}-${symbol.symbol}${maturity ? `-${maturity}` : ''}`;
  
  const existing = optionsInflight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<TVForexOptionsChain | null> => {
    try {
      console.log(`Fetching TV forex options for ${symbol.symbol}, maturity: ${maturity || 'default'}...`);
      
      const { data, error } = await supabase.functions.invoke('scrape-tv-forex-options', {
        body: { 
          symbol: symbol.symbol, 
          exchange: symbol.exchange,
          maturity: maturity
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        return null;
      }

      if (!data?.success || !data?.data) {
        console.warn('No TV forex options returned');
        return null;
      }

      console.log(`Fetched ${data.data.calls?.length || 0} calls, ${data.data.puts?.length || 0} puts`);
      return data.data;
    } catch (err) {
      console.error('Failed to fetch TV forex options:', err);
      return null;
    } finally {
      optionsInflight.delete(cacheKey);
    }
  })();

  optionsInflight.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch available strikes from DB cache for a TV Forex symbol
 */
export async function fetchTVForexStrikes(exchange: string, symbol: string): Promise<number[]> {
  const cacheKey = `tv-forex-strikes-${exchange}-${symbol}`;

  if (strikesInflight.has(cacheKey)) {
    return strikesInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      console.log(`Fetching TV forex strikes from DB for ${exchange}-${symbol}...`);
      const { data, error } = await supabase.functions.invoke('get-strikes', {
        body: { exchange, symbol },
      });

      if (error) {
        console.error('Error fetching TV forex strikes from DB:', error);
        return [];
      }

      if (data?.success && data?.data) {
        return data.data as number[];
      }

      return [];
    } catch (err) {
      console.error('Failed to fetch TV forex strikes from DB:', err);
      return [];
    } finally {
      strikesInflight.delete(cacheKey);
    }
  })();

  strikesInflight.set(cacheKey, promise);
  return promise;
}

// Fetch options by strike (NEW - all maturities for a strike)
export async function fetchTVForexOptionsByStrike(
  symbol: TVForexSymbol,
  strike: number
): Promise<TVForexOptionsByStrike | null> {
  const cacheKey = `tv-forex-options-strike-${symbol.exchange}-${symbol.symbol}-${strike}`;
  
  const existing = optionsByStrikeInflight.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<TVForexOptionsByStrike | null> => {
    try {
      console.log(`Fetching TV forex options by strike for ${symbol.symbol}, strike: ${strike}...`);
      
      const { data, error } = await supabase.functions.invoke('scrape-tv-forex-options', {
        body: { 
          symbol: symbol.symbol, 
          exchange: symbol.exchange,
          strike: strike,
          viewMode: 'strike'
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        return null;
      }

      if (!data?.success || !data?.data) {
        console.warn('No TV forex options by strike returned');
        return null;
      }

      console.log(`Fetched ${data.data.maturities?.length || 0} maturities for strike ${strike}`);
      return data.data as TVForexOptionsByStrike;
    } catch (err) {
      console.error('Failed to fetch TV forex options by strike:', err);
      return null;
    } finally {
      optionsByStrikeInflight.delete(cacheKey);
    }
  })();

  optionsByStrikeInflight.set(cacheKey, promise);
  return promise;
}
