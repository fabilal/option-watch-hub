import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";

import { RefreshCw, AlertCircle, DollarSign, BarChart3, TrendingUp, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  fetchTVForexOptions,
  fetchTVForexOptionsByStrike,
  fetchTVForexOptionsMaturities,
  fetchTVForexStrikes,
  type TVForexSymbol,
  type TVForexFutures,
  type TVForexOptionsChain,
  type TVForexOptionsByStrike,
} from "@/lib/tvForexApi";
import { ForexCategorySelector } from "@/components/forex/ForexCategorySelector";
import { ForexSymbolSelector } from "@/components/forex/ForexSymbolSelector";
import { ForexMaturitySelector } from "@/components/forex/ForexMaturitySelector";
import { ForexFuturesTable } from "@/components/forex/ForexFuturesTable";
import { ForexOptionsTable } from "@/components/forex/ForexOptionsTable";
import { ForexOptionsStats } from "@/components/forex/ForexOptionsStats";
import { TVForexSymbolSelector } from "@/components/forex/TVForexSymbolSelector";
import { TVForexFuturesTable } from "@/components/forex/TVForexFuturesTable";
import { TVForexOptionsTable } from "@/components/forex/TVForexOptionsTable";
import { TVForexMaturitySelector } from "@/components/forex/TVForexMaturitySelector";

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
  const [tvOptions, setTVOptions] = useState<TVForexOptionsChain | null>(null);
  const [tvOptionsByStrike, setTVOptionsByStrike] = useState<TVForexOptionsByStrike | null>(null);
  const [tvMaturities, setTVMaturities] = useState<string[]>([]);
  const [tvSelectedMaturity, setTVSelectedMaturity] = useState<string | null>(null);
  const [tvStrike, setTVStrike] = useState<string>("");
  const [tvAvailableStrikes, setTVAvailableStrikes] = useState<number[]>([]);
  const [isLoadingTVStrikes, setIsLoadingTVStrikes] = useState(false);
  const [tvViewMode, setTVViewMode] = useState<"strike" | "maturity">("strike"); // Default to strike
  const [isLoadingTVSymbols, setIsLoadingTVSymbols] = useState(false);
  const [isLoadingTVFutures, setIsLoadingTVFutures] = useState(false);
  const [isLoadingTVOptions, setIsLoadingTVOptions] = useState(false);
  const [isLoadingTVMaturities, setIsLoadingTVMaturities] = useState(false);
  const [tvActiveTab, setTVActiveTab] = useState<"futures" | "options">("futures");
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
      } else {
        setTVError('Aucune donnée futures disponible pour ce symbole');
        toast({
          title: "Aucune donnée",
          description: `Aucun contrat future trouvé pour ${tvSymbol.name}`,
          variant: "destructive",
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

  // Load TradingView options maturities
  const loadTVMaturities = useCallback(async () => {
    if (!tvSymbol) return;

    setIsLoadingTVMaturities(true);
    try {
      const mats = await fetchTVForexOptionsMaturities(tvSymbol);
      setTVMaturities(mats);
      
      // Auto-select first maturity if available
      if (mats.length > 0 && !tvSelectedMaturity) {
        setTVSelectedMaturity(mats[0]);
      }
      
      console.log(`Loaded ${mats.length} TV maturities`);
    } catch (err) {
      console.error('Failed to load TV maturities:', err);
    } finally {
      setIsLoadingTVMaturities(false);
    }
  }, [tvSymbol, tvSelectedMaturity]);

  // Load TradingView options by strike (NEW - default mode)
  const loadTVOptionsByStrike = useCallback(async (strike: number) => {
    if (!tvSymbol) return;

    setIsLoadingTVOptions(true);
    setTVError(null);
    try {
      const data = await fetchTVForexOptionsByStrike(tvSymbol, strike);
      setTVOptionsByStrike(data);
      
      if (data && data.maturities.length > 0) {
        toast({
          title: "Options TradingView chargées",
          description: `${data.maturities.length} maturités pour le strike ${strike} de ${tvSymbol.name}`,
        });
      } else {
        setTVError('Aucune donnée trouvée pour ce strike.');
      }
    } catch (err) {
      console.error('Failed to load TV options by strike:', err);
      setTVError('Impossible de charger les options TradingView');
      toast({
        title: "Erreur",
        description: "Impossible de charger les options TradingView",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTVOptions(false);
    }
  }, [tvSymbol, toast]);

  // Load TradingView options when symbol or maturity changes (OLD mode)
  const loadTVOptions = useCallback(async (maturity?: string) => {
    if (!tvSymbol) return;

    setIsLoadingTVOptions(true);
    setTVError(null);
    try {
      const data = await fetchTVForexOptions(tvSymbol, maturity);
      setTVOptions(data);
      
      if (data && (data.calls.length > 0 || data.puts.length > 0)) {
        toast({
          title: "Options TradingView chargées",
          description: `${data.calls.length} calls et ${data.puts.length} puts pour ${tvSymbol.name}${maturity ? ` (${maturity})` : ''}`,
        });
      }
    } catch (err) {
      console.error('Failed to load TV options:', err);
      setTVError('Impossible de charger les options TradingView');
      toast({
        title: "Erreur",
        description: "Impossible de charger les options TradingView",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTVOptions(false);
    }
  }, [tvSymbol, toast]);

  // Load available strikes from DB when TV symbol changes
  useEffect(() => {
    if (dataSource === "tradingview" && tvSymbol && tvActiveTab === "options" && tvViewMode === "strike") {
      const loadStrikes = async () => {
        setIsLoadingTVStrikes(true);
        try {
          const strikes = await fetchTVForexStrikes(tvSymbol.exchange, tvSymbol.symbol);
          setTVAvailableStrikes(strikes);
          console.log(`Loaded ${strikes.length} strikes from DB for ${tvSymbol.exchange}-${tvSymbol.symbol}`);
        } catch (err) {
          console.error('Failed to load strikes:', err);
          setTVAvailableStrikes([]);
        } finally {
          setIsLoadingTVStrikes(false);
        }
      };

      loadStrikes();
    }
  }, [dataSource, tvSymbol, tvActiveTab, tvViewMode]);

  // Load data when TV symbol or tab changes
  useEffect(() => {
    if (dataSource === "tradingview" && tvSymbol) {
      if (tvActiveTab === "futures") {
        loadTVFutures();
      } else {
        // Options tab: only auto-load for maturity mode
        // Strike mode requires manual trigger (button or Enter key)
        if (tvViewMode === "maturity") {
          // Load maturities first, then options
          loadTVMaturities();
          loadTVOptions(tvSelectedMaturity || undefined);
        }
        // For strike mode, don't auto-load - user must click button or press Enter
      }
    }
  }, [dataSource, tvSymbol, tvActiveTab, tvViewMode, tvSelectedMaturity, loadTVFutures, loadTVMaturities, loadTVOptions]);

  // Handle TV maturity change
  const handleTVMaturityChange = (maturity: string) => {
    setTVSelectedMaturity(maturity);
    loadTVOptions(maturity);
  };

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

  // Load options data when futures contract is selected
  const loadOptions = useCallback(async (futuresContract: string) => {
    if (!futuresContract) return;

    setIsLoadingOptions(true);
    setError(null);
    try {
      const data = await fetchForexOptions(futuresContract);
      setOptions(data);

      if (data && (data.calls.length > 0 || data.puts.length > 0)) {
        toast({
          title: "Options chargées",
          description: `${data.calls.length} calls et ${data.puts.length} puts pour ${futuresContract}`,
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
  }, [toast]);

  const futures = futuresData?.data || [];

  // Load data when symbol changes (Barchart)
  useEffect(() => {
    if (dataSource !== "barchart" || !symbol) return;

    if (activeTab === "futures") {
      loadFutures();
    } else if (selectedMaturity && futures.length > 0) {
      // Build full futures contract from symbol + maturity (e.g., E6 + H26 = E6H26)
      const futuresContract = `${symbol.symbol}${selectedMaturity}`;
      loadOptions(futuresContract);
    }
  }, [symbol, activeTab, loadFutures, loadOptions, selectedMaturity, dataSource, futures.length]);

  // Reload options when maturity changes
  const handleMaturityChange = (maturity: string) => {
    setSelectedMaturity(maturity);
    if (activeTab === "options" && symbol) {
      const futuresContract = `${symbol.symbol}${maturity}`;
      loadOptions(futuresContract);
    }
  };

  const handleRefresh = () => {
    if (dataSource === "tradingview") {
      if (tvActiveTab === "futures") {
        loadTVFutures();
      } else {
        loadTVMaturities();
        loadTVOptions(tvSelectedMaturity || undefined);
      }
    } else if (activeTab === "futures") {
      loadFutures();
    } else if (selectedMaturity && symbol) {
      const futuresContract = `${symbol.symbol}${selectedMaturity}`;
      loadOptions(futuresContract);
    }
  };

  const isLoading = dataSource === "tradingview" 
    ? (tvActiveTab === "futures" ? isLoadingTVFutures : isLoadingTVOptions)
    : (activeTab === "futures" ? isLoadingFutures : isLoadingOptions);

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
                onSelect={(s) => {
                  setTVSymbol(s);
                  setTVSelectedMaturity(null);
                  setTVMaturities([]);
                }}
                disabled={isLoadingTVSymbols}
              />
              
              {/* Show strike/maturity controls for options tab */}
              {tvActiveTab === "options" && (
                <div className="flex items-center gap-4">
                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Mode:</Label>
                    <RadioGroup
                      value={tvViewMode}
                      onValueChange={(v) => {
                        setTVViewMode(v as "strike" | "maturity");
                        setTVOptionsByStrike(null);
                        setTVOptions(null);
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
                  {tvViewMode === "strike" && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="strike-select" className="text-sm text-muted-foreground">Strike:</Label>
                      {/* Dropdown list of available strikes */}
                      {tvAvailableStrikes.length > 0 && (
                        <Select
                          value={tvStrike}
                          onValueChange={(value) => {
                            setTVStrike(value);
                            if (value && tvSymbol) {
                              const strikeNum = parseFloat(value);
                              if (!isNaN(strikeNum)) {
                                loadTVOptionsByStrike(strikeNum);
                              }
                            }
                          }}
                          disabled={isLoadingTVOptions || isLoadingTVStrikes || !tvSymbol}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Choisir un strike" />
                          </SelectTrigger>
                          <SelectContent>
                            {tvAvailableStrikes.map((s) => (
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
                        placeholder={tvAvailableStrikes.length > 0 ? "Ou saisir manuellement" : "Ex: 1.05"}
                        value={tvStrike}
                        onChange={(e) => setTVStrike(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && tvStrike && tvSymbol) {
                            const strikeNum = parseFloat(tvStrike);
                            if (!isNaN(strikeNum)) {
                              loadTVOptionsByStrike(strikeNum);
                            }
                          }
                        }}
                        className="w-32"
                        disabled={isLoadingTVOptions || !tvSymbol}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (tvStrike && tvSymbol) {
                            const strikeNum = parseFloat(tvStrike);
                            if (!isNaN(strikeNum)) {
                              loadTVOptionsByStrike(strikeNum);
                            }
                          }
                        }}
                        disabled={isLoadingTVOptions || !tvSymbol || !tvStrike}
                      >
                        Charger
                      </Button>
                    </div>
                  )}

                  {/* Maturity Selector (for maturity mode) */}
                  {tvViewMode === "maturity" && (
                    <TVForexMaturitySelector
                      maturities={tvMaturities}
                      selected={tvSelectedMaturity}
                      onSelect={handleTVMaturityChange}
                      disabled={isLoadingTVOptions}
                      isLoading={isLoadingTVMaturities}
                    />
                  )}
                </div>
              )}
              
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isLoading || !tvSymbol}
                  className="border-border hover:border-primary/50"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Actualiser
                </Button>
              </div>
            </div>

            {/* TV Tabs */}
            <Tabs value={tvActiveTab} onValueChange={(v) => setTVActiveTab(v as "futures" | "options")}>
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

              <TabsContent value="futures">
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
              </TabsContent>

              <TabsContent value="options">
                {isLoadingTVOptions ? (
                  <LoadingSkeleton />
                ) : tvViewMode === "strike" && tvOptionsByStrike && tvOptionsByStrike.maturities.length > 0 ? (
                  <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold text-foreground">
                          {tvSymbol?.name}
                          <span className="text-primary ml-2 font-mono text-lg">({tvSymbol?.symbol})</span>
                        </h2>
                        <p className="text-muted-foreground">
                          {tvSymbol?.exchange} • Options Chain TradingView • Strike: {tvOptionsByStrike.strike}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold tabular-nums">{tvOptionsByStrike.underlyingPrice || tvSymbol?.price}</p>
                        <p className="text-sm text-muted-foreground">
                          {tvOptionsByStrike.maturities.length} maturités
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
                            {tvOptionsByStrike.maturities.map((maturity, idx) => (
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
                ) : tvViewMode === "maturity" && tvOptions && (tvOptions.calls.length > 0 || tvOptions.puts.length > 0) ? (
                  <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold text-foreground">
                          {tvSymbol?.name}
                          <span className="text-primary ml-2 font-mono text-lg">({tvSymbol?.symbol})</span>
                        </h2>
                        <p className="text-muted-foreground">
                          {tvSymbol?.exchange} • Options Chain TradingView
                          {tvSelectedMaturity && ` • Exp: ${tvSelectedMaturity}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold tabular-nums">{tvOptions.underlyingPrice || tvSymbol?.price}</p>
                        <p className="text-sm text-muted-foreground">
                          {tvOptions.calls.length} calls • {tvOptions.puts.length} puts
                        </p>
                      </div>
                    </div>
                    <TVForexOptionsTable calls={tvOptions.calls} puts={tvOptions.puts} />
                  </div>
                ) : !isLoadingTVOptions && !tvError ? (
                  <EmptyState />
                ) : null}
              </TabsContent>
            </Tabs>
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
                          {options.futuresContract && ` • ${options.futuresContract}`}
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
