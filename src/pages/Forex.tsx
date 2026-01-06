import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";

import { RefreshCw, AlertCircle, DollarSign, BarChart3, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  fetchForexSymbols,
  fetchForexFutures,
  fetchForexOptions,
  type ForexCategory,
  type ForexSymbol,
  type ForexFuturesContract,
  type ForexOptionsChain,
  FOREX_CATEGORIES,
} from "@/lib/forexApi";
import { ForexCategorySelector } from "@/components/forex/ForexCategorySelector";
import { ForexSymbolSelector } from "@/components/forex/ForexSymbolSelector";
import { ForexMaturitySelector } from "@/components/forex/ForexMaturitySelector";
import { ForexFuturesTable } from "@/components/forex/ForexFuturesTable";
import { ForexOptionsTable } from "@/components/forex/ForexOptionsTable";
import { ForexOptionsStats } from "@/components/forex/ForexOptionsStats";

export default function Forex() {
  const { toast } = useToast();

  const [category, setCategory] = useState<ForexCategory>("majors");
  const [symbols, setSymbols] = useState<ForexSymbol[]>([]);
  const [symbol, setSymbol] = useState<ForexSymbol | null>(null);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);

  const [futures, setFutures] = useState<ForexFuturesContract[]>([]);
  const [isLoadingFutures, setIsLoadingFutures] = useState(false);

  const [options, setOptions] = useState<ForexOptionsChain | null>(null);
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
        const fetchedSymbols = await fetchForexSymbols(category);
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
      const data = await fetchForexFutures(symbol);
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
  const loadOptions = useCallback(async (maturity?: string) => {
    if (!symbol) return;

    setIsLoadingOptions(true);
    setError(null);
    try {
      const data = await fetchForexOptions(symbol, maturity);
      setOptions(data);

      if (data?.maturities?.length) {
        const next =
          (maturity && data.maturities.includes(maturity) ? maturity : undefined) ||
          (selectedMaturity && data.maturities.includes(selectedMaturity) ? selectedMaturity : undefined) ||
          data.selectedMaturity ||
          data.maturities[0];
        if (next && next !== selectedMaturity) setSelectedMaturity(next);
      }

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
  }, [symbol, toast, selectedMaturity]);

  // Load data when symbol changes
  useEffect(() => {
    if (!symbol) return;

    if (activeTab === "futures") {
      loadFutures();
    } else {
      loadOptions(selectedMaturity || undefined);
    }
  }, [symbol, activeTab, loadFutures, loadOptions]);

  // Reload options when maturity changes
  const handleMaturityChange = (maturity: string) => {
    setSelectedMaturity(maturity);
    loadOptions(maturity);
  };

  const handleRefresh = () => {
    if (activeTab === "futures") {
      loadFutures();
    } else {
      loadOptions(selectedMaturity || undefined);
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
            <DollarSign className="w-6 h-6 text-primary" />
            Forex Dashboard
          </h1>
          <p className="text-muted-foreground">
            Futures et options sur devises en temps réel
          </p>
        </div>

        {/* Selectors */}
        <div className="space-y-6 mb-8">
          <ForexCategorySelector selected={category} onSelect={setCategory} />

          <div className="flex flex-wrap items-center gap-4">
            <ForexSymbolSelector 
              symbols={symbols} 
              selected={symbol} 
              onSelect={setSymbol}
              disabled={isLoadingSymbols}
            />
            
            {/* Show maturity selector only for options tab */}
            {activeTab === "options" && options && options.maturities.length > 0 && (
              <ForexMaturitySelector
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
                <ForexFuturesTable contracts={futures} />
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
                <ForexOptionsStats options={options} />
                
                {/* Options Table */}
                <ForexOptionsTable calls={options.calls} puts={options.puts} />
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
            Données TradingView • Forex - Majors, Minors, Exotiques
          </p>
        </div>
      </footer>
    </div>
  );
}
