import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";

import { RefreshCw, AlertCircle, DollarSign, BarChart3, TrendingUp, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  fetchForexSymbols,
  fetchForexFutures,
  fetchForexOptions,
  extractMaturitiesFromFutures,
  type ForexCategory,
  type ForexSymbol,
  type ForexFuturesResponse,
  type ForexOptionsChain,
  FOREX_CATEGORIES,
} from "@/lib/forexApi";
import {
  fetchTVForexSymbols,
  fetchTVForexFutures,
  type TVForexSymbol,
  type TVForexFutures,
} from "@/lib/tvForexApi";
import { ForexCategorySelector } from "@/components/forex/ForexCategorySelector";
import { ForexSymbolSelector } from "@/components/forex/ForexSymbolSelector";
import { ForexMaturitySelector } from "@/components/forex/ForexMaturitySelector";
import { ForexFuturesTable } from "@/components/forex/ForexFuturesTable";
import { ForexOptionsTable } from "@/components/forex/ForexOptionsTable";
import { ForexOptionsStats } from "@/components/forex/ForexOptionsStats";
import { TVForexSymbolSelector } from "@/components/forex/TVForexSymbolSelector";
import { TVForexFuturesTable } from "@/components/forex/TVForexFuturesTable";

type DataSource = "barchart" | "tradingview";

