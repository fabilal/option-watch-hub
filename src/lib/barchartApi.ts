import { supabase } from '@/integrations/supabase/client';
import { 
  type CommoditySymbol, 
  type Maturity, 
  type OptionsChain,
  type OptionData,
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
}

export async function fetchOptionsData(
  symbol: CommoditySymbol,
  maturity: Maturity
): Promise<OptionsChain | null> {
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
}

export async function fetchCategorySymbols(category: string): Promise<CommoditySymbol[]> {
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
}

function getExchangeForSymbol(symbol: string, category: string): string {
  const exchanges: Record<string, string> = {
    CL: 'NYMEX', HO: 'NYMEX', RB: 'NYMEX', NG: 'NYMEX', QA: 'NYMEX',
    ZC: 'CBOT', ZS: 'CBOT', ZM: 'CBOT', ZL: 'CBOT', ZW: 'CBOT', ZO: 'CBOT',
    GC: 'COMEX', SI: 'COMEX', HG: 'COMEX', PA: 'NYMEX', PL: 'NYMEX',
    CT: 'ICE', KC: 'ICE', SB: 'ICE', CC: 'ICE', OJ: 'ICE',
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
    CL: 1000, HO: 42000, RB: 42000, NG: 10000, QA: 1000,
    ZC: 50, ZS: 50, ZM: 100, ZL: 600, ZW: 50,
    GC: 100, SI: 5000, HG: 25000, PA: 100, PL: 50,
    CT: 500, KC: 375, SB: 1120, CC: 10, OJ: 150,
  };
  
  return values[symbol] || 1000;
}
