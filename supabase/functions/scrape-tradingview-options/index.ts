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

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
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
        const html = data.data?.html || data.html || '';
        console.log('Markdown length:', markdown.length, 'HTML length:', html.length);
        
        // Log first 2000 chars of markdown for debugging
        console.log('Markdown preview:', markdown.substring(0, 2000));
        
        const optionsData = parseOptionsChain(markdown, html, symbol, exchange, maturity);
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

function parseOptionsChain(
  markdown: string,
  _html: string,
  symbol: string,
  _exchange: string,
  requestedMaturity?: string
): OptionsChainData {
  const result: OptionsChainData = {
    underlyingSymbol: symbol,
    underlyingPrice: '0',
    maturities: [],
    selectedMaturity: requestedMaturity || '',
    calls: [],
    puts: [],
  };

  // --- Maturities (best-effort from static markdown) ---
  // We keep month + year chips like "janv. '26" / "mai '31"
  const maturitySet = new Set<string>();
  const maturityRe = /(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)\.?\s*'?\s*(\d{2})/gi;
  let mm: RegExpExecArray | null;
  while ((mm = maturityRe.exec(markdown)) !== null) {
    const m = mm[1].toLowerCase();
    const y = mm[2];
    maturitySet.add(`${m} '${y}`);
  }
  result.maturities = Array.from(maturitySet);

  // If maturity in response isn't set, pick the first (stable) one.
  if (!result.selectedMaturity) {
    result.selectedMaturity = result.maturities[0] || '';
  }

  // --- Locate options table header ---
  const lines = markdown.split('\n').map((l) => l.trim());
  const headerLineIndex = lines.findIndex(
    (l) => l.startsWith('|') && l.toLowerCase().includes('strike') && l.toLowerCase().includes('iv')
  );
  if (headerLineIndex === -1) {
    return result;
  }

  const headerCells = splitMdRow(lines[headerLineIndex]);
  const strikeIndex = findHeaderIndex(headerCells, ['strike', "prix d'exercice", 'exercice', 'prix d’exercice']);
  if (strikeIndex === -1) {
    return result;
  }

  const callRangeStart = 0;
  const callRangeEnd = strikeIndex;
  const putRangeStart = strikeIndex + 1;
  const putRangeEnd = headerCells.length;

  const idx = {
    strike: strikeIndex,

    callBidIv: findHeaderIndex(headerCells, ['bid iv'], callRangeStart, callRangeEnd),
    callAskIv: findHeaderIndex(headerCells, ['ask iv'], callRangeStart, callRangeEnd),
    callIv: findHeaderIndex(headerCells, ['iv'], callRangeStart, callRangeEnd),
    callDelta: findHeaderIndex(headerCells, ['delta'], callRangeStart, callRangeEnd),
    callGamma: findHeaderIndex(headerCells, ['gamma'], callRangeStart, callRangeEnd),
    callTheta: findHeaderIndex(headerCells, ['theta'], callRangeStart, callRangeEnd),
    callVega: findHeaderIndex(headerCells, ['vega'], callRangeStart, callRangeEnd),
    callPrice: findHeaderIndex(headerCells, ['prix'], callRangeStart, callRangeEnd),
    callBid: findHeaderIndex(headerCells, ['demande', 'bid'], callRangeStart, callRangeEnd),
    callAsk: findHeaderIndex(headerCells, ['offre', 'ask'], callRangeStart, callRangeEnd),
    callVol: findHeaderIndex(headerCells, ['volume', 'vol'], callRangeStart, callRangeEnd),

    putIv: findHeaderIndex(headerCells, ['iv'], putRangeStart, putRangeEnd),
    putDelta: findHeaderIndex(headerCells, ['delta'], putRangeStart, putRangeEnd),
    putGamma: findHeaderIndex(headerCells, ['gamma'], putRangeStart, putRangeEnd),
    putTheta: findHeaderIndex(headerCells, ['theta'], putRangeStart, putRangeEnd),
    putVega: findHeaderIndex(headerCells, ['vega'], putRangeStart, putRangeEnd),
    putPrice: findHeaderIndex(headerCells, ['prix'], putRangeStart, putRangeEnd),
    putBid: findHeaderIndex(headerCells, ['demande', 'bid'], putRangeStart, putRangeEnd),
    putAsk: findHeaderIndex(headerCells, ['offre', 'ask'], putRangeStart, putRangeEnd),
    putVol: findHeaderIndex(headerCells, ['volume', 'vol'], putRangeStart, putRangeEnd),
  };

  // --- Parse rows after header (skip separator line "| --- |") ---
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('|')) continue;
    if (l.includes('---')) continue;

    const cells = splitMdRow(l);
    if (cells.length < headerCells.length) continue;

    const strike = parseStrike(cells[idx.strike]);
    if (!strike) continue;

    // Calls (left side)
    const callLast = safeCell(cells, idx.callPrice);
    const callBid = safeCell(cells, idx.callBid);
    const callAsk = safeCell(cells, idx.callAsk);
    const callVol = normalizeDash(safeCell(cells, idx.callVol));

    const callDelta = parseNum(safeCell(cells, idx.callDelta));
    const callGamma = parseNum(safeCell(cells, idx.callGamma));
    const callTheta = parseNum(safeCell(cells, idx.callTheta));
    const callVega = parseNum(safeCell(cells, idx.callVega));

    const callIv = computeIv(
      safeCell(cells, idx.callBidIv),
      safeCell(cells, idx.callAskIv),
      safeCell(cells, idx.callIv)
    );

    const callHasAnyPrice = parseNum(callLast) > 0 || parseNum(callBid) > 0 || parseNum(callAsk) > 0;
    if (callHasAnyPrice) {
      result.calls.push({
        strike,
        type: 'Call',
        symbol: '',
        last: callLast || '0',
        bid: callBid || '0',
        ask: callAsk || '0',
        volume: callVol || '0',
        iv: callIv,
        delta: callDelta,
        gamma: callGamma,
        theta: callTheta,
        vega: callVega,
      });
    }

    // Puts (right side)
    const putLast = safeCell(cells, idx.putPrice);
    const putBid = safeCell(cells, idx.putBid);
    const putAsk = safeCell(cells, idx.putAsk);
    const putVol = normalizeDash(safeCell(cells, idx.putVol));

    const putDelta = parseNum(safeCell(cells, idx.putDelta));
    const putGamma = parseNum(safeCell(cells, idx.putGamma));
    const putTheta = parseNum(safeCell(cells, idx.putTheta));
    const putVega = parseNum(safeCell(cells, idx.putVega));

    const putIv = parseNum(safeCell(cells, idx.putIv));

    const putHasAnyPrice = parseNum(putLast) > 0 || parseNum(putBid) > 0 || parseNum(putAsk) > 0;
    if (putHasAnyPrice) {
      result.puts.push({
        strike,
        type: 'Put',
        symbol: '',
        last: putLast || '0',
        bid: putBid || '0',
        ask: putAsk || '0',
        volume: putVol || '0',
        iv: putIv,
        delta: putDelta,
        gamma: putGamma,
        theta: putTheta,
        vega: putVega,
      });
    }
  }

  // Sort by strike
  result.calls.sort((a, b) => a.strike - b.strike);
  result.puts.sort((a, b) => a.strike - b.strike);

  return result;
}

