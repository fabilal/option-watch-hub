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
  bidIv: number;
  askIv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  intrinsicValue: number;
  timeValue: number;
}

export interface TVOptionsChain {
  underlyingSymbol: string;
  underlyingPrice: string;
  underlyingContract: string;
  maturities: string[];
  selectedMaturity: string;
  calls: TVOptionContract[];
  puts: TVOptionContract[];
}

// In-flight request deduplication
const symbolsInflight = new Map<string, Promise<TVSymbol[]>>();
const futuresInflight = new Map<string, Promise<TVFuturesContract[]>>();
const optionsInflight = new Map<string, Promise<TVOptionsChain | null>>();

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
        return getDefaultSymbols(category);
      }

      if (data?.success && data?.data) {
        return data.data as TVSymbol[];
      }

      return getDefaultSymbols(category);
    } catch (err) {
      console.error('Failed to fetch TV symbols:', err);
      return getDefaultSymbols(category);
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

// Default symbols fallback
function getDefaultSymbols(category: TVCategory): TVSymbol[] {
  const defaults: Record<TVCategory, TVSymbol[]> = {
    energy: [
      { symbol: 'CL1!', name: 'Crude Oil WTI', exchange: 'NYMEX', type: 'futures' },
      { symbol: 'BZ1!', name: 'Brent Crude Oil', exchange: 'NYMEX', type: 'futures' },
      { symbol: 'NG1!', name: 'Natural Gas', exchange: 'NYMEX', type: 'futures' },
      { symbol: 'RB1!', name: 'RBOB Gasoline', exchange: 'NYMEX', type: 'futures' },
      { symbol: 'HO1!', name: 'Heating Oil', exchange: 'NYMEX', type: 'futures' },
    ],
    agriculture: [
      { symbol: 'ZC1!', name: 'Corn', exchange: 'CBOT', type: 'futures' },
      { symbol: 'ZS1!', name: 'Soybeans', exchange: 'CBOT', type: 'futures' },
      { symbol: 'ZW1!', name: 'Wheat', exchange: 'CBOT', type: 'futures' },
      { symbol: 'CT1!', name: 'Cotton', exchange: 'NYMEX', type: 'futures' },
      { symbol: 'KC1!', name: 'Coffee', exchange: 'NYMEX', type: 'futures' },
      { symbol: 'SB1!', name: 'Sugar', exchange: 'NYMEX', type: 'futures' },
    ],
    metals: [
      { symbol: 'GC1!', name: 'Gold', exchange: 'COMEX', type: 'futures' },
      { symbol: 'SI1!', name: 'Silver', exchange: 'COMEX', type: 'futures' },
      { symbol: 'HG1!', name: 'Copper', exchange: 'COMEX', type: 'futures' },
      { symbol: 'PL1!', name: 'Platinum', exchange: 'NYMEX', type: 'futures' },
      { symbol: 'PA1!', name: 'Palladium', exchange: 'NYMEX', type: 'futures' },
    ],
  };
  return defaults[category];
}
