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

export const COMMODITY_CATEGORIES: Record<CommodityCategory, { label: string; icon: string }> = {
  energies: { label: 'Energies', icon: '⚡' },
  grains: { label: 'Grains', icon: '🌾' },
  metals: { label: 'Metals', icon: '🥇' },
  softs: { label: 'Softs', icon: '☕' },
};

export const COMMODITY_SYMBOLS: Record<CommodityCategory, CommoditySymbol[]> = {
  energies: [
    { baseSymbol: 'CL', name: 'Crude Oil WTI', exchange: 'NYMEX', optionPointValue: 1000 },
    { baseSymbol: 'HO', name: 'ULSD NY Harbor', exchange: 'NYMEX', optionPointValue: 42000 },
    { baseSymbol: 'RB', name: 'Gasoline RBOB', exchange: 'NYMEX', optionPointValue: 42000 },
    { baseSymbol: 'NG', name: 'Natural Gas', exchange: 'NYMEX', optionPointValue: 10000 },
    { baseSymbol: 'QA', name: 'Crude Oil Brent (F)', exchange: 'NYMEX', optionPointValue: 1000 },
  ],
  grains: [
    { baseSymbol: 'ZC', name: 'Corn', exchange: 'CBOT', optionPointValue: 50 },
    { baseSymbol: 'ZS', name: 'Soybean', exchange: 'CBOT', optionPointValue: 50 },
    { baseSymbol: 'ZM', name: 'Soybean Meal', exchange: 'CBOT', optionPointValue: 100 },
    { baseSymbol: 'ZL', name: 'Soybean Oil', exchange: 'CBOT', optionPointValue: 600 },
    { baseSymbol: 'ZW', name: 'Wheat', exchange: 'CBOT', optionPointValue: 50 },
  ],
  metals: [
    { baseSymbol: 'GC', name: 'Gold', exchange: 'COMEX', optionPointValue: 100 },
    { baseSymbol: 'SI', name: 'Silver', exchange: 'COMEX', optionPointValue: 5000 },
    { baseSymbol: 'HG', name: 'High Grade Copper', exchange: 'COMEX', optionPointValue: 25000 },
    { baseSymbol: 'PA', name: 'Palladium', exchange: 'NYMEX', optionPointValue: 100 },
    { baseSymbol: 'PL', name: 'Platinum', exchange: 'NYMEX', optionPointValue: 50 },
  ],
  softs: [
    { baseSymbol: 'CT', name: 'Cotton #2', exchange: 'ICE', optionPointValue: 500 },
    { baseSymbol: 'KC', name: 'Coffee', exchange: 'ICE', optionPointValue: 375 },
    { baseSymbol: 'SB', name: 'Sugar #11', exchange: 'ICE', optionPointValue: 1120 },
    { baseSymbol: 'CC', name: 'Cocoa', exchange: 'ICE', optionPointValue: 10 },
    { baseSymbol: 'OJ', name: 'Orange Juice', exchange: 'ICE', optionPointValue: 150 },
  ],
};

// Month codes for futures contracts
const MONTH_CODES: Record<string, string> = {
  F: 'Jan',
  G: 'Feb',
  H: 'Mar',
  J: 'Apr',
  K: 'May',
  M: 'Jun',
  N: 'Jul',
  Q: 'Aug',
  U: 'Sep',
  V: 'Oct',
  X: 'Nov',
  Z: 'Dec',
};

// Generate maturities for the next 2 years
export function generateMaturities(): Maturity[] {
  const maturities: Maturity[] = [];
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  
  for (let yearOffset = 0; yearOffset < 3; yearOffset++) {
    const year = currentYear + yearOffset;
    const yearSuffix = year.toString().slice(-2);
    
    Object.entries(MONTH_CODES).forEach(([code, month]) => {
      const monthIndex = Object.keys(MONTH_CODES).indexOf(code);
      const expirationDate = new Date(year, monthIndex, 14); // Approximate expiration
      
      if (expirationDate > currentDate) {
        maturities.push({
          code: `${code}${yearSuffix}`,
          label: `${month} ${year}`,
          expiration: expirationDate.toISOString().split('T')[0],
        });
      }
    });
  }
  
  return maturities.slice(0, 24); // Limit to 24 maturities
}

