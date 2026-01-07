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

// In-flight request deduplication
const symbolsInflight = new Map<string, Promise<TVForexSymbol[]>>();
const futuresInflight = new Map<string, Promise<TVForexFutures[]>>();

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
  
  // Check if request is in flight
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
  
  // Check if request is in flight
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
