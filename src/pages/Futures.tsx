import { useState, useEffect, useCallback, useMemo } from "react";
import { Header } from "@/components/Header";
import { CategorySelector } from "@/components/CategorySelector";
import { SymbolSelector } from "@/components/SymbolSelector";
import { MaturitySelector } from "@/components/MaturitySelector";
import { FuturesPricesTable } from "@/components/FuturesPricesTable";
import { RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COMMODITY_SYMBOLS,
  generateMaturities,
  type CommodityCategory,
  type CommoditySymbol,
  type Maturity,
  type FuturesPricesData,
} from "@/lib/commodityData";
import { fetchCategorySymbols, fetchFuturesPrices } from "@/lib/barchartApi";
import { useToast } from "@/hooks/use-toast";

export default function Futures() {
  const { toast } = useToast();

  const [category, setCategory] = useState<CommodityCategory>("energies");
  const [symbols, setSymbols] = useState<CommoditySymbol[]>(COMMODITY_SYMBOLS.energies);
  const [symbol, setSymbol] = useState<CommoditySymbol | null>(COMMODITY_SYMBOLS.energies[0] || null);
  const [maturity, setMaturity] = useState<Maturity | null>(() => {
    const mats = generateMaturities();
    return mats.length > 0 ? mats[0] : null;
  });
  const [futuresData, setFuturesData] = useState<FuturesPricesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maturities = useMemo(() => generateMaturities(), []);

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

  const loadFuturesData = useCallback(async () => {
    if (!symbol || !maturity) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchFuturesPrices(symbol, maturity);
      setFuturesData(data);
      if (data && data.futures.length > 0) {
        toast({
          title: "Données chargées",
          description: `${data.futures.length} contrats futures pour ${symbol.name}`,
        });
      } else {
        setError("Aucune donnée futures disponible pour cette combinaison.");
      }
    } catch (err) {
      console.error('Error fetching futures:', err);
      const msg = err instanceof Error ? err.message : "Erreur lors du chargement des prix futures";
      setError(msg);
      setFuturesData(null);
      toast({
        title: "Prix futures indisponibles",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [symbol, maturity, toast]);

  // Trigger data load when symbol or maturity changes
  useEffect(() => {
    if (!symbol || !maturity) return;
    loadFuturesData();
  }, [symbol, maturity, loadFuturesData]);

  const handleRefresh = () => {
    loadFuturesData();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Prix Futures</h1>
          <p className="text-muted-foreground mt-1">
            Visualisez les prix des contrats futures par commodity
          </p>
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
                Actualiser
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
        <div className="space-y-6 animate-fade-in">
          {symbol && (
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">
                  {symbol.name}
                <span className="text-primary ml-2 font-mono text-lg">
                  ({symbol.baseSymbol})
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  {maturity?.label} • Courbe des prix futures
                </p>
              </div>
            </div>
          )}

          <FuturesPricesTable data={futuresData} isLoading={isLoading} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-6">
          <p className="text-center text-sm text-muted-foreground">
            Données extraites de Barchart.com • Prix des contrats futures sur commodités
          </p>
        </div>
      </footer>
    </div>
  );
}
