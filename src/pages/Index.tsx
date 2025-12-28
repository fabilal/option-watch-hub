import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { CategorySelector } from "@/components/CategorySelector";
import { SymbolSelector } from "@/components/SymbolSelector";
import { MaturitySelector } from "@/components/MaturitySelector";
import { StatsCards } from "@/components/StatsCards";
import { OptionsTable } from "@/components/OptionsTable";
import { IVSmileChart } from "@/components/IVSmileChart";
import { TypeToggle } from "@/components/TypeToggle";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Download, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COMMODITY_SYMBOLS,
  generateMaturities,
  generateDemoOptionsData,
  type CommodityCategory,
  type CommoditySymbol,
  type Maturity,
  type OptionsChain,
} from "@/lib/commodityData";
import { useToast } from "@/hooks/use-toast";

export default function Index() {
  const { toast } = useToast();
  const [category, setCategory] = useState<CommodityCategory>("energies");
  const [symbol, setSymbol] = useState<CommoditySymbol | null>(null);
  const [maturity, setMaturity] = useState<Maturity | null>(null);
  const [optionsData, setOptionsData] = useState<OptionsChain | null>(null);
  const [optionType, setOptionType] = useState<"calls" | "puts" | "all">("all");
  const [isLoading, setIsLoading] = useState(false);

  const symbols = COMMODITY_SYMBOLS[category];
  const maturities = generateMaturities();

  // Set default symbol when category changes
  useEffect(() => {
    if (symbols.length > 0) {
      setSymbol(symbols[0]);
    }
  }, [category, symbols]);

  // Set default maturity on mount
  useEffect(() => {
    if (maturities.length > 0 && !maturity) {
      setMaturity(maturities[0]);
    }
  }, []);

  // Load data when symbol or maturity changes
  useEffect(() => {
    if (symbol && maturity) {
      setIsLoading(true);
      
      const timer = setTimeout(() => {
        const data = generateDemoOptionsData(symbol, maturity);
        setOptionsData(data);
        setIsLoading(false);
        
        toast({
          title: "Data loaded",
          description: `Showing options for ${symbol.name} - ${maturity.label}`,
        });
      }, 600);
      
      return () => clearTimeout(timer);
    }
  }, [symbol, maturity, toast]);

  const loadOptionsData = () => {
    if (!symbol || !maturity) return;

    setIsLoading(true);
    
    setTimeout(() => {
      const data = generateDemoOptionsData(symbol, maturity);
      setOptionsData(data);
      setIsLoading(false);

      toast({
        title: "Data loaded",
        description: `Showing options for ${symbol.name} - ${maturity.label}`,
      });
    }, 600);
  };

  const handleRefresh = () => {
    loadOptionsData();
  };

  const handleDownload = () => {
    if (!optionsData) return;

    const csvContent = generateCSV(optionsData);
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${optionsData.symbol}_${maturity?.code}_options.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Options data exported to CSV",
    });
  };

  const generateCSV = (data: OptionsChain): string => {
    const headers = ["Strike", "Type", "Latest", "IV", "Delta", "Gamma", "Theta", "Vega", "IV Skew", "Last Trade"];
    const rows = [...data.calls, ...data.puts].map((opt) => [
      opt.strike,
      opt.type,
      opt.latest,
      opt.iv,
      opt.delta,
      opt.gamma,
      opt.theta,
      opt.vega,
      opt.ivSkew,
      opt.lastTrade,
    ]);
    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-8">
        {/* Info Banner */}
        <div className="mb-6 p-4 rounded-lg bg-accent/10 border border-accent/20 flex items-start gap-3">
          <Info className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-foreground font-medium">Demo Mode</p>
            <p className="text-xs text-muted-foreground">
              This dashboard displays simulated options data. To fetch live data from Barchart, 
              connect Lovable Cloud with the Firecrawl integration.
            </p>
          </div>
        </div>

        {/* Selectors */}
        <div className="space-y-6 mb-8">
          <CategorySelector selected={category} onSelect={setCategory} />

          <div className="flex flex-wrap items-center gap-4">
            <SymbolSelector
              symbols={symbols}
              selected={symbol}
              onSelect={setSymbol}
            />
            <MaturitySelector
              maturities={maturities}
              selected={maturity}
              onSelect={setMaturity}
            />
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading || !symbol}
                className="border-border hover:border-primary/50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!optionsData}
                className="border-border hover:border-primary/50"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : optionsData ? (
          <div className="space-y-6 animate-fade-in">
            {/* Contract Info */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">
                  {optionsData.name}
                  <span className="text-primary ml-2 font-mono text-lg">
                    ({optionsData.symbol})
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  {optionsData.maturity} • Volatility & Greeks
                </p>
              </div>
            </div>

            {/* Stats Cards */}
            <StatsCards data={optionsData} />

            {/* IV Smile Chart */}
            <IVSmileChart calls={optionsData.calls} puts={optionsData.puts} />

            {/* Options Table */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Options Chain</h3>
                <TypeToggle selected={optionType} onSelect={setOptionType} />
              </div>
              <OptionsTable
                calls={optionsData.calls}
                puts={optionsData.puts}
                showType={optionType}
              />
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-6">
          <p className="text-center text-sm text-muted-foreground">
            Data sourced from Barchart.com • Options volatility and greeks for commodity futures
          </p>
        </div>
      </footer>
    </div>
  );
}
