import { supabase } from '@/integrations/supabase/client';
import { 
  type CommoditySymbol, 
  type Maturity, 
  type OptionsChain,
  type OptionData,
  type FuturesPrice,
  type FuturesPricesData,
  COMMODITY_SYMBOLS,
} from './commodityData';

interface ScrapeOptionsResponse {
  success: boolean;
  symbol: string;
  name: string;
  maturity: string;
  daysToExpiration: number;
  impliedVolatility: number;
  priceOfOptionPoint: number;
  calls: OptionData[];
  puts: OptionData[];
  error?: string;
  code?: 'RATE_LIMIT' | 'SCRAPE_FAILED';
  retryAfterSeconds?: number;
}

interface ScrapeSymbolsResponse {
  success: boolean;
  category: string;
  symbols: {
    symbol: string;
    name: string;
    latest: string;
    change: string;
    volume: string;
  }[];
  error?: string;
  code?: 'RATE_LIMIT' | 'SCRAPE_FAILED';
  retryAfterSeconds?: number;
}

interface ScrapeFuturesResponse {
  success: boolean;
  symbol: string;
  name: string;
  futures: FuturesPrice[];
  error?: string;
  code?: 'RATE_LIMIT' | 'SCRAPE_FAILED';
  retryAfterSeconds?: number;
}

const optionsInflight = new Map<string, Promise<OptionsChain | null>>();
const symbolsInflight = new Map<string, Promise<CommoditySymbol[]>>();
const futuresInflight = new Map<string, Promise<FuturesPricesData | null>>();

export async function fetchOptionsData(
  symbol: CommoditySymbol,
  maturity: Maturity
): Promise<OptionsChain | null> {
  const requestKey = `${symbol.baseSymbol}:${maturity.code}`;
  const existing = optionsInflight.get(requestKey);
  if (existing) return existing;

  const promise = (async () => {
    console.log(`Fetching options data for ${symbol.baseSymbol}${maturity.code}`);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-barchart-options', {
        body: {
          symbol: symbol.baseSymbol,
          maturityCode: maturity.code,
          name: symbol.name,
          optionPointValue: symbol.optionPointValue,
        },
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(error.message);
      }

      const response = data as ScrapeOptionsResponse;

      if (!response.success) {
        if (response.code === 'RATE_LIMIT') {
          const retry = response.retryAfterSeconds ?? 30;
          throw new Error(`Limite de requêtes atteinte. Réessaie dans ~${retry}s.`);
        }

        console.error('Scrape failed:', response.error);
        throw new Error(response.error || 'Failed to scrape options data');
      }

      // If scraping returned empty data, it means the page structure might have changed
      // or the symbol/maturity combination doesn't exist
      if (response.calls.length === 0 && response.puts.length === 0) {
        console.warn('No options data found in scraped content');
      }

      return {
        symbol: response.symbol,
        name: response.name || symbol.name,
        maturity: response.maturity || maturity.label,
        daysToExpiration: response.daysToExpiration,
        impliedVolatility: response.impliedVolatility,
        priceOfOptionPoint: response.priceOfOptionPoint || symbol.optionPointValue || 1000,
        calls: response.calls,
        puts: response.puts,
      };
    } catch (error) {
      console.error('Error fetching options data:', error);
      throw error;
    }
  })();

  optionsInflight.set(requestKey, promise);

  try {
    return await promise;
  } finally {
    optionsInflight.delete(requestKey);
  }
}

export async function fetchCategorySymbols(category: string): Promise<CommoditySymbol[]> {
  const requestKey = category;
  const existing = symbolsInflight.get(requestKey);
  if (existing) return existing;

  const promise = (async () => {
    console.log(`Fetching symbols for category: ${category}`);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-barchart-symbols', {
        body: { category },
      });

      if (error) {
        console.error('Supabase function error:', error);
        // Fall back to static symbols
        return COMMODITY_SYMBOLS[category as keyof typeof COMMODITY_SYMBOLS] || [];
      }

      const response = data as ScrapeSymbolsResponse;

      if (!response.success) {
        if (response.code === 'RATE_LIMIT') {
          console.warn(`Rate limited while fetching symbols for ${category}; using fallback list.`);
          return COMMODITY_SYMBOLS[category as keyof typeof COMMODITY_SYMBOLS] || [];
        }

        console.error('Scrape failed:', response.error);
        // Fall back to static symbols
        return COMMODITY_SYMBOLS[category as keyof typeof COMMODITY_SYMBOLS] || [];
      }

      if (response.symbols.length === 0) {
        // Fall back to static symbols if scraping returned nothing
        return COMMODITY_SYMBOLS[category as keyof typeof COMMODITY_SYMBOLS] || [];
      }

      // Map to CommoditySymbol format with exchange info
      return response.symbols.map((s) => ({
        baseSymbol: s.symbol,
        name: s.name,
        exchange: getExchangeForSymbol(s.symbol, category),
        optionPointValue: getOptionPointValue(s.symbol),
      }));
    } catch (error) {
      console.error('Error fetching category symbols:', error);
      // Fall back to static symbols
      return COMMODITY_SYMBOLS[category as keyof typeof COMMODITY_SYMBOLS] || [];
    }
  })();

  symbolsInflight.set(requestKey, promise);

  try {
    return await promise;
  } finally {
    symbolsInflight.delete(requestKey);
  }
}