function splitMdRow(line: string): string[] {
  return line
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function normalizeHeaderCell(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();
}

function findHeaderIndex(
  headerCells: string[],
  keywords: string[],
  start = 0,
  end = headerCells.length
): number {
  const ks = keywords.map((k) => k.toLowerCase());
  for (let i = start; i < Math.min(end, headerCells.length); i++) {
    const c = normalizeHeaderCell(headerCells[i]);
    if (ks.some((k) => c.includes(k))) return i;
  }
  return -1;
}

function parseStrike(cell: string): number {
  const digits = (cell || '').replace(/\D/g, '');
  if (!digits) return 0;

  // Many TV tables repeat the strike twice: "433433" or "43404340"
  if (digits.length % 2 === 0) {
    const half = digits.length / 2;
    const a = digits.slice(0, half);
    const b = digits.slice(half);
    if (a === b) {
      const n = parseInt(a, 10);
      return Number.isFinite(n) ? n : 0;
    }
  }

  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function safeCell(cells: string[], idx: number): string {
  if (idx < 0) return '';
  return (cells[idx] || '').trim();
}

function normalizeDash(v: string): string {
  if (!v || v === '—' || v === '-' || v === '−') return '0';
  return v;
}

function computeIv(bidIvRaw: string, askIvRaw: string, fallbackIvRaw: string): number {
  const bidIv = parseNum(bidIvRaw);
  const askIv = parseNum(askIvRaw);
  if (bidIv > 0 && askIv > 0) return (bidIv + askIv) / 2;
  const fb = parseNum(fallbackIvRaw);
  return fb;
}

function parseNum(val: string): number {
  const v = (val || '').trim();
  if (!v || v === '—' || v === '-' || v === '' || v === '−') return 0;

  // Normalize FR numbers and exotic minus sign
  // Examples: "−1,95" -> -1.95, "1 234,56" -> 1234.56
  const cleaned = v
    .replace(/[\u00a0\u202f\s]/g, '')
    .replace(/−/g, '-')
    .replace(',', '.');

  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}
