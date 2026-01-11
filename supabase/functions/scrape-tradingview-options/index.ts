import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { saveStrikesToDB } from "../_shared/db-cache.ts";

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

// New interface for strike-based view (all maturities for a strike)
interface OptionsByStrike {
  underlyingSymbol: string;
  underlyingPrice: string;
  strike: number;
  maturities: Array<{
    maturity: string; // Expiration date
    maturityCode: string; // Contract code like CLH2026
    call: {
      last: string;
      bid: string;
      ask: string;
      volume: string;
      openInterest: string;
      iv: number;
      delta: string;
      gamma: string;
      theta: string;
    } | null;
    put: {
      last: string;
      bid: string;
      ask: string;
      volume: string;
      openInterest: string;
      iv: number;
      delta: string;
      gamma: string;
      theta: string;
    } | null;
  }>;
}

interface CacheEntry {
  expiresAt: number;
  data: OptionsChainData | OptionsByStrike | null;
  error?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_CACHE_TTL_MS = 30 * 1000; // 30 seconds

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OptionsChainData | OptionsByStrike | null>>();

function getFromCache(key: string): OptionsChainData | OptionsByStrike | null | undefined {
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
    const { exchange, symbol, maturity, strike, fetchMaturitiesOnly, viewMode } = await req.json();
    
    // Determine view mode: 'strike' (new) or 'maturity' (old)
    const mode = viewMode || (strike !== undefined && strike !== null ? 'strike' : 'maturity');

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

    // Build cache key based on mode
    let cacheKey: string;
    if (fetchMaturitiesOnly) {
      cacheKey = `tv-options-maturities-${exchange}-${symbol}`;
    } else if (mode === 'strike' && strike !== undefined && strike !== null) {
      cacheKey = `tv-options-strike-${exchange}-${symbol}-${strike}`;
    } else {
      cacheKey = `${exchange}-${symbol}-${maturity || 'default'}`;
    }
    
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

    // Build URL based on mode
    let url: string;
    if (mode === 'strike' && strike !== undefined && strike !== null) {
      // New: View by strike - shows all maturities for the strike
      url = `https://fr.tradingview.com/options/chain/${exchange}-${symbol}/?view=strikes&strike=${strike}`;
      console.log(`[scrape-tradingview-options] Scraping by STRIKE: ${url}, strike: ${strike}`);
    } else {
      // Old: View by maturity - shows all strikes for the maturity
      url = `https://fr.tradingview.com/options/chain/${exchange}-${symbol}/`;
      console.log(`[scrape-tradingview-options] Scraping by MATURITY: ${url}, maturity: ${maturity || 'default'}`);
    }

    const scrapePromise = (async (): Promise<OptionsChainData | OptionsByStrike | null> => {
      try {
        // Choose schema and prompt based on mode
        let schema: any;
        let prompt: string = '';
        let formats: string[];
        
        if (mode === 'strike') {
          // New mode: Extract all maturities for the selected strike
          schema = {
            type: "object",
            properties: {
              underlyingPrice: {
                type: "string",
                description: "Current price of the underlying futures contract"
              },
              maturities: {
                type: "array",
                description: "ALL maturities (expiration dates) shown as COLUMNS in the table. Each column represents a different maturity. Extract ALL columns visible.",
                items: {
                  type: "object",
                  properties: {
                    maturityCode: { 
                      type: "string", 
                      description: "Contract code from the column header. Examples: CLG2027, CLH2028, CLF2028. Format is usually: [BASE][MONTH][YEAR] like CLG2027, ZCH2026. Extract exactly as shown in the header."
                    },
                    maturity: { 
                      type: "string", 
                      description: "Expiration date like 2027-05-01, 2028-02-01, 2028-06-01, 2026-12-01. Extract from the date row."
                    },
                    call: {
                      type: "object",
                      description: "Call option data for this maturity column. Extract from the Call rows.",
                      properties: {
                        last: { 
                          type: "string", 
                          description: "Last price from Call Last row. Example: '57.99', '58.02', '58.09'"
                        },
                        bidAsk: { 
                          type: "string", 
                          description: "Bid/Ask from Call Bid/Ask row in format 'X.XX/Y.YY'. Example: '57.00/58.00', '58.00/58.05'"
                        },
                        bid: { 
                          type: "string", 
                          description: "Bid price (first number from Bid/Ask). Example: '57.00', '58.00'"
                        },
                        ask: { 
                          type: "string", 
                          description: "Ask price (second number from Bid/Ask). Example: '58.00', '58.05'"
                        },
                        volume: { 
                          type: "string", 
                          description: "Volume from Call Volume row. Example: '0', '51', '1'"
                        },
                        openInterest: { 
                          type: "string", 
                          description: "Open interest if available"
                        },
                        iv: { 
                          type: "number", 
                          description: "IV % from Call IV row. Convert percentage to number (e.g. '35.0%' -> 35.0, '-' -> 0)"
                        },
                        ivPercent: {
                          type: "string",
                          description: "IV % as string if number parsing fails"
                        },
                        delta: { 
                          type: "string", 
                          description: "Delta from Call Delta row. Example: '0.580', '0.570', '0'"
                        },
                        gamma: { 
                          type: "string", 
                          description: "Gamma if available"
                        },
                        theta: { 
                          type: "string", 
                          description: "Theta if available"
                        }
                      }
                    },
                    put: {
                      type: "object",
                      description: "Put option data for this maturity column. Extract from the Put rows.",
                      properties: {
                        last: { 
                          type: "string", 
                          description: "Last price from Put Last row"
                        },
                        bidAsk: { 
                          type: "string", 
                          description: "Bid/Ask from Put Bid/Ask row in format 'X.XX/Y.YY'"
                        },
                        bid: { 
                          type: "string", 
                          description: "Bid price (first number from Bid/Ask)"
                        },
                        ask: { 
                          type: "string", 
                          description: "Ask price (second number from Bid/Ask)"
                        },
                        volume: { 
                          type: "string", 
                          description: "Volume from Put Volume row"
                        },
                        openInterest: { 
                          type: "string", 
                          description: "Open interest if available"
                        },
                        iv: { 
                          type: "number", 
                          description: "IV % from Put IV row. Convert percentage to number"
                        },
                        ivPercent: {
                          type: "string",
                          description: "IV % as string if number parsing fails"
                        },
                        delta: { 
                          type: "string", 
                          description: "Delta from Put Delta row"
                        },
                        gamma: { 
                          type: "string", 
                          description: "Gamma if available"
                        },
                        theta: { 
                          type: "string", 
                          description: "Theta if available"
                        }
                      }
                    }
                  },
                  required: ["maturityCode"]
                }
              }
            },
            required: ["maturities"]
          };
          prompt = `CRITICAL: Extract ALL maturities (expiration dates) for strike ${strike}.

The page shows a HORIZONTAL table where:
- ROWS: Different data types (Maturité, Call Last, Call Bid/Ask, Call IV, Call Delta, Call Volume, Put Last, Put Bid/Ask, Put IV, Put Delta, Put Volume)
- COLUMNS: Each column represents a different maturity/expiration date (contract codes like CLG202757, CLH202757, CLF202758, CLJ202758, CLZ202658, etc.)

The table structure is:
- First row: "Maturité" header, then maturity codes as column headers (like CLG2027, CLH2028, CLF2028, CLJ2028, CLZ2026, etc.)
- Second row: Expiration dates under each maturity code (like 2027-05-01, 2028-02-01, 2028-06-01, 2026-12-01, etc.)
- Subsequent rows: Data for each maturity column:
  * "Call Last" row: Last prices for each maturity (e.g., 57.99, 58.02, 58.09)
  * "Call Bid/Ask" row: Bid/Ask pairs for each maturity (e.g., "57.00/58.00", "58.00/58.05", "58.00/58.10")
  * "Call IV" row: IV percentages (may show "-" if not available)
  * "Call Delta" row: Delta values (may show "0" if not available)
  * "Call Volume" row: Volume numbers
  * "Put Last" row: Put last prices
  * "Put Bid/Ask" row: Put bid/ask pairs
  * "Put IV" row: Put IV percentages
  * "Put Delta" row: Put delta values
  * "Put Volume" row: Put volume numbers

For EACH maturity column (each column header), you MUST extract:
1. maturityCode: The contract code from the header (e.g., "CLG2027", "CLH2028", "CLF2028"). Extract EXACTLY as shown, without adding extra digits.
2. maturity: The expiration date from the date row (e.g., "2027-05-01", "2028-02-01")
3. call object with:
   - last: The value from "Call Last" row for this column (e.g., "57.99", "58.02")
   - bidAsk: The value from "Call Bid/Ask" row (e.g., "57.00/58.00", "58.00/58.05")
   - bid: First number from bidAsk (e.g., "57.00", "58.00")
   - ask: Second number from bidAsk (e.g., "58.00", "58.05")
   - volume: The value from "Call Volume" row (e.g., "0", "51", "1")
   - iv: The value from "Call IV" row as number (convert "35.0%" to 35.0, "-" to 0)
   - delta: The value from "Call Delta" row (e.g., "0.580", "0", "-")
4. put object with:
   - last: The value from "Put Last" row for this column
   - bidAsk: The value from "Put Bid/Ask" row
   - bid: First number from bidAsk
   - ask: Second number from bidAsk
   - volume: The value from "Put Volume" row
   - iv: The value from "Put IV" row as number
   - delta: The value from "Put Delta" row

IMPORTANT: 
- Extract ALL visible maturity columns (there can be 7-30+ maturities)
- For Bid/Ask format "X.XX/Y.YY", extract both numbers separately into bid and ask fields
- For IV, convert percentages to numbers (e.g., "35.0%" -> 35.0, "-" -> 0, empty -> 0)
- If a value is empty, "-", or "0", use "0" for strings or 0 for numbers
- DO NOT skip any maturities, even if some values are missing
- Look carefully at the table structure - each column represents one maturity`;
          formats = ['extract'];
        } else {
          // Old mode: Use markdown parsing
          formats = ['markdown', 'html'];
        }

        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats,
            ...(mode === 'strike' ? {
              extract: {
                schema,
                prompt,
              }
            } : {
              onlyMainContent: true,
            }),
            waitFor: mode === 'strike' ? 10000 : 12000,
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

        if (mode === 'strike') {
          // New mode: Return data by strike (all maturities)
          const extractData = data.data?.extract || data.extract || {};
          const maturitiesData = extractData.maturities || [];
          console.log(`[scrape-tradingview-options] Extracted ${maturitiesData.length} maturities for strike ${strike}`);
          console.log(`[scrape-tradingview-options] Sample maturity data:`, JSON.stringify(maturitiesData[0] || {}, null, 2));
          
          // Helper to parse bid/ask from "X.XX/Y.YY" format
          const parseBidAsk = (bidAskStr: string): { bid: string; ask: string } => {
            if (!bidAskStr || bidAskStr === '0' || bidAskStr === '-' || bidAskStr === '') {
              return { bid: '0', ask: '0' };
            }
            const parts = bidAskStr.toString().split('/');
            if (parts.length === 2) {
              return { bid: parts[0].trim(), ask: parts[1].trim() };
            }
            // If no slash, try to extract numbers
            const numbers = bidAskStr.match(/[\d,\.]+/g);
            if (numbers && numbers.length >= 2) {
              return { bid: numbers[0].replace(',', '.'), ask: numbers[1].replace(',', '.') };
            }
            return { bid: bidAskStr.replace(',', '.'), ask: '0' };
          };
          
          // Helper to parse IV percentage
          const parseIV = (ivStr: any): number => {
            if (typeof ivStr === 'number') return ivStr;
            if (!ivStr || ivStr === '-' || ivStr === '0' || ivStr === '') return 0;
            const str = ivStr.toString().replace('%', '').replace(',', '.').trim();
            const num = parseFloat(str);
            return Number.isFinite(num) ? num : 0;
          };
          
          // Helper to normalize maturity codes (CLG202757 -> CLG2027, CLH202757 -> CLH2027)
          const normalizeMaturityCode = (code: string): string => {
            if (!code) return '';
            // Pattern: CLG202757 -> extract CL (base) + G (month) + 2027 (year, first 4 digits after month)
            // Or: CLG2027 -> already correct
            const match = code.match(/^([A-Z]{2,3})([A-Z])(\d{4,6})/);
            if (match) {
              const base = match[1];      // CL, ZC, etc.
              const month = match[2];     // G, H, F, etc.
              const digits = match[3];    // 202757, 2027, etc.
              
              // Extract year: take first 4 digits
              const year = digits.substring(0, 4);
              
              return `${base}${month}${year}`;
            }
            return code; // Return as-is if pattern doesn't match
          };
          
          const byStrike: OptionsByStrike = {
            underlyingSymbol: symbol,
            underlyingPrice: extractData.underlyingPrice || '0',
            strike: strike as number,
            maturities: maturitiesData.map((m: any) => {
              const callBidAsk = m.call?.bidAsk ? parseBidAsk(m.call.bidAsk) : 
                                (m.call?.bid && m.call?.ask ? { bid: m.call.bid, ask: m.call.ask } : 
                                parseBidAsk(m.call?.bid || '0'));
              const putBidAsk = m.put?.bidAsk ? parseBidAsk(m.put.bidAsk) : 
                               (m.put?.bid && m.put?.ask ? { bid: m.put.bid, ask: m.put.ask } : 
                               parseBidAsk(m.put?.bid || '0'));
              
              return {
                maturityCode: normalizeMaturityCode(m.maturityCode || m.code || ''),
                maturity: m.maturity || m.expiration || m.date || '',
                call: m.call ? {
                  last: (m.call.last || m.call.price || '0').toString().replace(',', '.'),
                  bid: callBidAsk.bid,
                  ask: callBidAsk.ask,
                  volume: (m.call.volume || '0').toString(),
                  openInterest: (m.call.openInterest || m.call.oi || '0').toString(),
                  iv: parseIV(m.call.iv || m.call.ivPercent || m.call['IV%']),
                  delta: (m.call.delta || '0').toString(),
                  gamma: (m.call.gamma || '0').toString(),
                  theta: (m.call.theta || '0').toString(),
                } : null,
                put: m.put ? {
                  last: (m.put.last || m.put.price || '0').toString().replace(',', '.'),
                  bid: putBidAsk.bid,
                  ask: putBidAsk.ask,
                  volume: (m.put.volume || '0').toString(),
                  openInterest: (m.put.openInterest || m.put.oi || '0').toString(),
                  iv: parseIV(m.put.iv || m.put.ivPercent || m.put['IV%']),
                  delta: (m.put.delta || '0').toString(),
                  gamma: (m.put.gamma || '0').toString(),
                  theta: (m.put.theta || '0').toString(),
                } : null,
              };
            }).filter((m: any) => m.maturityCode),
          };
          
          console.log(`[scrape-tradingview-options] Final: ${byStrike.maturities.length} maturities for strike ${strike}`);
          if (byStrike.maturities.length > 0) {
            console.log(`[scrape-tradingview-options] Sample processed maturity:`, JSON.stringify(byStrike.maturities[0], null, 2));
          }
          
          cache.set(cacheKey, { 
            expiresAt: Date.now() + CACHE_TTL_MS, 
            data: byStrike 
          });
          
          return byStrike;
        } else {
          // Old mode: Use markdown parsing
          const markdown = data.data?.markdown || data.markdown || '';
          const html = data.data?.html || data.html || '';
          console.log(`[scrape-tradingview-options] Markdown length: ${markdown.length}, HTML length: ${html.length} for ${cacheKey}`);
          
          if (markdown.length === 0 && html.length === 0) {
            console.warn(`[scrape-tradingview-options] ⚠️ Empty markdown and HTML for ${cacheKey}!`);
            cache.set(cacheKey, { 
              expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS, 
              data: null,
              error: 'Empty response from Firecrawl'
            });
            return null;
          }
          
          // Log first 2000 chars of markdown for debugging
          if (markdown.length > 0) {
            console.log(`[scrape-tradingview-options] Markdown preview (first 2000 chars):`, markdown.substring(0, 2000));
          }
          
          const optionsData = parseOptionsChain(markdown, html, symbol, exchange, maturity);
          console.log(`[scrape-tradingview-options] Parsed: ${optionsData.calls.length} calls, ${optionsData.puts.length} puts, ${optionsData.maturities.length} maturities for ${cacheKey}`);
          
          if (optionsData.calls.length === 0 && optionsData.puts.length === 0) {
            console.warn(`[scrape-tradingview-options] ⚠️ No options parsed for ${cacheKey}! This may indicate a parsing issue.`);
            console.log(`[scrape-tradingview-options] Underlying price: ${optionsData.underlyingPrice}, Selected maturity: ${optionsData.selectedMaturity}`);
          } else {
            console.log(`[scrape-tradingview-options] ✅ Successfully parsed options for ${cacheKey}`);
          }

          // Extract and save strikes to DB (when scraping by maturity)
          const allStrikes = new Set<number>();
          optionsData.calls.forEach(call => allStrikes.add(call.strike));
          optionsData.puts.forEach(put => allStrikes.add(put.strike));
          
          if (allStrikes.size > 0) {
            const strikesArray = Array.from(allStrikes).sort((a, b) => a - b);
            console.log(`[scrape-tradingview-options] Saving ${strikesArray.length} strikes to DB for ${exchange}-${symbol}`);
            await saveStrikesToDB(exchange, symbol, strikesArray).catch(err => {
              console.error(`[scrape-tradingview-options] ❌ Error saving strikes to DB:`, err);
            });
          } else {
            console.warn(`[scrape-tradingview-options] ⚠️ No strikes found to save for ${exchange}-${symbol}`);
          }

          cache.set(cacheKey, { 
            expiresAt: Date.now() + CACHE_TTL_MS, 
            data: optionsData 
          });

          return optionsData;
        }
      } catch (err) {
        console.error(`[scrape-tradingview-options] ❌ Scrape error for ${cacheKey}:`, err);
        if (err instanceof Error) {
          console.error(`[scrape-tradingview-options] Error stack:`, err.stack);
        }
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
    console.warn(`[parseOptionsChain] ⚠️ Could not find options table header for ${symbol}. Markdown has ${lines.length} lines.`);
    console.log(`[parseOptionsChain] Sample lines (first 20):`, lines.slice(0, 20).join('\n'));
    return result;
  }

  const headerCells = splitMdRow(lines[headerLineIndex]);
  console.log(`[parseOptionsChain] Found header at line ${headerLineIndex}, cells:`, headerCells.slice(0, 10).join(', '));
  
  const strikeIndex = findHeaderIndex(headerCells, ['strike', "prix d'exercice", 'exercice', "prix d'exercice"]);
  if (strikeIndex === -1) {
    console.warn(`[parseOptionsChain] ⚠️ Could not find strike column index for ${symbol}. Header cells:`, headerCells.join(', '));
    return result;
  }
  
  console.log(`[parseOptionsChain] Strike column index: ${strikeIndex} for ${symbol}`);

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
  if (!cell) return 0;
  
  // First try to parse as a decimal number (handles "57,75", "57.75", etc.)
  const num = parseNum(cell);
  if (num > 0) return num;
  
  // Fallback: handle cases where strike might be repeated (legacy behavior)
  const digits = cell.replace(/\D/g, '');
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