function getExchangeForSymbol(symbol: string, category: string): string {
  const exchanges: Record<string, string> = {
    // Energies
    CL: 'NYMEX', HO: 'NYMEX', RB: 'NYMEX', NG: 'NYMEX', QA: 'NYMEX',
    QM: 'NYMEX', QG: 'NYMEX', MCL: 'NYMEX', BZ: 'NYMEX', QH: 'NYMEX', QU: 'NYMEX',
    MNG: 'NYMEX', HH: 'NYMEX', PA: 'NYMEX', C0: 'CBOT',
    // Grains
    ZC: 'CBOT', ZS: 'CBOT', ZM: 'CBOT', ZL: 'CBOT', ZW: 'CBOT', ZO: 'CBOT', ZR: 'CBOT',
    KE: 'KCBT', KW: 'KCBT', MW: 'MGEX', MWE: 'MGEX', 
    XC: 'CBOT', XW: 'CBOT', XK: 'CBOT', YC: 'CBOT', RS: 'ICE',
    // Metals
    GC: 'COMEX', SI: 'COMEX', HG: 'COMEX', PL: 'NYMEX',
    MGC: 'COMEX', SIL: 'COMEX', QO: 'COMEX', QI: 'COMEX', QC: 'COMEX', 
    ALI: 'COMEX', MHG: 'COMEX', YG: 'COMEX', YI: 'COMEX',
    // Softs/Livestock
    CT: 'ICE', KC: 'ICE', SB: 'ICE', CC: 'ICE', OJ: 'ICE', 
    SD: 'ICE', SW: 'ICE', RM: 'ICE', CA: 'ICE',
    LB: 'CME', LBS: 'CME',
    LE: 'CME', GF: 'CME', HE: 'CME', 
    DC: 'CME', DA: 'CME', CB: 'CME', CSC: 'CME', DY: 'CME', GNF: 'CME', GDK: 'CME',
  };
  
  if (exchanges[symbol]) return exchanges[symbol];
  
  const categoryExchanges: Record<string, string> = {
    energies: 'NYMEX',
    grains: 'CBOT',
    metals: 'COMEX',
    softs: 'ICE',
  };
  
  return categoryExchanges[category] || 'NYMEX';
}

function getOptionPointValue(symbol: string): number {
  const values: Record<string, number> = {
    // Energies
    CL: 1000, HO: 42000, RB: 42000, NG: 10000, QA: 1000,
    QM: 500, QG: 2500, MCL: 100, BZ: 1000, QH: 10500, QU: 10500,
    MNG: 1000, HH: 10000, PA: 42000, C0: 29000,
    // Grains
    ZC: 50, ZS: 50, ZM: 100, ZL: 600, ZW: 50, ZO: 50, ZR: 20,
    KE: 50, KW: 50, MW: 50, MWE: 50, 
    XC: 10, XW: 10, XK: 10, YC: 10, RS: 20,
    // Metals
    GC: 100, SI: 5000, HG: 25000, PL: 50,
    MGC: 10, SIL: 1000, QO: 50, QI: 2500, QC: 6250, 
    ALI: 25000, MHG: 2500, YG: 33, YI: 1000, GDK: 2000,
    // Softs/Livestock
    CT: 500, KC: 375, SB: 1120, CC: 10, OJ: 150, 
    SD: 1120, SW: 50, RM: 10, CA: 10,
    LB: 110, LBS: 110,
    LE: 400, GF: 500, HE: 400, 
    DC: 2000, DA: 2000, CB: 2000, CSC: 2000, DY: 44000, GNF: 44000,
  };
  
  return values[symbol] || 1000;
}

export async function fetchFuturesPrices(
  symbol: CommoditySymbol,
  maturity: Maturity
): Promise<FuturesPricesData | null> {
  const requestKey = `futures:${symbol.baseSymbol}:${maturity.code}`;
  const existing = futuresInflight.get(requestKey);
  if (existing) return existing;

  const promise = (async () => {
    console.log(`Fetching futures prices for ${symbol.baseSymbol}${maturity.code}`);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-barchart-futures', {
        body: {
          symbol: symbol.baseSymbol,
          maturityCode: maturity.code,
          name: symbol.name,
        },
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(error.message);
      }

      const response = data as ScrapeFuturesResponse;

      if (!response.success) {
        if (response.code === 'RATE_LIMIT') {
          const retry = response.retryAfterSeconds ?? 30;
          throw new Error(`Limite de requêtes atteinte. Réessaie dans ~${retry}s.`);
        }

        console.error('Scrape failed:', response.error);
        throw new Error(response.error || 'Failed to scrape futures data');
      }

      return {
        symbol: response.symbol,
        name: response.name || symbol.name,
        futures: response.futures,
      };
    } catch (error) {
      console.error('Error fetching futures data:', error);
      throw error;
    }
  })();

  futuresInflight.set(requestKey, promise);

  try {
    return await promise;
  } finally {
    futuresInflight.delete(requestKey);
  }
}
