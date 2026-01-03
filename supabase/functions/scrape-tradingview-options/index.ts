import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptionContract {
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

interface OptionsChainData {
  underlyingSymbol: string;
  underlyingPrice: string;
  maturities: string[];
  selectedMaturity: string;
  calls: OptionContract[];
  puts: OptionContract[];
}

interface CacheEntry {
  expiresAt: number;
  data: OptionsChainData | null;
  error?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const NEGATIVE_CACHE_TTL_MS = 30 * 1000; // 30 seconds

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OptionsChainData | null>>();

function getFromCache(key: string): OptionsChainData | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { exchange, symbol, maturity } = await req.json();

    if (!exchange || !symbol) {
      return new Response(
        JSON.stringify({ success: false, error: 'Exchange and symbol are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cacheKey = `${exchange}-${symbol}-${maturity || 'default'}`;
    
    // Check cache
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log(`Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify({ success: true, data: cached }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check inflight
    if (inflight.has(cacheKey)) {
      console.log(`Waiting for inflight request: ${cacheKey}`);
      const result = await inflight.get(cacheKey);
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build URL
    let url = `https://www.tradingview.com/symbols/${exchange}-${symbol}/options-chain/`;
    console.log(`Scraping TradingView options: ${url}`);

    const scrapePromise = (async (): Promise<OptionsChainData | null> => {
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 5000,
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          console.error('Firecrawl error:', data);
          cache.set(cacheKey, { 
            expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, 
            data: null,
            error: data.error 
          });
          return null;
        }

        const markdown = data.data?.markdown || data.markdown || '';
        console.log('Markdown length:', markdown.length);
        
        const optionsData = parseOptionsFromMarkdown(markdown, symbol);
        console.log(`Parsed: ${optionsData.calls.length} calls, ${optionsData.puts.length} puts, ${optionsData.maturities.length} maturities`);

        cache.set(cacheKey, { 
          expiresAt: Date.now() + CACHE_TTL_MS, 
          data: optionsData 
        });

        return optionsData;
      } catch (err) {
        console.error('Scrape error:', err);
        cache.set(cacheKey, { 
          expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, 
          data: null,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
        return null;
      } finally {
        inflight.delete(cacheKey);
      }
    })();

    inflight.set(cacheKey, scrapePromise);
    const result = await scrapePromise;

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Handler error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseOptionsFromMarkdown(markdown: string, symbol: string): OptionsChainData {
  const result: OptionsChainData = {
    underlyingSymbol: symbol,
    underlyingPrice: '0',
    maturities: [],
    selectedMaturity: '',
    calls: [],
    puts: [],
  };

  const lines = markdown.split('\n');
  
  // Extract underlying price - look for pattern like "57.33DUSD" or "57.33USD"
  const priceMatch = markdown.match(/(\d+\.\d+)\s*D?USD/);
  if (priceMatch) {
    result.underlyingPrice = priceMatch[1];
  }

  // Extract maturities - look for patterns like "Jan '26", "Feb", "Mar '27", etc
  const maturityPattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s*'?\d{2})?/g;
  const foundMaturities = new Set<string>();
  let match;
  while ((match = maturityPattern.exec(markdown)) !== null) {
    foundMaturities.add(match[0]);
  }
  result.maturities = Array.from(foundMaturities).slice(0, 24);

  // Find the underlying contract info (e.g., "CLH2026 57.13")
  const contractMatch = markdown.match(/([A-Z]{2,4}[A-Z]\d{4})\s+(\d+\.\d+)/);
  if (contractMatch) {
    result.selectedMaturity = contractMatch[1];
    result.underlyingPrice = contractMatch[2];
  }

  // Parse options table
  // Table format: Bid IV | Ask IV | Intr. value | Time value | Rho | Vega | Theta | Gamma | Delta | Price | Ask | Bid | Volume | Strike | IV | Volume | Bid | Ask | Price | Delta | Gamma | Theta | Vega | Rho | Time value | Intr. value | Ask IV | Bid IV
  
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('Strike') || line.includes('---')) continue;
    
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    
    // Need at least 28 cells for full options row (14 for calls + strike + IV + 14 for puts)
    // But we also see rows with strike like "56.0056.00" in the middle
    
    // Try to find a row with strike price pattern (e.g., 56.0056.00 or just numbers)
    const strikeCell = cells.find(c => /^\d+\.\d+\d+\.\d+$/.test(c) || /^\d+\.\d+$/.test(c));
    if (!strikeCell) continue;
    
    // Extract strike price
    const strikeMatch = strikeCell.match(/^(\d+\.\d+)/);
    if (!strikeMatch) continue;
    const strike = parseFloat(strikeMatch[1]);
    
    // Find the index of the strike cell
    const strikeIndex = cells.indexOf(strikeCell);
    if (strikeIndex === -1) continue;
    
    // Calls are before strike, Puts are after
    // Expected order for calls (from left): Bid IV, Ask IV, Intr, Time, Rho, Vega, Theta, Gamma, Delta, Price, Ask, Bid, Volume
    // Then Strike, IV (middle)
    // Then Puts: Volume, Bid, Ask, Price, Delta, Gamma, Theta, Vega, Rho, Time, Intr, Ask IV, Bid IV
    
    try {
      // Parse Call option (cells before strike)
      if (strikeIndex >= 13) {
        const callCells = cells.slice(0, strikeIndex);
        const call: OptionContract = {
          strike,
          type: 'Call',
          symbol: '',
          bidIv: parseFloat(callCells[0]) || 0,
          askIv: parseFloat(callCells[1]) || 0,
          intrinsicValue: parseFloat(callCells[2]) || 0,
          timeValue: parseFloat(callCells[3]) || 0,
          rho: parseFloat(callCells[4]) || 0,
          vega: parseFloat(callCells[5]) || 0,
          theta: parseFloat(callCells[6]) || 0,
          gamma: parseFloat(callCells[7]) || 0,
          delta: parseFloat(callCells[8]) || 0,
          last: callCells[9] || '0',
          ask: callCells[10] || '0',
          bid: callCells[11] || '0',
          volume: callCells[12] || '0',
          iv: (parseFloat(callCells[0]) + parseFloat(callCells[1])) / 2 || 0,
        };
        
        if (call.delta !== 0 || call.last !== '0') {
          result.calls.push(call);
        }
      }
      
      // Parse Put option (cells after strike + IV)
      // Skip 2 cells after strike (Strike repeated + IV)
      const putStartIndex = strikeIndex + 2;
      if (cells.length > putStartIndex + 13) {
        const putCells = cells.slice(putStartIndex);
        const put: OptionContract = {
          strike,
          type: 'Put',
          symbol: '',
          volume: putCells[0] || '0',
          bid: putCells[1] || '0',
          ask: putCells[2] || '0',
          last: putCells[3] || '0',
          delta: parseFloat(putCells[4]) || 0,
          gamma: parseFloat(putCells[5]) || 0,
          theta: parseFloat(putCells[6]) || 0,
          vega: parseFloat(putCells[7]) || 0,
          rho: parseFloat(putCells[8]) || 0,
          timeValue: parseFloat(putCells[9]) || 0,
          intrinsicValue: parseFloat(putCells[10]) || 0,
          askIv: parseFloat(putCells[11]) || 0,
          bidIv: parseFloat(putCells[12]) || 0,
          iv: (parseFloat(putCells[11]) + parseFloat(putCells[12])) / 2 || 0,
        };
        
        if (put.delta !== 0 || put.last !== '0') {
          result.puts.push(put);
        }
      }
    } catch (e) {
      console.error('Error parsing row:', e);
    }
  }

  // Sort by strike
  result.calls.sort((a, b) => a.strike - b.strike);
  result.puts.sort((a, b) => a.strike - b.strike);

  return result;
}
