import { supabase } from "@/integrations/supabase/client";

// TradingView category types
export type TVCategory = 'energy' | 'agriculture' | 'metals';

export const TV_CATEGORIES: Record<TVCategory, { label: string; icon: string }> = {
  energy: { label: 'Énergie', icon: '⚡' },
  agriculture: { label: 'Agriculture', icon: '🌾' },
  metals: { label: 'Métaux', icon: '🥇' },
};

export interface TVSymbol {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface TVFuturesContract {
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

export interface TVOptionContract {
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

export interface TVOptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  maturities: string[];
  selectedMaturity: string;
  calls: TVOptionContract[];
  puts: TVOptionContract[];
}

// New interface for strike-based view (all maturities for a strike)
export interface TVOptionsByStrike {
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
const symbolsInflight = new Map<string, Promise<TVSymbol[]>>();
const futuresInflight = new Map<string, Promise<TVFuturesContract[]>>();
const optionsInflight = new Map<string, Promise<TVOptionsChain | null>>();
const optionsByStrikeInflight = new Map<string, Promise<TVOptionsByStrike | null>>();
const strikesInflight = new Map<string, Promise<number[]>>();

/**
 * Fetch TradingView symbols for a category
 */
export async function fetchTVSymbols(category: TVCategory): Promise<TVSymbol[]> {
  const cacheKey = category;
  
  if (symbolsInflight.has(cacheKey)) {
    return symbolsInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-tradingview-symbols', {
        body: { category },
      });

      if (error) {
        console.error('Error fetching TV symbols:', error);
        throw new Error(error.message || 'Failed to fetch TV symbols');
      }

      if (data?.success && data?.data) {
        return data.data as TVSymbol[];
      }

      console.warn('No TV symbols returned from scraping');
      return [];
    } catch (err) {
      console.error('Failed to fetch TV symbols:', err);
      throw err;
    } finally {
      symbolsInflight.delete(cacheKey);
    }
  })();

  symbolsInflight.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch TradingView futures contracts for a symbol
 */
export async function fetchTVFutures(symbol: TVSymbol): Promise<TVFuturesContract[]> {
  const cacheKey = `${symbol.exchange}-${symbol.symbol}`;
  
  if (futuresInflight.has(cacheKey)) {
    return futuresInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-tradingview-futures', {
        body: { 
          exchange: symbol.exchange, 
          symbol: symbol.symbol 
        },
      });

      if (error) {
        console.error('Error fetching TV futures:', error);
        return [];
      }

      if (data?.success && data?.data) {
        return data.data as TVFuturesContract[];
      }

      return [];
    } catch (err) {
      console.error('Failed to fetch TV futures:', err);
      return [];
    } finally {
      futuresInflight.delete(cacheKey);
    }
  })();

  futuresInflight.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch TradingView options chain for a symbol
 */
export async function fetchTVOptions(
  symbol: TVSymbol, 
  maturity?: string
): Promise<TVOptionsChain | null> {
  const cacheKey = `${symbol.exchange}-${symbol.symbol}-${maturity || 'default'}`;
  
  if (optionsInflight.has(cacheKey)) {
    return optionsInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-tradingview-options', {
        body: { 
          exchange: symbol.exchange, 
          symbol: symbol.symbol,
          maturity,
        },
      });

      if (error) {
        console.error('Error fetching TV options:', error);
        return null;
      }

      if (data?.success && data?.data) {
        return data.data as TVOptionsChain;
      }

      return null;
    } catch (err) {
      console.error('Failed to fetch TV options:', err);
      return null;
    } finally {
      optionsInflight.delete(cacheKey);
    }
  })();

  optionsInflight.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch TradingView options by strike (NEW - all maturities for a strike)
 */
export async function fetchTVOptionsByStrike(
  symbol: TVSymbol,
  strike: number
): Promise<TVOptionsByStrike | null> {
  const cacheKey = `tv-options-strike-${symbol.exchange}-${symbol.symbol}-${strike}`;
  
  if (optionsByStrikeInflight.has(cacheKey)) {
    return optionsByStrikeInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-tradingview-options', {
        body: { 
          exchange: symbol.exchange, 
          symbol: symbol.symbol,
          strike: strike,
          viewMode: 'strike'
        },
      });

      if (error) {
        console.error('Error fetching TV options by strike:', error);
        return null;
      }

      if (data?.success && data?.data) {
        return data.data as TVOptionsByStrike;
      }

      return null;
    } catch (err) {
      console.error('Failed to fetch TV options by strike:', err);
      return null;
    } finally {
      optionsByStrikeInflight.delete(cacheKey);
    }
  })();

  optionsByStrikeInflight.set(cacheKey, promise);
  return promise;
}

/**
 * Fetch available strikes from DB cache for a symbol
 */
export async function fetchTVStrikes(exchange: string, symbol: string): Promise<number[]> {
  const cacheKey = `tv-strikes-${exchange}-${symbol}`;

  if (strikesInflight.has(cacheKey)) {
    return strikesInflight.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      console.log(`Fetching TV strikes from DB for ${exchange}-${symbol}...`);
      const { data, error } = await supabase.functions.invoke('get-strikes', {
        body: { exchange, symbol },
      });

      if (error) {
        console.error('Error fetching TV strikes from DB:', error);
        return [];
      }

      if (data?.success && data?.data) {
        return data.data as number[];
      }

      return [];
    } catch (err) {
      console.error('Failed to fetch TV strikes from DB:', err);
      return [];
    } finally {
      strikesInflight.delete(cacheKey);
    }
  })();

  strikesInflight.set(cacheKey, promise);
  return promise;
}
