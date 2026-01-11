import { supabase } from "@/integrations/supabase/client";

// Forex category types
export type ForexCategory = 'majors' | 'minors' | 'exotics';

export const FOREX_CATEGORIES: Record<ForexCategory, { label: string; icon: string }> = {
  majors: { label: 'Majors', icon: '💵' },
  minors: { label: 'Minors', icon: '💶' },
  exotics: { label: 'Exotiques', icon: '💴' },
};

export interface ForexSymbol {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface ForexFuturesContract {
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

export interface ForexOptionContract {
  strike: number;
  type: 'Call' | 'Put';
  symbol: string;
  last: string;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  volume: string;
  openInterest: string;
}

export interface ForexOptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  futuresContract: string;
  daysToExpiration: number;
  calls: ForexOptionContract[];
  puts: ForexOptionContract[];
}

export interface ForexFuturesResponse {
  success: boolean;
  data: ForexFuturesContract[];
  cached?: boolean;
  error?: string;
}

// In-flight request deduplication
const symbolsInflight = new Map<string, Promise<ForexSymbol[]>>();
const futuresInflight = new Map<string, Promise<ForexFuturesResponse | null>>();
const optionsInflight = new Map<string, Promise<ForexOptionsChain | null>>();

/**
 * Fetch Forex symbols for a category
 */
export async function fetchForexSymbols(category: ForexCategory): Promise<ForexSymbol[]> {
  const cacheKey = category;
  
  if (symbolsInflight.has(cacheKey)) {
    return symbolsInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-forex-symbols', {
        body: { category },
      });

      if (error) {
        console.error('Error fetching Forex symbols:', error);
        throw new Error(error.message || 'Failed to fetch Forex symbols');
      }

      if (data?.success && data?.data) {
        return data.data as ForexSymbol[];
      }

      console.warn('No Forex symbols returned from scraping');
      return [];
    } catch (err) {
      console.error('Failed to fetch Forex symbols:', err);
      throw err;
    } finally {
      symbolsInflight.delete(cacheKey);
    }
  })();

  symbolsInflight.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch Forex futures contracts for a symbol
 */
export async function fetchForexFutures(symbol: ForexSymbol): Promise<ForexFuturesResponse | null> {
  const cacheKey = `${symbol.symbol}`;

  if (futuresInflight.has(cacheKey)) {
    return futuresInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-forex-futures', {
        body: {
          symbol: symbol.symbol,
          name: symbol.name,
        },
      });

      if (error) {
        console.error('Error fetching Forex futures:', error);
        return null;
      }

      if (data?.success && Array.isArray(data?.data)) {
        return data as ForexFuturesResponse;
      }

      return null;
    } catch (err) {
      console.error('Failed to fetch Forex futures:', err);
      return null;
    } finally {
      futuresInflight.delete(cacheKey);
    }
  })();

  futuresInflight.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch Forex options chain for a futures contract
 * @param futuresContract - The full futures contract symbol (e.g., "E6H26")
 */
export async function fetchForexOptions(
  futuresContract: string
): Promise<ForexOptionsChain | null> {
  const cacheKey = `options-${futuresContract}`;
  
  if (optionsInflight.has(cacheKey)) {
    return optionsInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-forex-options', {
        body: { futuresContract },
      });

      if (error) {
        console.error('Error fetching Forex options:', error);
        return null;
      }

      if (data?.success && data?.data) {
        return data.data as ForexOptionsChain;
      }

      return null;
    } catch (err) {
      console.error('Failed to fetch Forex options:', err);
      return null;
    } finally {
      optionsInflight.delete(cacheKey);
    }
  })();

  optionsInflight.set(cacheKey, promise);
  return promise;
}

/**
 * Extract available maturities from futures data
 */
export function extractMaturitiesFromFutures(futures: ForexFuturesContract[]): string[] {
  return futures
    .map((f) => {
      // Extract maturity code from contract (e.g., "E6H26" -> "H26")
      const match = f.symbol.match(/[FGHJKMNQUVXZ]\d{2}$/);
      return match ? match[0] : null;
    })
    .filter((m): m is string => m !== null);
}