// Build the volatility-greeks URL for scraping
export function buildVolatilityUrl(baseSymbol: string, maturityCode: string): string {
  return `https://www.barchart.com/futures/quotes/${baseSymbol}${maturityCode}/volatility-greeks?futuresOptionsView=merged`;
}

// Demo data generator for showcasing the dashboard
export function generateDemoOptionsData(symbol: CommoditySymbol, maturity: Maturity): OptionsChain {
  const basePrice = getBasePriceForSymbol(symbol.baseSymbol);
  const baseIV = 25 + Math.random() * 15;
  
  const strikes = generateStrikes(basePrice);
  const calls: OptionData[] = [];
  const puts: OptionData[] = [];
  
  strikes.forEach((strike, i) => {
    const moneyness = (strike - basePrice) / basePrice;
    const ivAdjustment = Math.abs(moneyness) * 5 + Math.random() * 2;
    
    calls.push({
      strike,
      type: 'Call',
      latest: (Math.max(0, basePrice - strike) + Math.random() * 2).toFixed(2) + 's',
      iv: +(baseIV + ivAdjustment - moneyness * 3).toFixed(2),
      delta: +Math.max(0, Math.min(1, 0.5 - moneyness * 2)).toFixed(4),
      gamma: +(0.05 + Math.random() * 0.05).toFixed(4),
      theta: -(0.02 + Math.random() * 0.03),
      vega: +(0.03 + Math.random() * 0.02).toFixed(4),
      ivSkew: +((Math.random() - 0.5) * 10).toFixed(2),
      lastTrade: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
    });
    
    puts.push({
      strike,
      type: 'Put',
      latest: (Math.max(0, strike - basePrice) + Math.random() * 2).toFixed(2) + 's',
      iv: +(baseIV + ivAdjustment + moneyness * 3).toFixed(2),
      delta: -Math.max(0, Math.min(1, 0.5 + moneyness * 2)),
      gamma: +(0.05 + Math.random() * 0.05).toFixed(4),
      theta: -(0.02 + Math.random() * 0.03),
      vega: +(0.03 + Math.random() * 0.02).toFixed(4),
      ivSkew: +((Math.random() - 0.5) * 10).toFixed(2),
      lastTrade: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
    });
  });
  
  return {
    symbol: symbol.baseSymbol,
    name: symbol.name,
    maturity: maturity.label,
    daysToExpiration: Math.floor((new Date(maturity.expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    impliedVolatility: +baseIV.toFixed(2),
    priceOfOptionPoint: symbol.optionPointValue || 1000,
    calls,
    puts,
  };
}

function getBasePriceForSymbol(baseSymbol: string): number {
  const prices: Record<string, number> = {
    CL: 56.74,
    HO: 2.10,
    RB: 1.73,
    NG: 3.30,
    QA: 60.24,
    ZC: 450,
    ZS: 1058,
    ZM: 303.7,
    ZL: 48.72,
    ZW: 536,
    GC: 4552.7,
    SI: 77.19,
    HG: 5.84,
    PA: 935,
    PL: 925,
    CT: 64.49,
    KC: 350.25,
    SB: 15.17,
    CC: 5953,
    OJ: 471,
  };
  return prices[baseSymbol] || 100;
}

function generateStrikes(basePrice: number): number[] {
  const step = basePrice > 1000 ? 50 : basePrice > 100 ? 5 : basePrice > 10 ? 0.5 : 0.05;
  const strikes: number[] = [];
  const startStrike = Math.floor(basePrice / step) * step - step * 10;
  
  for (let i = 0; i < 21; i++) {
    strikes.push(+(startStrike + i * step).toFixed(2));
  }
  
  return strikes;
}
