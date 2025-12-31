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

// Comprehensive list of commodity symbols from Barchart.com
export const COMMODITY_SYMBOLS: Record<CommodityCategory, CommoditySymbol[]> = {
  energies: [
    // Crude Oil
    { baseSymbol: 'CL', name: 'Crude Oil WTI', exchange: 'NYMEX', optionPointValue: 1000 },
    { baseSymbol: 'BZ', name: 'Brent Crude Oil', exchange: 'NYMEX', optionPointValue: 1000 },
    { baseSymbol: 'QM', name: 'E-mini Crude Oil', exchange: 'NYMEX', optionPointValue: 500 },
    { baseSymbol: 'MCL', name: 'Micro WTI Crude Oil', exchange: 'NYMEX', optionPointValue: 100 },
    { baseSymbol: 'QA', name: 'Crude Oil Brent (F)', exchange: 'NYMEX', optionPointValue: 1000 },
    // Natural Gas
    { baseSymbol: 'NG', name: 'Natural Gas', exchange: 'NYMEX', optionPointValue: 10000 },
    { baseSymbol: 'QG', name: 'E-mini Natural Gas', exchange: 'NYMEX', optionPointValue: 2500 },
    { baseSymbol: 'MNG', name: 'Micro Natural Gas', exchange: 'NYMEX', optionPointValue: 1000 },
    { baseSymbol: 'HH', name: 'Natural Gas Last Day', exchange: 'NYMEX', optionPointValue: 10000 },
    // Petroleum Products
    { baseSymbol: 'RB', name: 'RBOB Gasoline', exchange: 'NYMEX', optionPointValue: 42000 },
    { baseSymbol: 'HO', name: 'NY Harbor ULSD', exchange: 'NYMEX', optionPointValue: 42000 },
    { baseSymbol: 'QH', name: 'E-mini Heating Oil', exchange: 'NYMEX', optionPointValue: 10500 },
    { baseSymbol: 'QU', name: 'E-mini RBOB Gasoline', exchange: 'NYMEX', optionPointValue: 10500 },
    // Other Energy
    { baseSymbol: 'PA', name: 'Propane (OPIS)', exchange: 'NYMEX', optionPointValue: 42000 },
    { baseSymbol: 'C0', name: 'Ethanol (CBOT)', exchange: 'CBOT', optionPointValue: 29000 },
  ],
  grains: [
    // Corn
    { baseSymbol: 'ZC', name: 'Corn', exchange: 'CBOT', optionPointValue: 50 },
    { baseSymbol: 'XC', name: 'Mini Corn', exchange: 'CBOT', optionPointValue: 10 },
    { baseSymbol: 'YC', name: 'Mini Corn (Old)', exchange: 'CBOT', optionPointValue: 10 },
    // Soybeans
    { baseSymbol: 'ZS', name: 'Soybeans', exchange: 'CBOT', optionPointValue: 50 },
    { baseSymbol: 'XK', name: 'Mini Soybeans', exchange: 'CBOT', optionPointValue: 10 },
    { baseSymbol: 'ZM', name: 'Soybean Meal', exchange: 'CBOT', optionPointValue: 100 },
    { baseSymbol: 'ZL', name: 'Soybean Oil', exchange: 'CBOT', optionPointValue: 600 },
    // Wheat
    { baseSymbol: 'ZW', name: 'Wheat (CBOT)', exchange: 'CBOT', optionPointValue: 50 },
    { baseSymbol: 'XW', name: 'Mini Wheat', exchange: 'CBOT', optionPointValue: 10 },
    { baseSymbol: 'KE', name: 'Hard Red Winter Wheat', exchange: 'KCBT', optionPointValue: 50 },
    { baseSymbol: 'KW', name: 'KC HRW Wheat', exchange: 'KCBT', optionPointValue: 50 },
    { baseSymbol: 'MW', name: 'Spring Wheat Minneapolis', exchange: 'MGEX', optionPointValue: 50 },
    { baseSymbol: 'MWE', name: 'Hard Red Spring Wheat', exchange: 'MGEX', optionPointValue: 50 },
    // Other Grains
    { baseSymbol: 'ZO', name: 'Oats', exchange: 'CBOT', optionPointValue: 50 },
    { baseSymbol: 'ZR', name: 'Rough Rice', exchange: 'CBOT', optionPointValue: 20 },
    // Canola & Seeds
    { baseSymbol: 'RS', name: 'Canola (ICE)', exchange: 'ICE', optionPointValue: 20 },
  ],
  metals: [
    // Gold
    { baseSymbol: 'GC', name: 'Gold', exchange: 'COMEX', optionPointValue: 100 },
    { baseSymbol: 'MGC', name: 'Micro Gold', exchange: 'COMEX', optionPointValue: 10 },
    { baseSymbol: 'QO', name: 'E-mini Gold', exchange: 'COMEX', optionPointValue: 50 },
    { baseSymbol: 'YG', name: 'Mini Gold (Old)', exchange: 'COMEX', optionPointValue: 33 },
    // Silver
    { baseSymbol: 'SI', name: 'Silver', exchange: 'COMEX', optionPointValue: 5000 },
    { baseSymbol: 'SIL', name: 'Micro Silver', exchange: 'COMEX', optionPointValue: 1000 },
    { baseSymbol: 'QI', name: 'E-mini Silver', exchange: 'COMEX', optionPointValue: 2500 },
    { baseSymbol: 'YI', name: 'Mini Silver (Old)', exchange: 'COMEX', optionPointValue: 1000 },
    // Copper
    { baseSymbol: 'HG', name: 'Copper', exchange: 'COMEX', optionPointValue: 25000 },
    { baseSymbol: 'MHG', name: 'Micro Copper', exchange: 'COMEX', optionPointValue: 2500 },
    { baseSymbol: 'QC', name: 'E-mini Copper', exchange: 'COMEX', optionPointValue: 6250 },
    // Platinum Group
    { baseSymbol: 'PL', name: 'Platinum', exchange: 'NYMEX', optionPointValue: 50 },
    { baseSymbol: 'PA', name: 'Palladium', exchange: 'NYMEX', optionPointValue: 100 },
    // Industrial Metals
    { baseSymbol: 'ALI', name: 'Aluminum', exchange: 'COMEX', optionPointValue: 25000 },
    // Other
    { baseSymbol: 'GDK', name: 'Class III Milk', exchange: 'CME', optionPointValue: 2000 },
  ],
  softs: [
    // Cotton
    { baseSymbol: 'CT', name: 'Cotton #2', exchange: 'ICE', optionPointValue: 500 },
    // Coffee
    { baseSymbol: 'KC', name: 'Coffee "C" Arabica', exchange: 'ICE', optionPointValue: 375 },
    { baseSymbol: 'RM', name: 'Robusta Coffee', exchange: 'ICE', optionPointValue: 10 },
    // Sugar
    { baseSymbol: 'SB', name: 'Sugar #11 (World)', exchange: 'ICE', optionPointValue: 1120 },
    { baseSymbol: 'SD', name: 'Sugar #16 (Domestic)', exchange: 'ICE', optionPointValue: 1120 },
    { baseSymbol: 'SW', name: 'White Sugar', exchange: 'ICE', optionPointValue: 50 },
    // Cocoa
    { baseSymbol: 'CC', name: 'Cocoa', exchange: 'ICE', optionPointValue: 10 },
    { baseSymbol: 'CA', name: 'Cocoa (London)', exchange: 'ICE', optionPointValue: 10 },
    // Other Softs
    { baseSymbol: 'OJ', name: 'Orange Juice', exchange: 'ICE', optionPointValue: 150 },
    { baseSymbol: 'LB', name: 'Lumber', exchange: 'CME', optionPointValue: 110 },
    { baseSymbol: 'LBS', name: 'Lumber Physical', exchange: 'CME', optionPointValue: 110 },
    // Livestock
    { baseSymbol: 'LE', name: 'Live Cattle', exchange: 'CME', optionPointValue: 400 },
    { baseSymbol: 'GF', name: 'Feeder Cattle', exchange: 'CME', optionPointValue: 500 },
    { baseSymbol: 'HE', name: 'Lean Hogs', exchange: 'CME', optionPointValue: 400 },
    // Dairy
    { baseSymbol: 'DC', name: 'Class III Milk', exchange: 'CME', optionPointValue: 2000 },
    { baseSymbol: 'DA', name: 'Class IV Milk', exchange: 'CME', optionPointValue: 2000 },
    { baseSymbol: 'CB', name: 'Cash-Settled Butter', exchange: 'CME', optionPointValue: 2000 },
    { baseSymbol: 'CSC', name: 'Cash-Settled Cheese', exchange: 'CME', optionPointValue: 2000 },
    { baseSymbol: 'DY', name: 'Dry Whey', exchange: 'CME', optionPointValue: 44000 },
    { baseSymbol: 'GNF', name: 'Non-fat Dry Milk', exchange: 'CME', optionPointValue: 44000 },
  ],
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

