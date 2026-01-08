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

// In-flight request deduplication
const symbolsInflight = new Map<string, Promise<TVForexSymbol[]>>();
const futuresInflight = new Map<string, Promise<TVForexFutures[]>>();
const optionsInflight = new Map<string, Promise<TVForexOptionsChain | null>>();
const maturitiesInflight = new Map<string, Promise<string[]>>();

// Default symbols if API fails
const DEFAULT_SYMBOLS: TVForexSymbol[] = [
  { symbol: '6E1!', name: 'Euro FX Futures', exchange: 'CME', price: '1.1700', change: '0', changePercent: '0%' },
  { symbol: '6B1!', name: 'British Pound Futures', exchange: 'CME', price: '1.3400', change: '0', changePercent: '0%' },
  { symbol: '6J1!', name: 'Japanese Yen Futures', exchange: 'CME', price: '0.0064', change: '0', changePercent: '0%' },
  { symbol: '6A1!', name: 'Australian Dollar Futures', exchange: 'CME', price: '0.6700', change: '0', changePercent: '0%' },
  { symbol: '6C1!', name: 'Canadian Dollar Futures', exchange: 'CME', price: '0.7200', change: '0', changePercent: '0%' },
  { symbol: '6S1!', name: 'Swiss Franc Futures', exchange: 'CME', price: '1.2600', change: '0', changePercent: '0%' },
  { symbol: '6N1!', name: 'New Zealand Dollar Futures', exchange: 'CME', price: '0.5800', change: '0', changePercent: '0%' },
  { symbol: '6M1!', name: 'Mexican Peso Futures', exchange: 'CME', price: '0.0550', change: '0', changePercent: '0%' },
  { symbol: 'DX1!', name: 'US Dollar Index Futures', exchange: 'ICEUS', price: '98.00', change: '0', changePercent: '0%' },
  { symbol: 'BTC1!', name: 'Bitcoin Futures', exchange: 'CME', price: '90000', change: '0', changePercent: '0%' },
  { symbol: 'ETH1!', name: 'Ether Futures', exchange: 'CME', price: '3100', change: '0', changePercent: '0%' },
];

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
        return DEFAULT_SYMBOLS;
      }

      if (!data?.success || !data?.data?.length) {
        console.warn('No TV forex symbols returned, using defaults');
        return DEFAULT_SYMBOLS;
      }

      console.log(`Fetched ${data.data.length} TV forex symbols`);
      return data.data;
    } catch (err) {
      console.error('Failed to fetch TV forex symbols:', err);
      return DEFAULT_SYMBOLS;
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
        console.warn('No TV forex futures returned');
        return [];
      }

      console.log(`Fetched ${data.data?.length || 0} TV forex futures contracts`);
      return data.data || [];
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
