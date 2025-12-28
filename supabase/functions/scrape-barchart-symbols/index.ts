import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FuturesSymbol {
  symbol: string;
  name: string;
  latest: string;
  change: string;
  volume: string;
}

interface CategorySymbolsResponse {
  success: boolean;
  category: string;
  symbols: FuturesSymbol[];
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category } = await req.json();

    if (!category) {
      return new Response(
        JSON.stringify({ success: false, error: 'Category is required' }),
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

    const categoryUrls: Record<string, string> = {
      energies: 'https://www.barchart.com/futures/energies',
      grains: 'https://www.barchart.com/futures/grains',
      metals: 'https://www.barchart.com/futures/metals',
      softs: 'https://www.barchart.com/futures/softs',
    };

    const url = categoryUrls[category.toLowerCase()];
    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid category: ${category}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scraping symbols for category: ${category}`);
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
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('Firecrawl scrape error:', scrapeData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: scrapeData.error || `Failed to scrape Barchart ${category} page` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scrape successful, parsing symbols...');

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const symbols = parseSymbolsFromContent(markdown, category);

    console.log(`Parsed ${symbols.length} symbols for ${category}`);

    return new Response(
      JSON.stringify({
        success: true,
        category,
        symbols,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-barchart-symbols:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseSymbolsFromContent(markdown: string, category: string): FuturesSymbol[] {
  const symbols: FuturesSymbol[] = [];
  const seenSymbols = new Set<string>();
  
  // Look for patterns like [CLG26](url) followed by contract name
  // Pattern: [SYMBOL](url) [Contract Name](url)
  const symbolPattern = /\[([A-Z]{2,4}[FGHJKMNQUVXZ]\d{2})\]\([^)]+\)\s*\[([^\]]+)\]/g;
  
  let match;
  while ((match = symbolPattern.exec(markdown)) !== null) {
    const fullSymbol = match[1];
    const contractName = match[2];
    
    // Extract base symbol (first 2-3 letters)
    const baseSymbol = fullSymbol.replace(/[FGHJKMNQUVXZ]\d{2}$/, '');
    
    if (!seenSymbols.has(baseSymbol)) {
      seenSymbols.add(baseSymbol);
      symbols.push({
        symbol: baseSymbol,
        name: contractName.replace(/\s*\([^)]+\)\s*$/, '').trim(),
        latest: '',
        change: '',
        volume: '',
      });
    }
  }
  
  // If the first pattern didn't work, try alternative patterns
  if (symbols.length === 0) {
    // Look for symbol codes directly
    const altPattern = /\b([A-Z]{2,4})([FGHJKMNQUVXZ])(\d{2})\b/g;
    
    while ((match = altPattern.exec(markdown)) !== null) {
      const baseSymbol = match[1];
      
      if (!seenSymbols.has(baseSymbol) && baseSymbol.length >= 2 && baseSymbol.length <= 4) {
        seenSymbols.add(baseSymbol);
        symbols.push({
          symbol: baseSymbol,
          name: getDefaultName(baseSymbol),
          latest: '',
          change: '',
          volume: '',
        });
      }
    }
  }
  
  return symbols;
}

function getDefaultName(symbol: string): string {
  const names: Record<string, string> = {
    // Energies
    CL: 'Crude Oil WTI',
    HO: 'ULSD NY Harbor',
    RB: 'Gasoline RBOB',
    NG: 'Natural Gas',
    QA: 'Crude Oil Brent (F)',
    QM: 'Crude Oil Mini',
    QG: 'Natural Gas Mini',
    
    // Grains
    ZC: 'Corn',
    ZS: 'Soybean',
    ZM: 'Soybean Meal',
    ZL: 'Soybean Oil',
    ZW: 'Wheat',
    ZO: 'Oats',
    ZR: 'Rough Rice',
    
    // Metals
    GC: 'Gold',
    SI: 'Silver',
    HG: 'High Grade Copper',
    PA: 'Palladium',
    PL: 'Platinum',
    
    // Softs
    CT: 'Cotton #2',
    KC: 'Coffee',
    SB: 'Sugar #11',
    CC: 'Cocoa',
    OJ: 'Orange Juice',
    LB: 'Lumber',
  };
  
  return names[symbol] || symbol;
}