export default function Forex() {
  const { toast } = useToast();

  // Data source toggle
  const [dataSource, setDataSource] = useState<DataSource>("barchart");

  // Barchart state
  const [category, setCategory] = useState<ForexCategory>("majors");
  const [symbols, setSymbols] = useState<ForexSymbol[]>([]);
  const [symbol, setSymbol] = useState<ForexSymbol | null>(null);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);

  const [futuresData, setFuturesData] = useState<ForexFuturesResponse | null>(null);
  const [isLoadingFutures, setIsLoadingFutures] = useState(false);

  const [options, setOptions] = useState<ForexOptionsChain | null>(null);
  const [maturities, setMaturities] = useState<string[]>([]);
  const [selectedMaturity, setSelectedMaturity] = useState<string | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  const [activeTab, setActiveTab] = useState<"futures" | "options">("futures");
  const [error, setError] = useState<string | null>(null);

  // TradingView state
  const [tvSymbols, setTVSymbols] = useState<TVForexSymbol[]>([]);
  const [tvSymbol, setTVSymbol] = useState<TVForexSymbol | null>(null);
  const [tvFutures, setTVFutures] = useState<TVForexFutures[]>([]);
  const [isLoadingTVSymbols, setIsLoadingTVSymbols] = useState(false);
  const [isLoadingTVFutures, setIsLoadingTVFutures] = useState(false);
  const [tvError, setTVError] = useState<string | null>(null);

  // Load Barchart symbols when category changes
  useEffect(() => {
    if (dataSource !== "barchart") return;
    
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
  }, [category, dataSource]);

  // Load TradingView symbols
  useEffect(() => {
    if (dataSource !== "tradingview") return;
    if (tvSymbols.length > 0) return; // Already loaded
    
    const loadTVSymbols = async () => {
      setIsLoadingTVSymbols(true);
      setTVError(null);
      try {
        const fetchedSymbols = await fetchTVForexSymbols();
        setTVSymbols(fetchedSymbols);
        if (fetchedSymbols.length > 0 && !tvSymbol) {
          setTVSymbol(fetchedSymbols[0]);
        }
      } catch (err) {
        console.error('Failed to load TV symbols:', err);
        setTVError('Impossible de charger les symboles TradingView');
      } finally {
        setIsLoadingTVSymbols(false);
      }
    };

    loadTVSymbols();
  }, [dataSource, tvSymbols.length, tvSymbol]);

  // Load TradingView futures when symbol changes
  const loadTVFutures = useCallback(async () => {
    if (!tvSymbol) return;

    setIsLoadingTVFutures(true);
    setTVError(null);
    try {
      const data = await fetchTVForexFutures(tvSymbol);
      setTVFutures(data);
      
      if (data.length > 0) {
        toast({
          title: "Données TradingView chargées",
          description: `${data.length} contrats futures pour ${tvSymbol.name}`,
        });
      }
    } catch (err) {
      console.error('Failed to load TV futures:', err);
      setTVError('Impossible de charger les futures TradingView');
      toast({
        title: "Erreur",
        description: "Impossible de charger les données TradingView",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTVFutures(false);
    }
  }, [tvSymbol, toast]);

  useEffect(() => {
    if (dataSource === "tradingview" && tvSymbol) {
      loadTVFutures();
    }
  }, [dataSource, tvSymbol, loadTVFutures]);

  // Load Barchart futures data when symbol changes
  const loadFutures = useCallback(async () => {
    if (!symbol) return;

    setIsLoadingFutures(true);
    setError(null);
    try {
      const data = await fetchForexFutures(symbol);
      setFuturesData(data);
      
      if (data && data.data.length > 0) {
        const extractedMaturities = extractMaturitiesFromFutures(data.data);
        setMaturities(extractedMaturities);

        if (extractedMaturities.length > 0 && !selectedMaturity) {
          setSelectedMaturity(extractedMaturities[0]);
        }

        toast({
          title: "Données chargées",
          description: `${data.data.length} contrats futures pour ${symbol.name}`,
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
  }, [symbol, toast, selectedMaturity]);

  // Load options data when symbol and maturity changes
  const loadOptions = useCallback(async (maturityCode?: string) => {
    if (!symbol || !maturityCode) return;

    setIsLoadingOptions(true);
    setError(null);
    try {
      const data = await fetchForexOptions(symbol, maturityCode);
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

  // Load data when symbol changes (Barchart)
  useEffect(() => {
    if (dataSource !== "barchart" || !symbol) return;

    if (activeTab === "futures") {
      loadFutures();
    } else if (selectedMaturity) {
      loadOptions(selectedMaturity);
    }
  }, [symbol, activeTab, loadFutures, loadOptions, selectedMaturity, dataSource]);

  // Reload options when maturity changes
  const handleMaturityChange = (maturity: string) => {
    setSelectedMaturity(maturity);
    if (activeTab === "options") {
      loadOptions(maturity);
    }
  };

  const handleRefresh = () => {
    if (dataSource === "tradingview") {
      loadTVFutures();
    } else if (activeTab === "futures") {
      loadFutures();
    } else if (selectedMaturity) {
      loadOptions(selectedMaturity);
    }
  };

  const isLoading = dataSource === "tradingview" 
    ? isLoadingTVFutures 
    : (activeTab === "futures" ? isLoadingFutures : isLoadingOptions);
  
  const futures = futuresData?.data || [];

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

        {/* Data Source Toggle */}
        <Tabs value={dataSource} onValueChange={(v) => setDataSource(v as DataSource)} className="mb-6">
          <TabsList>
            <TabsTrigger value="barchart" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Barchart
            </TabsTrigger>
            <TabsTrigger value="tradingview" className="flex items-center gap-2">
              <LineChart className="w-4 h-4" />
              TradingView
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* TradingView Dashboard */}
        {dataSource === "tradingview" && (
          <div className="space-y-6">
            {/* TV Selectors */}
            <div className="flex flex-wrap items-center gap-4">
              <TVForexSymbolSelector 
                symbols={tvSymbols} 
                selected={tvSymbol} 
                onSelect={setTVSymbol}
                disabled={isLoadingTVSymbols}
              />
              
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isLoadingTVFutures || !tvSymbol}
                  className="border-border hover:border-primary/50"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingTVFutures ? "animate-spin" : ""}`} />
                  Actualiser
                </Button>
              </div>
            </div>

            {/* TV Error State */}
            {tvError && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-foreground font-medium">Erreur de chargement</p>
                  <p className="text-xs text-muted-foreground">{tvError}</p>
                </div>
              </div>
            )}

            {/* TV Content */}
            {isLoadingTVFutures ? (
              <LoadingSkeleton />
            ) : tvFutures.length > 0 ? (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {tvSymbol?.name}
                      <span className="text-primary ml-2 font-mono text-lg">({tvSymbol?.symbol})</span>
                    </h2>
                    <p className="text-muted-foreground">{tvSymbol?.exchange} • Contrats Futures TradingView</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold tabular-nums">{tvSymbol?.price}</p>
                    <p className={`text-sm ${
                      parseFloat(tvSymbol?.changePercent?.replace(/[^-\d.]/g, '') || '0') > 0 
                        ? 'text-success' 
                        : parseFloat(tvSymbol?.changePercent?.replace(/[^-\d.]/g, '') || '0') < 0 
                          ? 'text-destructive' 
                          : 'text-muted-foreground'
                    }`}>
                      {tvSymbol?.change} ({tvSymbol?.changePercent})
                    </p>
                  </div>
                </div>
                <TVForexFuturesTable contracts={tvFutures} />
              </div>
            ) : !isLoadingTVFutures && !tvError ? (
              <EmptyState />
            ) : null}
          </div>
        )}

        {/* Barchart Dashboard */}
        {dataSource === "barchart" && (
          <>
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
                {activeTab === "options" && maturities.length > 0 && (
                  <ForexMaturitySelector
                    maturities={maturities}
                    selected={selectedMaturity || maturities[0]}
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
                          {options.maturity && ` • ${options.maturity}`}
                          {options.daysToExpiration > 0 && ` • ${options.daysToExpiration}j`}
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
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-6">
          <p className="text-center text-sm text-muted-foreground">
            {dataSource === "tradingview" 
              ? "Données TradingView • Futures Devises" 
              : "Données Barchart • Forex - Majors, Minors, Exotiques"}
          </p>
        </div>
      </footer>
    </div>
  );
}
