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
  bid: string;
  ask: string;
  volume: string;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface ForexOptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  maturities: string[];
  selectedMaturity: string;
  calls: ForexOptionContract[];
  puts: ForexOptionContract[];
}

// In-flight request deduplication
const symbolsInflight = new Map<string, Promise<ForexSymbol[]>>();
const futuresInflight = new Map<string, Promise<ForexFuturesContract[]>>();
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
export async function fetchForexFutures(symbol: ForexSymbol): Promise<ForexFuturesContract[]> {
  const cacheKey = `${symbol.exchange}-${symbol.symbol}`;
  
  if (futuresInflight.has(cacheKey)) {
    return futuresInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-forex-futures', {
        body: { 
          exchange: symbol.exchange, 
          symbol: symbol.symbol 
        },
      });

      if (error) {
        console.error('Error fetching Forex futures:', error);
        return [];
      }

      if (data?.success && data?.data) {
        return data.data as ForexFuturesContract[];
      }

      return [];
    } catch (err) {
      console.error('Failed to fetch Forex futures:', err);
      return [];
    } finally {
      futuresInflight.delete(cacheKey);
    }
  })();

  futuresInflight.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch Forex options chain for a symbol
 */
export async function fetchForexOptions(
  symbol: ForexSymbol, 
  maturity?: string
): Promise<ForexOptionsChain | null> {
  const cacheKey = `${symbol.exchange}-${symbol.symbol}-${maturity || 'default'}`;
  
  if (optionsInflight.has(cacheKey)) {
    return optionsInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-forex-options', {
        body: { 
          exchange: symbol.exchange, 
          symbol: symbol.symbol,
          maturity,
        },
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

// Default symbols fallback
function getDefaultSymbols(category: ForexCategory): ForexSymbol[] {
  const defaults: Record<ForexCategory, ForexSymbol[]> = {
    majors: [
      { symbol: '6E1!', name: 'Euro FX', exchange: 'CME', type: 'futures' },
      { symbol: '6B1!', name: 'British Pound', exchange: 'CME', type: 'futures' },
      { symbol: '6J1!', name: 'Japanese Yen', exchange: 'CME', type: 'futures' },
      { symbol: '6C1!', name: 'Canadian Dollar', exchange: 'CME', type: 'futures' },
      { symbol: '6A1!', name: 'Australian Dollar', exchange: 'CME', type: 'futures' },
      { symbol: '6S1!', name: 'Swiss Franc', exchange: 'CME', type: 'futures' },
    ],
    minors: [
      { symbol: '6N1!', name: 'New Zealand Dollar', exchange: 'CME', type: 'futures' },
      { symbol: '6M1!', name: 'Mexican Peso', exchange: 'CME', type: 'futures' },
      { symbol: '6L1!', name: 'Brazilian Real', exchange: 'CME', type: 'futures' },
      { symbol: '6R1!', name: 'Russian Ruble', exchange: 'CME', type: 'futures' },
      { symbol: '6Z1!', name: 'South African Rand', exchange: 'CME', type: 'futures' },
    ],
    exotics: [
      { symbol: 'DX1!', name: 'US Dollar Index', exchange: 'ICE', type: 'futures' },
      { symbol: 'BTC1!', name: 'Bitcoin Futures', exchange: 'CME', type: 'futures' },
      { symbol: 'ETH1!', name: 'Ether Futures', exchange: 'CME', type: 'futures' },
    ],
  };
  return defaults[category];
}
