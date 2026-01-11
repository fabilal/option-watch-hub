// Commodity categories and their symbols
export type CommodityCategory = 'energies' | 'grains' | 'metals' | 'softs';

export interface CommoditySymbol {
  baseSymbol: string;
  name: string;
  exchange: string;
  optionPointValue?: number;
}

export interface Maturity {
  code: string;
  label: string;
  expiration: string;
}

export interface OptionData {
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

export interface OptionsChain {
  symbol: string;
  name: string;
  maturity: string;
  daysToExpiration: number;
  impliedVolatility: number;
  priceOfOptionPoint: number;
  calls: OptionData[];
  puts: OptionData[];
}

export interface FuturesPrice {
  contract: string;
  month: string;
  last: string;
  change: string;
  percentChange: string;
  open: string;
  high: string;
  low: string;
  volume: string;
  openInterest: string;
  time: string;
}

export interface FuturesPricesData {
  symbol: string;
  name: string;
  futures: FuturesPrice[];
}

export const COMMODITY_CATEGORIES: Record<CommodityCategory, { label: string; icon: string }> = {
  energies: { label: 'Energies', icon: '⚡' },
  grains: { label: 'Grains', icon: '🌾' },
  metals: { label: 'Metals', icon: '🥇' },
  softs: { label: 'Softs', icon: '☕' },
};

// Month codes for futures contracts with correct month indices
const MONTH_CODES: { code: string; name: string; monthIndex: number }[] = [
  { code: 'F', name: 'Jan', monthIndex: 0 },
  { code: 'G', name: 'Feb', monthIndex: 1 },
  { code: 'H', name: 'Mar', monthIndex: 2 },
  { code: 'J', name: 'Apr', monthIndex: 3 },
  { code: 'K', name: 'May', monthIndex: 4 },
  { code: 'M', name: 'Jun', monthIndex: 5 },
  { code: 'N', name: 'Jul', monthIndex: 6 },
  { code: 'Q', name: 'Aug', monthIndex: 7 },
  { code: 'U', name: 'Sep', monthIndex: 8 },
  { code: 'V', name: 'Oct', monthIndex: 9 },
  { code: 'X', name: 'Nov', monthIndex: 10 },
  { code: 'Z', name: 'Dec', monthIndex: 11 },
];

// Generate maturities for the next 2 years, starting from next month
export function generateMaturities(): Maturity[] {
  const maturities: Maturity[] = [];
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  // Start from next month to ensure we get contracts with active options
  // Options typically expire before the contract month
  const minExpirationDate = new Date(currentYear, currentMonth + 2, 1);
  
  for (let yearOffset = 0; yearOffset < 3; yearOffset++) {
    const year = currentYear + yearOffset;
    const yearSuffix = year.toString().slice(-2);
    
    for (const { code, name, monthIndex } of MONTH_CODES) {
      // Expiration is typically mid-month before the contract month
      const expirationDate = new Date(year, monthIndex, 14);
      
      if (expirationDate >= minExpirationDate) {
        maturities.push({
          code: `${code}${yearSuffix}`,
          label: `${name} ${year}`,
          expiration: expirationDate.toISOString().split('T')[0],
        });
      }
    }
  }
  
  return maturities.slice(0, 24); // Limit to 24 maturities
}

// Build the volatility-greeks URL for scraping
export function buildVolatilityUrl(baseSymbol: string, maturityCode: string): string {
  return `https://www.barchart.com/futures/quotes/${baseSymbol}${maturityCode}/volatility-greeks?futuresOptionsView=merged`;
}

