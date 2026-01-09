import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { TVCategorySelector } from "@/components/tradingview/TVCategorySelector";
import { TVSymbolSelector } from "@/components/tradingview/TVSymbolSelector";
import { TVMaturitySelector } from "@/components/tradingview/TVMaturitySelector";
import { TVFuturesTable } from "@/components/tradingview/TVFuturesTable";
import { TVOptionsTable } from "@/components/tradingview/TVOptionsTable";
import { TVOptionsStats } from "@/components/tradingview/TVOptionsStats";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";

import { RefreshCw, AlertCircle, TrendingUp, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  fetchTVSymbols,
  fetchTVFutures,
  fetchTVOptions,
  type TVCategory,
  type TVSymbol,
  type TVFuturesContract,
  type TVOptionsChain,
} from "@/lib/tradingviewApi";

export default function TradingView() {
  const { toast } = useToast();

  const [category, setCategory] = useState<TVCategory>("energy");
  const [symbols, setSymbols] = useState<TVSymbol[]>([]);
  const [symbol, setSymbol] = useState<TVSymbol | null>(null);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);

  const [futures, setFutures] = useState<TVFuturesContract[]>([]);
  const [isLoadingFutures, setIsLoadingFutures] = useState(false);

  const [options, setOptions] = useState<TVOptionsChain | null>(null);
  const [selectedMaturity, setSelectedMaturity] = useState<string | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  const [activeTab, setActiveTab] = useState<"futures" | "options">("futures");
  const [error, setError] = useState<string | null>(null);

  // Load symbols when category changes
  useEffect(() => {
    const loadSymbols = async () => {
      setIsLoadingSymbols(true);
      setError(null);
      try {
        const fetchedSymbols = await fetchTVSymbols(category);
        setSymbols(fetchedSymbols);
        if (fetchedSymbols.length > 0) {
          setSymbol(fetchedSymbols[0]);
        }
      } catch (err) {
        console.error('Failed to load symbols:', err);
        setError('Impossible de charger les symboles');
      } finally {
        setIsLoadingSymbols(false);
      }
    };

    loadSymbols();
  }, [category]);

  // Load futures data when symbol changes
  const loadFutures = useCallback(async () => {
    if (!symbol) return;

    setIsLoadingFutures(true);
    setError(null);
    try {
      const data = await fetchTVFutures(symbol);
      setFutures(data);
      if (data.length > 0) {
        toast({
          title: "Données chargées",
          description: `${data.length} contrats futures pour ${symbol.name}`,
        });
      }
    } catch (err) {
      console.error('Failed to load futures:', err);
      setError('Impossible de charger les futures');
      toast({
        title: "Erreur",
        description: "Impossible de charger les données futures",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFutures(false);
    }
  }, [symbol, toast]);

  // Load options data when symbol changes
  const loadOptions = useCallback(async (strike?: number) => {
    if (!symbol) return;

    setIsLoadingOptions(true);
    setError(null);
    try {
      const data = await fetchTVOptions(symbol, strike);
      setOptions(data);

      if (data && (data.calls.length > 0 || data.puts.length > 0)) {
        toast({
          title: "Options chargées",
          description: `${data.calls.length} calls et ${data.puts.length} puts`,
        });
      }
    } catch (err) {
      console.error('Failed to load options:', err);
      setError('Impossible de charger les options');
      toast({
        title: "Erreur",
        description: "Impossible de charger les données options",
        variant: "destructive",
      });
    } finally {
      setIsLoadingOptions(false);
    }
  }, [symbol, toast]);

  // Load data when symbol changes
  useEffect(() => {
    if (!symbol) return;

    if (activeTab === "futures") {
      loadFutures();
    } else {
      loadOptions();
    }
  }, [symbol, activeTab, loadFutures, loadOptions]);

  const handleRefresh = () => {
    if (activeTab === "futures") {
      loadFutures();
    } else {
      loadOptions();
    }
  };

  const isLoading = activeTab === "futures" ? isLoadingFutures : isLoadingOptions;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-8">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Commodities Dashboard
          </h1>
          <p className="text-muted-foreground">
            Futures et options sur matières premières en temps réel
          </p>
        </div>

        {/* Selectors */}
        <div className="space-y-6 mb-8">
          <TVCategorySelector selected={category} onSelect={setCategory} />

          <div className="flex flex-wrap items-center gap-4">
            <TVSymbolSelector 
              symbols={symbols} 
              selected={symbol} 
              onSelect={setSymbol}
              disabled={isLoadingSymbols}
            />
            
            {/* Show maturity selector only for options tab */}
            {activeTab === "options" && options && options.maturities.length > 0 && (
              <TVMaturitySelector
                maturities={options.maturities}
                selected={selectedMaturity || options.maturities[0]}
                onSelect={handleMaturityChange}
                disabled={isLoadingOptions}
              />
            )}
            
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "futures" | "options")}>
          <TabsList className="mb-6">
            <TabsTrigger value="futures" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Futures
            </TabsTrigger>
            <TabsTrigger value="options" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Options
            </TabsTrigger>
          </TabsList>

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

          <TabsContent value="futures">
            {isLoadingFutures ? (
              <LoadingSkeleton />
            ) : futures.length > 0 ? (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {symbol?.name}
                      <span className="text-primary ml-2 font-mono text-lg">({symbol?.symbol})</span>
                    </h2>
                    <p className="text-muted-foreground">{symbol?.exchange} • Contrats Futures</p>
                  </div>
                </div>
                <TVFuturesTable contracts={futures} />
              </div>
            ) : !isLoadingFutures && !error ? (
              <EmptyState />
            ) : null}
          </TabsContent>

          <TabsContent value="options">
            {isLoadingOptions ? (
              <LoadingSkeleton />
            ) : options && (options.calls.length > 0 || options.puts.length > 0) ? (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {symbol?.name}
                      <span className="text-primary ml-2 font-mono text-lg">({symbol?.symbol})</span>
                    </h2>
                    <p className="text-muted-foreground">
                      {symbol?.exchange} • Chaîne d'Options
                      {options.underlyingPrice && options.underlyingPrice !== '0' && ` • Prix sous-jacent: $${options.underlyingPrice}`}
                      {options.selectedMaturity && ` • ${options.selectedMaturity}`}
                    </p>
                  </div>
                </div>
                
                {/* Stats Cards */}
                <TVOptionsStats options={options} />
                
                {/* Options Table */}
                <TVOptionsTable calls={options.calls} puts={options.puts} />
              </div>
            ) : !isLoadingOptions && !error ? (
              <EmptyState />
            ) : null}
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-6">
          <p className="text-center text-sm text-muted-foreground">
            Données TradingView • Commodities - Énergie, Agriculture, Métaux
          </p>
        </div>
      </footer>
    </div>
  );
}
