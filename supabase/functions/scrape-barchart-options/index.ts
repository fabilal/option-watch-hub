import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptionData {
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

interface OptionsChainResponse {
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, maturityCode, name, optionPointValue } = await req.json();

    if (!symbol || !maturityCode) {
      return new Response(
        JSON.stringify({ success: false, error: 'Symbol and maturityCode are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fullSymbol = `${symbol}${maturityCode}`;
    const url = `https://www.barchart.com/futures/quotes/${fullSymbol}/volatility-greeks?futuresOptionsView=merged`;

    console.log(`Scraping options data for: ${fullSymbol}`);
    console.log(`URL: ${url}`);

    // Scrape the page using Firecrawl
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: false,
        waitFor: 5000,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('Firecrawl scrape error:', scrapeData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: scrapeData.error || `Failed to scrape Barchart page` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scrape successful, parsing options data...');

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    console.log(`Markdown length: ${markdown.length}`);

    // Parse the markdown content
    const parsedData = parseOptionsFromMarkdown(markdown, fullSymbol, name, optionPointValue);

    console.log(`Parsed ${parsedData.calls.length} calls and ${parsedData.puts.length} puts`);

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-barchart-options:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseOptionsFromMarkdown(
  markdown: string,
  symbol: string,
  name: string,
  optionPointValue: number
): OptionsChainResponse {
  const calls: OptionData[] = [];
  const puts: OptionData[] = [];
  let daysToExpiration = 0;
  let impliedVolatility = 0;
  let maturity = '';

  // Extract days to expiration: "**16 Days** to expiration"
  const daysMatch = markdown.match(/\*\*(\d+)\s*Days?\*\*\s*to\s*expiration/i);
  if (daysMatch) {
    daysToExpiration = parseInt(daysMatch[1], 10);
    console.log(`Found days to expiration: ${daysToExpiration}`);
  }

  // Extract implied volatility: "Implied Volatility: **29.58%**"
  const ivMatch = markdown.match(/Implied\s*Volatility[:\s]*\*?\*?(\d+\.?\d*)%?\*?\*?/i);
  if (ivMatch) {
    impliedVolatility = parseFloat(ivMatch[1]);
    console.log(`Found implied volatility: ${impliedVolatility}%`);
  }

  // Extract maturity from page title or content
  const maturityMatch = markdown.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*['']?\d{2,4}/i);
  if (maturityMatch) {
    maturity = maturityMatch[0];
    console.log(`Found maturity: ${maturity}`);
  }

  // Split markdown into lines and process
  const lines = markdown.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Find the Calls and Puts sections
  let inCallsSection = false;
  let inPutsSection = false;
  let currentOption: Partial<OptionData> = {};
  let fieldIndex = 0;
  
  // The field order after "Call" or "Put" is:
  // Latest, IV, Delta, Gamma, Theta, Vega, IV Skew, Last Trade
  const fieldNames = ['latest', 'iv', 'delta', 'gamma', 'theta', 'vega', 'ivSkew', 'lastTrade'];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect section markers
    if (line === '#### Calls' || line.toLowerCase() === 'calls') {
      inCallsSection = true;
      inPutsSection = false;
      currentOption = {};
      fieldIndex = 0;
      continue;
    }
    
    if (line === '#### Puts' || line.toLowerCase() === 'puts') {
      inCallsSection = false;
      inPutsSection = true;
      currentOption = {};
      fieldIndex = 0;
      continue;
    }
    
    // Skip header row labels
    if (['Strike', 'Type', 'Latest', 'IV', 'Delta', 'Gamma', 'Theta', 'Vega', 'IV Skew', 'Last Trade', 'Links'].includes(line)) {
      continue;
    }
    
    // Skip loading indicators and other non-data
    if (line.includes('Please wait') || line.includes('throbber') || line.startsWith('![')) {
      continue;
    }
    
    // Only process when in a data section
    if (!inCallsSection && !inPutsSection) {
      continue;
    }
    
    // Check if this is a strike price (number between 1 and 10000)
    const strikeMatch = line.match(/^(\d+\.?\d*)$/);
    if (strikeMatch) {
      const potentialStrike = parseFloat(strikeMatch[1]);
      // Validate it looks like a strike price (reasonable range)
      if (potentialStrike >= 1 && potentialStrike <= 10000) {
        // If we have a complete option, save it
        if (currentOption.strike && currentOption.type) {
          const option: OptionData = {
            strike: currentOption.strike,
            type: currentOption.type,
            latest: currentOption.latest || '0.00',
            iv: currentOption.iv || 0,
            delta: currentOption.delta || 0,
            gamma: currentOption.gamma || 0,
            theta: currentOption.theta || 0,
            vega: currentOption.vega || 0,
            ivSkew: currentOption.ivSkew || 0,
            lastTrade: currentOption.lastTrade || '',
          };
          
          if (inCallsSection && option.type === 'Call') {
            calls.push(option);
          } else if (inPutsSection && option.type === 'Put') {
            puts.push(option);
          }
        }
        
        // Start new option
        currentOption = { strike: potentialStrike };
        fieldIndex = 0;
        continue;
      }
    }
    
    // Check if this is Call or Put
    if (line === 'Call' || line === 'Put') {
      currentOption.type = line as 'Call' | 'Put';
      fieldIndex = 0;
      continue;
    }
    
    // If we have a strike and type, collect the remaining fields
    if (currentOption.strike && currentOption.type && fieldIndex < fieldNames.length) {
      const fieldName = fieldNames[fieldIndex];
      
      switch (fieldName) {
        case 'latest':
          currentOption.latest = line.replace(/[^\d.s]/g, '') || line;
          break;
        case 'iv':
          currentOption.iv = parseFloat(line.replace('%', '')) || 0;
          break;
        case 'delta':
          currentOption.delta = parseFloat(line) || 0;
          break;
        case 'gamma':
          currentOption.gamma = parseFloat(line) || 0;
          break;
        case 'theta':
          currentOption.theta = parseFloat(line) || 0;
          break;
        case 'vega':
          currentOption.vega = parseFloat(line) || 0;
          break;
        case 'ivSkew':
          currentOption.ivSkew = parseFloat(line.replace('%', '').replace('+', '')) || 0;
          if (line.startsWith('-')) {
            currentOption.ivSkew = -Math.abs(currentOption.ivSkew);
          }
          break;
        case 'lastTrade':
          currentOption.lastTrade = line;
          break;
      }
      
      fieldIndex++;
    }
  }
  
  // Don't forget to save the last option
  if (currentOption.strike && currentOption.type) {
    const option: OptionData = {
      strike: currentOption.strike,
      type: currentOption.type,
      latest: currentOption.latest || '0.00',
      iv: currentOption.iv || 0,
      delta: currentOption.delta || 0,
      gamma: currentOption.gamma || 0,
      theta: currentOption.theta || 0,
      vega: currentOption.vega || 0,
      ivSkew: currentOption.ivSkew || 0,
      lastTrade: currentOption.lastTrade || '',
    };
    
    if (inCallsSection && option.type === 'Call') {
      calls.push(option);
    } else if (inPutsSection && option.type === 'Put') {
      puts.push(option);
    }
  }

  console.log(`Final count - Calls: ${calls.length}, Puts: ${puts.length}`);

  return {
    success: true,
    symbol,
    name: name || symbol,
    maturity,
    daysToExpiration,
    impliedVolatility: Math.round(impliedVolatility * 100) / 100,
    priceOfOptionPoint: optionPointValue || 1000,
    calls: calls.sort((a, b) => a.strike - b.strike),
    puts: puts.sort((a, b) => a.strike - b.strike),
  };
}
