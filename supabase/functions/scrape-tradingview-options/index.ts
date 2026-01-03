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
  underlyingContract: string;
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
    // If a maturity is provided, we treat it as the specific futures contract symbol (e.g. GCG2026)
    // and load the options chain page for that contract.
    const targetSymbol = (typeof maturity === 'string' && maturity.trim().length > 0)
      ? maturity.trim()
      : symbol;

    const url = `https://fr.tradingview.com/symbols/${exchange}-${targetSymbol}/options-chain/`;
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
            // Options table is often loaded outside “main content”; keep full page.
            onlyMainContent: false,
            // Give the page more time to render.
            waitFor: 12000,
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
        console.log(`Underlying: ${optionsData.underlyingContract} @ ${optionsData.underlyingPrice}`);

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
    underlyingContract: '',
    maturities: [],
    selectedMaturity: '',
    calls: [],
    puts: [],
  };

  const lines = markdown.split('\n');
  
  // Extract underlying price - look for pattern like "57,32DUSD" or "57.32USD"
  const priceMatch = markdown.match(/(\d+[,\.]\d+)\s*D?USD/);
  if (priceMatch) {
    result.underlyingPrice = priceMatch[1].replace(',', '.');
  }

  // Extract underlying contract info (e.g., "CLH2026 57,12" or "CLH2026 57.12")
  const contractMatch = markdown.match(/([A-Z]{2,4}[A-Z]\d{4})\s+(\d+[,\.]\d+)/);
  if (contractMatch) {
    result.underlyingContract = contractMatch[1];
    result.selectedMaturity = contractMatch[1];
    result.underlyingPrice = contractMatch[2].replace(',', '.');
  }

  // Extract maturities from the calendar section
  // Look for patterns like "janv. '26", "févr.", "mars", "déc. '25", etc.
  const maturityPatterns = [
    // French month abbreviations with year
    /(?:janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.)\s*(?:'?\d{2})?/gi,
    // English months
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s*'?\d{2})?/gi,
  ];
  
  const foundMaturities = new Set<string>();
  
  // Find section between calendar display and the table
  const calendarSection = markdown.substring(0, markdown.indexOf('| Calls |'));
  
  for (const pattern of maturityPatterns) {
    let match;
    while ((match = pattern.exec(calendarSection)) !== null) {
      const mat = match[0].trim();
      if (mat.length > 2) {
        foundMaturities.add(mat);
      }
    }
  }
  
  // Also look for date patterns like "30", "31", etc. that follow month names
  // These are expiration dates within months
  
  result.maturities = Array.from(foundMaturities).slice(0, 50);

  // Parse the options table
  // Table header: Bid IV, % | Ask IV, % | Valeur intr. | Valeur temps | Rho | Vega | Theta | Gamma | Delta | Prix | Demande | Offre | Volume | Strike | IV, % | Volume | Offre | Demande | Prix | Delta | Gamma | Theta | Vega | Rho | Valeur temps | Valeur intr. | Ask IV, % | Bid IV, %
  
  let inTable = false;
  
  for (const line of lines) {
    // Skip non-table lines
    if (!line.startsWith('|')) continue;
    
    // Skip header rows
    if (line.includes('Calls') || line.includes('Puts') || line.includes('Strike') || line.includes('---')) {
      inTable = true;
      continue;
    }
    
    if (!inTable) continue;
    
    // Parse table row
    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    
    // Find strike price cell - it has pattern like "56,0056,00" or "57.0057.00"
    // Or just "56,00" or "57.00"
    let strikeIndex = -1;
    let strikeValue = 0;
    
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      // Match strike pattern: "56,0056,00" or "56.0056.00" (strike appears twice)
      const doubleStrikeMatch = cell.match(/^(\d+[,\.]\d+)\d+[,\.]\d+$/);
      if (doubleStrikeMatch) {
        strikeValue = parseFloat(doubleStrikeMatch[1].replace(',', '.'));
        strikeIndex = i;
        break;
      }
    }
    
    if (strikeIndex === -1 || strikeValue === 0) continue;
    
    // Parse CALL data (columns BEFORE strike)
    // Order: Bid IV, Ask IV, Intr., Time, Rho, Vega, Theta, Gamma, Delta, Prix, Demande(Ask), Offre(Bid), Volume
    const callCells = cells.slice(0, strikeIndex);
    
    if (callCells.length >= 13) {
      const call: OptionContract = {
        strike: strikeValue,
        type: 'Call',
        symbol: '',
        bidIv: parseNumFr(callCells[0]),
        askIv: parseNumFr(callCells[1]),
        intrinsicValue: parseNumFr(callCells[2]),
        timeValue: parseNumFr(callCells[3]),
        rho: parseNumFr(callCells[4]),
        vega: parseNumFr(callCells[5]),
        theta: parseNumFr(callCells[6]),
        gamma: parseNumFr(callCells[7]),
        delta: parseNumFr(callCells[8]),
        last: formatPrice(callCells[9]),
        ask: formatPrice(callCells[10]),
        bid: formatPrice(callCells[11]),
        volume: callCells[12] === '—' ? '0' : callCells[12],
        iv: (parseNumFr(callCells[0]) + parseNumFr(callCells[1])) / 2,
      };
      
      // Only add if we have meaningful data
      if (call.delta !== 0 || call.last !== '0') {
        result.calls.push(call);
      }
    }
    
    // Parse PUT data (columns AFTER strike + IV column)
    // Strike cell is at strikeIndex, next is IV, then puts start
    // Order: IV, Volume, Offre(Bid), Demande(Ask), Prix, Delta, Gamma, Theta, Vega, Rho, Time, Intr., Ask IV, Bid IV
    const ivColIndex = strikeIndex + 1;
    const putCells = cells.slice(ivColIndex + 1);
    
    if (putCells.length >= 13) {
      const put: OptionContract = {
        strike: strikeValue,
        type: 'Put',
        symbol: '',
        volume: putCells[0] === '—' ? '0' : putCells[0],
        bid: formatPrice(putCells[1]),
        ask: formatPrice(putCells[2]),
        last: formatPrice(putCells[3]),
        delta: parseNumFr(putCells[4]),
        gamma: parseNumFr(putCells[5]),
        theta: parseNumFr(putCells[6]),
        vega: parseNumFr(putCells[7]),
        rho: parseNumFr(putCells[8]),
        timeValue: parseNumFr(putCells[9]),
        intrinsicValue: parseNumFr(putCells[10]),
        askIv: parseNumFr(putCells[11]),
        bidIv: parseNumFr(putCells[12]),
        iv: (parseNumFr(putCells[11]) + parseNumFr(putCells[12])) / 2,
      };
      
      // Only add if we have meaningful data
      if (put.delta !== 0 || put.last !== '0') {
        result.puts.push(put);
      }
    }
  }

  // Sort by strike
  result.calls.sort((a, b) => a.strike - b.strike);
  result.puts.sort((a, b) => a.strike - b.strike);

  return result;
}

// Parse French number format (comma as decimal separator)
function parseNumFr(val: string): number {
  if (!val || val === '—' || val === '-') return 0;
  // Handle negative numbers with − (unicode minus)
  const normalized = val.replace('−', '-').replace(',', '.').replace(/\s/g, '');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

// Format price string
function formatPrice(val: string): string {
  if (!val || val === '—' || val === '-') return '0';
  return val.replace(',', '.');
}
