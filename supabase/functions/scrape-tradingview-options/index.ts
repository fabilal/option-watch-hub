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
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
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

const CACHE_TTL_MS = 60 * 1000; // 1 minute for testing
const NEGATIVE_CACHE_TTL_MS = 10 * 1000; // 10 seconds

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
    
    const cached = getFromCache(cacheKey);
    if (cached !== undefined) {
      console.log(`Cache hit for ${cacheKey}`);
      return new Response(
        JSON.stringify({ success: true, data: cached }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (inflight.has(cacheKey)) {
      console.log(`Waiting for inflight request: ${cacheKey}`);
      const result = await inflight.get(cacheKey);
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the new options chain URL format
    const url = `https://fr.tradingview.com/options/chain/${exchange}-${symbol}/`;
    console.log(`Scraping TradingView options chain: ${url}`);

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
            formats: ['markdown', 'html'],
            onlyMainContent: true,
            waitFor: 8000,
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
        const html = data.data?.html || data.html || '';
        console.log('Markdown length:', markdown.length, 'HTML length:', html.length);
        
        // Log first 2000 chars of markdown for debugging
        console.log('Markdown preview:', markdown.substring(0, 2000));
        
        const optionsData = parseOptionsChain(markdown, html, symbol, exchange);
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

function parseOptionsChain(markdown: string, html: string, symbol: string, exchange: string): OptionsChainData {
  const result: OptionsChainData = {
    underlyingSymbol: symbol,
    underlyingPrice: '0',
    maturities: [],
    selectedMaturity: '',
    calls: [],
    puts: [],
  };

  // Parse maturities from the date selector
  const months = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
  const monthPattern = new RegExp(`(${months.join('|')})\\.?\\s*(?:'?(\\d{2}))?`, 'gi');
  const foundMaturities: string[] = [];
  let monthMatch;
  
  while ((monthMatch = monthPattern.exec(markdown)) !== null) {
    const month = monthMatch[1].toLowerCase();
    const year = monthMatch[2] || '';
    const maturity = year ? `${month} '${year}` : month;
    if (!foundMaturities.includes(maturity)) {
      foundMaturities.push(maturity);
    }
  }
  result.maturities = foundMaturities.slice(0, 30);

  // Parse the options table
  // Header: Bid IV, % | Ask IV, % | Valeur intr. | Valeur temps | Rho | Vega | Theta | Gamma | Delta | Prix | Demande | Offre | Volume | Strike | IV, % | Volume | Offre | Demande | Prix | Delta | Gamma | Theta | Vega | Rho | Valeur temps | Valeur intr. | Ask IV, % | Bid IV, %
  // Example row: | 21,56 | 22,14 | 21,90 | 97,20 | 1,72 | 4,67 | −1,95 | 0,0015 | 0,56 | 119,1 | 121,4 | 118,7 | — | 4 3404 340 | 21,1 | — | 84,6 | 86,5 | 86,4 | −0,44 | 0,0015 | −1,83 | 4,67 | −1,47 | 86,40 | 0,00 | 21,66 | 21,26 |
  
  const lines = markdown.split('\n');
  let foundDataRow = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line.startsWith('|')) continue;
    if (line.includes('---')) continue;
    if (line.includes('Bid IV') || line.includes('Strike') || line.includes('Calls')) continue;
    
    const cells = line.split('|')
      .map(c => c.trim())
      .filter(c => c.length > 0);
    
    // Need at least 20 cells for a data row
    if (cells.length < 20) continue;
    
    // Find strike cell - it has format like "4 3404 340" which is "4 340" (4340) repeated twice
    // Pattern variations: "4 3404 340", "4340 4340", "4 340 4 340"
    let strikeIndex = -1;
    let strikeValue = 0;
    
    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j];
      
      // Pattern 1: "4 3404 340" -> matches "X XXXY YYY" (may have non-breaking spaces)
      // First normalize all whitespace (including nbsp \u00a0)
      const normalizedCell = cell.replace(/[\s\u00a0]+/g, ' ');
      let strikeMatch = normalizedCell.match(/^(\d+) (\d{3})(\d+) (\d{3})$/);
      if (strikeMatch) {
        const strike = parseInt(strikeMatch[1] + strikeMatch[2], 10);
        if (strike > 10 && strike < 100000) {
          strikeIndex = j;
          strikeValue = strike;
          if (!foundDataRow) {
            console.log(`Found strike pattern 1: "${cell}" -> "${normalizedCell}" -> ${strike} at index ${j}`);
            foundDataRow = true;
          }
          break;
        }
      }
      
      // Pattern 2: "4340 4340" -> same number repeated with space
      strikeMatch = normalizedCell.match(/^(\d+) (\d+)$/);
      if (strikeMatch && strikeMatch[1] === strikeMatch[2]) {
        const strike = parseInt(strikeMatch[1], 10);
        if (strike > 10 && strike < 100000) {
          strikeIndex = j;
          strikeValue = strike;
          if (!foundDataRow) {
            console.log(`Found strike pattern 2: "${cell}" -> ${strike} at index ${j}`);
            foundDataRow = true;
          }
          break;
        }
      }
      
      // Pattern 3: "4 340 4 340" -> number with spaces repeated
      strikeMatch = normalizedCell.match(/^(\d+ \d+) (\d+ \d+)$/);
      if (strikeMatch) {
        const first = strikeMatch[1].replace(/ /g, '');
        const second = strikeMatch[2].replace(/ /g, '');
        if (first === second) {
          const strike = parseInt(first, 10);
          if (strike > 10 && strike < 100000) {
            strikeIndex = j;
            strikeValue = strike;
            if (!foundDataRow) {
              console.log(`Found strike pattern 3: "${cell}" -> ${strike} at index ${j}`);
              foundDataRow = true;
            }
            break;
          }
        }
      }
    }
    
    if (strikeIndex === -1) continue;
    
    console.log(`Row: strikeIndex=${strikeIndex}, strikeValue=${strikeValue}, cells.length=${cells.length}`);
    
    // Call columns (before strike): Bid IV, Ask IV, Intr, Time, Rho, Vega, Theta, Gamma, Delta, Prix, Demande, Offre, Volume
    // Index:                         0       1       2     3     4    5     6      7      8      9     10       11     12
    if (strikeIndex >= 13) {
      const delta = parseNum(cells[8]);
      const last = cells[9] || '0';
      console.log(`Call: delta=${delta}, last=${last}, cells[0]=${cells[0]}, cells[8]=${cells[8]}, cells[9]=${cells[9]}`);
      
      const call: OptionContract = {
        strike: strikeValue,
        type: 'Call',
        symbol: '',
        iv: (parseNum(cells[0]) + parseNum(cells[1])) / 2,
        delta: delta,
        gamma: parseNum(cells[7]),
        theta: parseNum(cells[6]),
        vega: parseNum(cells[5]),
        last: last,
        ask: cells[10] || '0',
        bid: cells[11] || '0',
        volume: cells[12] === '—' ? '0' : cells[12] || '0',
      };
      
      // Include call if we have any valid data
      if (call.delta !== 0 || parseNum(call.last) > 0) {
        result.calls.push(call);
      }
    }
    
    // IV is after strike
    const ivIndex = strikeIndex + 1;
    const ivValue = parseNum(cells[ivIndex]);
    
    // Put columns (after IV): Volume, Offre, Demande, Prix, Delta, Gamma, Theta, Vega, Rho, Time, Intr, Ask IV, Bid IV
    // Index relative to ivIndex+1: 0       1     2        3     4      5      6     7    8    9     10    11      12
    const putStartIndex = ivIndex + 1;
    if (cells.length > putStartIndex + 8) {
      const putCells = cells.slice(putStartIndex);
      const put: OptionContract = {
        strike: strikeValue,
        type: 'Put',
        symbol: '',
        volume: putCells[0] === '—' ? '0' : putCells[0] || '0',
        bid: putCells[1] || '0', // Offre
        ask: putCells[2] || '0', // Demande
        last: putCells[3] || '0', // Prix
        delta: parseNum(putCells[4]),
        gamma: parseNum(putCells[5]),
        theta: parseNum(putCells[6]),
        vega: parseNum(putCells[7]),
        iv: ivValue,
      };
      
      if (put.delta !== 0 || parseNum(put.last) > 0) {
        result.puts.push(put);
      }
    }
  }

  // Sort by strike
  result.calls.sort((a, b) => a.strike - b.strike);
  result.puts.sort((a, b) => a.strike - b.strike);

  return result;
}

function parseNum(val: string): number {
  if (!val || val === '—' || val === '-' || val === '' || val === '−') return 0;
  // Handle French number format and minus sign: "−1,95" -> -1.95
  const cleaned = val.replace(/\s/g, '').replace(',', '.').replace('−', '-');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
