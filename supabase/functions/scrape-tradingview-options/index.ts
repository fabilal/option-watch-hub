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
  change: string;
  bid: string;
  ask: string;
  volume: string;
  openInterest: string;
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

    // Build URL: https://www.tradingview.com/symbols/NYMEX-CL1!/options-chain/
    let url = `https://www.tradingview.com/symbols/${exchange}-${symbol}/options-chain/`;
    if (maturity) {
      url += `?expiration=${encodeURIComponent(maturity)}`;
    }
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
            waitFor: 4000,
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
        console.log(`Parsed from markdown: ${optionsData.calls.length} calls, ${optionsData.puts.length} puts`);

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
  let inCalls = false;
  let inPuts = false;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('call')) {
      inCalls = true;
      inPuts = false;
    } else if (lowerLine.includes('put')) {
      inPuts = true;
      inCalls = false;
    }

    // Look for strike prices (numbers with decimals)
    const strikeMatch = line.match(/\b(\d+(?:\.\d+)?)\b/);
    if (strikeMatch) {
      const strike = parseFloat(strikeMatch[1]);
      if (strike > 0 && strike < 100000) {
        const numbers = line.match(/[\d,]+\.?\d*/g) || [];
        
        const option: OptionContract = {
          strike,
          type: inPuts ? 'Put' : 'Call',
          symbol: '',
          last: numbers[1] || '0',
          change: '0',
          bid: numbers[2] || '0',
          ask: numbers[3] || '0',
          volume: numbers[4] || '0',
          openInterest: numbers[5] || '0',
          iv: 0,
          delta: 0,
          gamma: 0,
          theta: 0,
          vega: 0,
        };

        if (inPuts) {
          result.puts.push(option);
        } else if (inCalls) {
          result.calls.push(option);
        }
      }
    }
  }

  return result;
}
