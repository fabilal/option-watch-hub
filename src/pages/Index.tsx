import { useState, useEffect, useCallback } from "react";
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
import { Download, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COMMODITY_SYMBOLS,
  generateMaturities,
  type CommodityCategory,
  type CommoditySymbol,
  type Maturity,
  type OptionsChain,
} from "@/lib/commodityData";
import { fetchOptionsData, fetchCategorySymbols } from "@/lib/barchartApi";
import { useToast } from "@/hooks/use-toast";

export default function Index() {
  const { toast } = useToast();
  const [category, setCategory] = useState<CommodityCategory>("energies");
  const [symbols, setSymbols] = useState<CommoditySymbol[]>(COMMODITY_SYMBOLS.energies);
  const [symbol, setSymbol] = useState<CommoditySymbol | null>(COMMODITY_SYMBOLS.energies[0] || null);
  const [maturity, setMaturity] = useState<Maturity | null>(() => {
    const mats = generateMaturities();
    return mats.length > 0 ? mats[0] : null;
  });
  const [optionsData, setOptionsData] = useState<OptionsChain | null>(null);
  const [optionType, setOptionType] = useState<"calls" | "puts" | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maturities = generateMaturities();

  // Load symbols when category changes
  useEffect(() => {
    const loadSymbols = async () => {
      setIsLoadingSymbols(true);
      try {
        const fetchedSymbols = await fetchCategorySymbols(category);
        setSymbols(fetchedSymbols);
        if (fetchedSymbols.length > 0) {
          setSymbol(fetchedSymbols[0]);
        }
      } catch (err) {
        console.error('Failed to load symbols:', err);
        // Fall back to static symbols
        const staticSymbols = COMMODITY_SYMBOLS[category];
        setSymbols(staticSymbols);
        if (staticSymbols.length > 0) {
          setSymbol(staticSymbols[0]);
        }
      } finally {
        setIsLoadingSymbols(false);
      }
    };

    loadSymbols();
  }, [category]);

  // Note: maturities are set in initial state now

  // Load options data when symbol or maturity changes
  const loadOptionsData = useCallback(async () => {
    if (!symbol || !maturity) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchOptionsData(symbol, maturity);
      
      if (data) {
        setOptionsData(data);
        
        if (data.calls.length === 0 && data.puts.length === 0) {
          toast({
            title: "Données limitées",
            description: "Aucune donnée d'options n'a été trouvée pour cette combinaison symbole/maturité.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Données chargées",
            description: `${data.calls.length} calls et ${data.puts.length} puts pour ${symbol.name}`,
          });
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des données';
      setError(errorMessage);
      setOptionsData(null);
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [symbol, maturity, toast]);

  // Trigger data load when symbol or maturity changes
  useEffect(() => {
    if (symbol && maturity) {
      loadOptionsData();
    }
  }, [symbol, maturity, loadOptionsData]);

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
      title: "Téléchargé",
      description: "Données exportées en CSV",
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
                Actualiser
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!optionsData || optionsData.calls.length === 0}
                className="border-border hover:border-primary/50"
              >
                <Download className="w-4 h-4 mr-2" />
                Télécharger
              </Button>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-foreground font-medium">Erreur de chargement</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : optionsData && (optionsData.calls.length > 0 || optionsData.puts.length > 0) ? (
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
                  {optionsData.maturity || maturity?.label} • Volatilité & Greeks
                </p>
              </div>
            </div>

            {/* Stats Cards */}
            <StatsCards data={optionsData} />

            {/* IV Smile Chart */}
            {optionsData.calls.length > 0 && (
              <IVSmileChart calls={optionsData.calls} puts={optionsData.puts} />
            )}

            {/* Options Table */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Chaîne d'Options</h3>
                <TypeToggle selected={optionType} onSelect={setOptionType} />
              </div>
              <OptionsTable
                calls={optionsData.calls}
                puts={optionsData.puts}
                showType={optionType}
              />
            </div>
          </div>
        ) : !isLoading && !error ? (
          <EmptyState />
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-6">
          <p className="text-center text-sm text-muted-foreground">
            Données extraites de Barchart.com • Volatilité implicite et Greeks pour les options sur commodités
          </p>
        </div>
      </footer>
    </div>
  );
}
