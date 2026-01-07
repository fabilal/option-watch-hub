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
  latest: string;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  ivSkew: number;
  lastTrade: string;
}

export interface ForexOptionsChain {
  symbol: string;
  name: string;
  maturity: string;
  daysToExpiration: number;
  impliedVolatility: number;
  priceOfOptionPoint: number;
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
        return getDefaultSymbols(category);
      }

      if (data?.success && data?.data) {
        return data.data as ForexSymbol[];
      }

      return getDefaultSymbols(category);
    } catch (err) {
      console.error('Failed to fetch Forex symbols:', err);
      return getDefaultSymbols(category);
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
 * Fetch Forex options chain for a symbol and maturity
 */
export async function fetchForexOptions(
  symbol: ForexSymbol, 
  maturityCode: string
): Promise<ForexOptionsChain | null> {
  const cacheKey = `${symbol.symbol}-${maturityCode}`;
  
  if (optionsInflight.has(cacheKey)) {
    return optionsInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-forex-options', {
        body: { 
          exchange: symbol.exchange || 'CME',
          symbol: symbol.symbol,
          maturity: maturityCode,
        },
      });

      if (error) {
        console.error('Error fetching Forex options:', error);
        return null;
      }

      if (data?.success) {
        return {
          symbol: data.symbol,
          name: data.name,
          maturity: data.maturity,
          daysToExpiration: data.daysToExpiration,
          impliedVolatility: data.impliedVolatility,
          priceOfOptionPoint: data.priceOfOptionPoint,
          calls: data.calls || [],
          puts: data.puts || [],
        } as ForexOptionsChain;
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

// Default symbols fallback
function getDefaultSymbols(category: ForexCategory): ForexSymbol[] {
  const defaults: Record<ForexCategory, ForexSymbol[]> = {
    majors: [
      { symbol: 'E6', name: 'Euro FX', exchange: 'CME', type: 'futures' },
      { symbol: 'B6', name: 'British Pound', exchange: 'CME', type: 'futures' },
      { symbol: 'J6', name: 'Japanese Yen', exchange: 'CME', type: 'futures' },
      { symbol: 'D6', name: 'Canadian Dollar', exchange: 'CME', type: 'futures' },
      { symbol: 'A6', name: 'Australian Dollar', exchange: 'CME', type: 'futures' },
      { symbol: 'S6', name: 'Swiss Franc', exchange: 'CME', type: 'futures' },
    ],
    minors: [
      { symbol: 'N6', name: 'New Zealand Dollar', exchange: 'CME', type: 'futures' },
      { symbol: 'M6', name: 'Mexican Peso', exchange: 'CME', type: 'futures' },
      { symbol: 'L6', name: 'Brazilian Real', exchange: 'CME', type: 'futures' },
      { symbol: 'RA', name: 'South African Rand', exchange: 'CME', type: 'futures' },
    ],
    exotics: [
      { symbol: 'DX', name: 'US Dollar Index', exchange: 'ICE', type: 'futures' },
      { symbol: 'BTC', name: 'Bitcoin Futures', exchange: 'CME', type: 'crypto' },
      { symbol: 'ETH', name: 'Ether Futures', exchange: 'CME', type: 'crypto' },
    ],
  };
  return defaults[category];
}
