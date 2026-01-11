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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  fetchTVSymbols,
  fetchTVFutures,
  fetchTVOptions,
  fetchTVOptionsByStrike,
  fetchTVStrikes,
  type TVCategory,
  type TVSymbol,
  type TVFuturesContract,
  type TVOptionsChain,
  type TVOptionsByStrike,
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
  const [optionsByStrike, setOptionsByStrike] = useState<TVOptionsByStrike | null>(null);
  const [selectedMaturity, setSelectedMaturity] = useState<string | null>(null);
  const [strike, setStrike] = useState<string>("");
  const [availableStrikes, setAvailableStrikes] = useState<number[]>([]);
  const [isLoadingStrikes, setIsLoadingStrikes] = useState(false);
  const [viewMode, setViewMode] = useState<"strike" | "maturity">("strike"); // Default to strike
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

  // Load options by strike (NEW - default mode)
  const loadOptionsByStrike = useCallback(async (strikeValue: number) => {
    if (!symbol) return;

    setIsLoadingOptions(true);
    setError(null);
    try {
      const data = await fetchTVOptionsByStrike(symbol, strikeValue);
      setOptionsByStrike(data);
      
      if (data && data.maturities.length > 0) {
        toast({
          title: "Options chargées",
          description: `${data.maturities.length} maturités pour le strike ${strikeValue}`,
        });
      } else {
        setError('Aucune donnée trouvée pour ce strike.');
      }
    } catch (err) {
      console.error('Failed to load options by strike:', err);
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

  // Load options data when symbol changes (OLD mode)
  const loadOptions = useCallback(async (maturity?: string) => {
    if (!symbol) return;

    setIsLoadingOptions(true);
    setError(null);
    try {
      const data = await fetchTVOptions(symbol, maturity);
      setOptions(data);

      // Ensure selected maturity stays valid for the current symbol
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

  // Load available strikes from DB when symbol changes
  useEffect(() => {
    if (!symbol || activeTab !== "options" || viewMode !== "strike") return;

    const loadStrikes = async () => {
      setIsLoadingStrikes(true);
      try {
        const strikes = await fetchTVStrikes(symbol.exchange, symbol.symbol);
        setAvailableStrikes(strikes);
        console.log(`Loaded ${strikes.length} strikes from DB for ${symbol.exchange}-${symbol.symbol}`);
      } catch (err) {
        console.error('Failed to load strikes:', err);
        setAvailableStrikes([]);
      } finally {
        setIsLoadingStrikes(false);
      }
    };

    loadStrikes();
  }, [symbol, activeTab, viewMode]);

  // Load data when symbol changes
  useEffect(() => {
    if (!symbol) return;

    if (activeTab === "futures") {
      loadFutures();
    } else {
      // Options tab: only auto-load for maturity mode
      // Strike mode requires manual trigger (button or Enter key)
      if (viewMode === "maturity") {
        loadOptions(selectedMaturity || undefined);
      }
      // For strike mode, don't auto-load - user must click button or press Enter
    }
  }, [symbol, activeTab, viewMode, selectedMaturity, loadFutures, loadOptions]);

  // Reload options when maturity changes
  const handleMaturityChange = (maturity: string) => {
    setSelectedMaturity(maturity);
    loadOptions(maturity);
  };

  const handleRefresh = () => {
    if (activeTab === "futures") {
      loadFutures();
    } else {
      if (viewMode === "strike" && strike) {
        const strikeNum = parseFloat(strike);
        if (!isNaN(strikeNum)) {
          loadOptionsByStrike(strikeNum);
        }
      } else if (viewMode === "maturity") {
        loadOptions(selectedMaturity || undefined);
      }
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
            
            {/* Show strike/maturity controls for options tab */}
            {activeTab === "options" && (
              <div className="flex items-center gap-4">
                {/* View Mode Toggle */}
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">Mode:</Label>
                  <RadioGroup
                    value={viewMode}
                    onValueChange={(v) => {
                      setViewMode(v as "strike" | "maturity");
                      setOptionsByStrike(null);
                      setOptions(null);
                    }}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="strike" id="strike-mode" />
                      <Label htmlFor="strike-mode" className="text-sm cursor-pointer">Par Strike</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="maturity" id="maturity-mode" />
                      <Label htmlFor="maturity-mode" className="text-sm cursor-pointer">Par Maturité</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Strike Input (for strike mode) */}
                {viewMode === "strike" && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="strike-select" className="text-sm text-muted-foreground">Strike:</Label>
                    {/* Dropdown list of available strikes */}
                    {availableStrikes.length > 0 && (
                      <Select
                        value={strike}
                        onValueChange={(value) => {
                          setStrike(value);
                          if (value && symbol) {
                            const strikeNum = parseFloat(value);
                            if (!isNaN(strikeNum)) {
                              loadOptionsByStrike(strikeNum);
                            }
                          }
                        }}
                        disabled={isLoadingOptions || isLoadingStrikes || !symbol}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="Choisir un strike" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableStrikes.map((s) => (
                            <SelectItem key={s} value={s.toString()}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {/* Manual input (always available) */}
                    <Input
                      id="strike-input"
                      type="number"
                      step="0.01"
                      placeholder={availableStrikes.length > 0 ? "Ou saisir manuellement" : "Ex: 59.5"}
                      value={strike}
                      onChange={(e) => setStrike(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && strike && symbol) {
                          const strikeNum = parseFloat(strike);
                          if (!isNaN(strikeNum)) {
                            loadOptionsByStrike(strikeNum);
                          }
                        }
                      }}
                      className="w-32"
                      disabled={isLoadingOptions || !symbol}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (strike && symbol) {
                          const strikeNum = parseFloat(strike);
                          if (!isNaN(strikeNum)) {
                            loadOptionsByStrike(strikeNum);
                          }
                        }
                      }}
                      disabled={isLoadingOptions || !symbol || !strike}
                    >
                      Charger
                    </Button>
                  </div>
                )}

                {/* Maturity Selector (for maturity mode) */}
                {viewMode === "maturity" && options && options.maturities.length > 0 && (
                  <TVMaturitySelector
                    maturities={options.maturities}
                    selected={selectedMaturity || options.maturities[0]}
                    onSelect={handleMaturityChange}
                    disabled={isLoadingOptions}
                  />
                )}
              </div>
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
            ) : viewMode === "strike" && optionsByStrike && optionsByStrike.maturities.length > 0 ? (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {symbol?.name}
                      <span className="text-primary ml-2 font-mono text-lg">({symbol?.symbol})</span>
                    </h2>
                    <p className="text-muted-foreground">
                      {symbol?.exchange} • Chaîne d'Options TradingView • Strike: {optionsByStrike.strike}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold tabular-nums">{optionsByStrike.underlyingPrice || symbol?.symbol}</p>
                    <p className="text-sm text-muted-foreground">
                      {optionsByStrike.maturities.length} maturités
                    </p>
                  </div>
                </div>
                {/* Options by Strike Table */}
                <div className="rounded-lg border border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Maturité</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Call Last</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Call Bid/Ask</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Call IV</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Call Delta</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Call Volume</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Put Last</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Put Bid/Ask</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Put IV</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Put Delta</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">Put Volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        {optionsByStrike.maturities.map((maturity, idx) => (
                          <tr key={idx} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-mono text-foreground">
                              <div>{maturity.maturityCode}</div>
                              <div className="text-xs text-muted-foreground">{maturity.maturity}</div>
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-foreground">
                              {maturity.call?.last || '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-muted-foreground">
                              {maturity.call ? `${maturity.call.bid}/${maturity.call.ask}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-foreground">
                              {maturity.call?.iv ? `${maturity.call.iv.toFixed(2)}%` : '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-foreground">
                              {maturity.call?.delta || '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-foreground">
                              {maturity.call?.volume || '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-foreground">
                              {maturity.put?.last || '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-muted-foreground">
                              {maturity.put ? `${maturity.put.bid}/${maturity.put.ask}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-foreground">
                              {maturity.put?.iv ? `${maturity.put.iv.toFixed(2)}%` : '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-foreground">
                              {maturity.put?.delta || '-'}
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-mono text-foreground">
                              {maturity.put?.volume || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : viewMode === "maturity" && options && (options.calls.length > 0 || options.puts.length > 0) ? (
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
