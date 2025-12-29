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

serve(async (req) => {
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
        waitFor: 3000,
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
  
  // Pattern 1: [CLG26](url) followed by [Crude Oil WTI (Feb '26)](url)
  // Match: [SYMBOL](url)\n\n[Name (Month 'Year)](url)
  const lines = markdown.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for symbol links like [CLG26](https://www.barchart.com/futures/quotes/CLG26/overview)
    const symbolMatch = line.match(/^\[([A-Z]{2,4})([FGHJKMNQUVXZ])(\d{2})\]\(https:\/\/www\.barchart\.com\/futures\/quotes\//);
    
    if (symbolMatch) {
      const baseSymbol = symbolMatch[1];
      
      if (!seenSymbols.has(baseSymbol)) {
        // Look ahead for the name in the next few lines
        let name = '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          // Match: [Crude Oil WTI (Feb '26)](url) or [Name (Month 'Year)](url)
          const nameMatch = nextLine.match(/^\[([^\]]+)\s*\([^)]+\)\]\(/);
          if (nameMatch) {
            name = nameMatch[1].trim();
            break;
          }
        }
        
        if (name) {
          seenSymbols.add(baseSymbol);
          symbols.push({
            symbol: baseSymbol,
            name: name,
            latest: '',
            change: '',
            volume: '',
          });
        }
      }
    }
  }
  
  // If parsing failed, use comprehensive fallback data
  if (symbols.length === 0) {
    console.log('Using fallback data for', category);
    return getFallbackSymbols(category);
  }
  
  return symbols;
}

function getFallbackSymbols(category: string): FuturesSymbol[] {
  const fallbackData: Record<string, FuturesSymbol[]> = {
    energies: [
      { symbol: 'CL', name: 'Crude Oil WTI', latest: '', change: '', volume: '' },
      { symbol: 'HO', name: 'ULSD NY Harbor', latest: '', change: '', volume: '' },
      { symbol: 'RB', name: 'Gasoline RBOB', latest: '', change: '', volume: '' },
      { symbol: 'NG', name: 'Natural Gas', latest: '', change: '', volume: '' },
      { symbol: 'QM', name: 'E-mini Crude Oil', latest: '', change: '', volume: '' },
      { symbol: 'QG', name: 'E-mini Natural Gas', latest: '', change: '', volume: '' },
      { symbol: 'MCL', name: 'Micro WTI Crude Oil', latest: '', change: '', volume: '' },
      { symbol: 'BZ', name: 'Brent Crude Oil', latest: '', change: '', volume: '' },
      { symbol: 'QA', name: 'Crude Oil Brent (F)', latest: '', change: '', volume: '' },
      { symbol: 'QH', name: 'E-mini Heating Oil', latest: '', change: '', volume: '' },
      { symbol: 'QU', name: 'E-mini RBOB Gasoline', latest: '', change: '', volume: '' },
      { symbol: 'HP', name: 'Heating Oil/Gasoline Spread', latest: '', change: '', volume: '' },
    ],
    grains: [
      { symbol: 'ZC', name: 'Corn', latest: '', change: '', volume: '' },
      { symbol: 'ZS', name: 'Soybean', latest: '', change: '', volume: '' },
      { symbol: 'ZM', name: 'Soybean Meal', latest: '', change: '', volume: '' },
      { symbol: 'ZL', name: 'Soybean Oil', latest: '', change: '', volume: '' },
      { symbol: 'ZW', name: 'Wheat', latest: '', change: '', volume: '' },
      { symbol: 'ZO', name: 'Oats', latest: '', change: '', volume: '' },
      { symbol: 'ZR', name: 'Rough Rice', latest: '', change: '', volume: '' },
      { symbol: 'KE', name: 'Hard Red Winter Wheat', latest: '', change: '', volume: '' },
      { symbol: 'MWE', name: 'Hard Red Spring Wheat', latest: '', change: '', volume: '' },
      { symbol: 'XC', name: 'Mini Corn', latest: '', change: '', volume: '' },
      { symbol: 'XW', name: 'Mini Wheat', latest: '', change: '', volume: '' },
      { symbol: 'XK', name: 'Mini Soybean', latest: '', change: '', volume: '' },
      { symbol: 'ZE', name: 'Ethanol', latest: '', change: '', volume: '' },
    ],
    metals: [
      { symbol: 'GC', name: 'Gold', latest: '', change: '', volume: '' },
      { symbol: 'SI', name: 'Silver', latest: '', change: '', volume: '' },
      { symbol: 'HG', name: 'High Grade Copper', latest: '', change: '', volume: '' },
      { symbol: 'PL', name: 'Platinum', latest: '', change: '', volume: '' },
      { symbol: 'PA', name: 'Palladium', latest: '', change: '', volume: '' },
      { symbol: 'MGC', name: 'Micro Gold', latest: '', change: '', volume: '' },
      { symbol: 'SIL', name: 'Micro Silver', latest: '', change: '', volume: '' },
      { symbol: 'QO', name: 'E-mini Gold', latest: '', change: '', volume: '' },
      { symbol: 'QI', name: 'E-mini Silver', latest: '', change: '', volume: '' },
      { symbol: 'QC', name: 'E-mini Copper', latest: '', change: '', volume: '' },
      { symbol: 'ALI', name: 'Aluminum', latest: '', change: '', volume: '' },
      { symbol: 'MHG', name: 'Micro Copper', latest: '', change: '', volume: '' },
    ],
    softs: [
      { symbol: 'CT', name: 'Cotton #2', latest: '', change: '', volume: '' },
      { symbol: 'KC', name: 'Coffee C', latest: '', change: '', volume: '' },
      { symbol: 'SB', name: 'Sugar #11', latest: '', change: '', volume: '' },
      { symbol: 'CC', name: 'Cocoa', latest: '', change: '', volume: '' },
      { symbol: 'OJ', name: 'Orange Juice', latest: '', change: '', volume: '' },
      { symbol: 'LBS', name: 'Lumber', latest: '', change: '', volume: '' },
      { symbol: 'DY', name: 'Dry Whey', latest: '', change: '', volume: '' },
      { symbol: 'LE', name: 'Live Cattle', latest: '', change: '', volume: '' },
      { symbol: 'GF', name: 'Feeder Cattle', latest: '', change: '', volume: '' },
      { symbol: 'HE', name: 'Lean Hogs', latest: '', change: '', volume: '' },
      { symbol: 'DC', name: 'Class III Milk', latest: '', change: '', volume: '' },
      { symbol: 'GDK', name: 'Class IV Milk', latest: '', change: '', volume: '' },
    ],
  };
  
  return fallbackData[category] || [];
}
