import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

import { Download, RefreshCw, AlertCircle, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  COMMODITY_SYMBOLS,
  COMMODITY_CATEGORIES,
  generateMaturities,
  type CommodityCategory,
  type CommoditySymbol,
  type Maturity,
  type OptionsChain,
} from "@/lib/commodityData";
import { fetchOptionsData } from "@/lib/barchartApi";
import { useToast } from "@/hooks/use-toast";

interface OptionsDataEntry {
  category: CommodityCategory;
  symbol: CommoditySymbol;
  maturity: Maturity;
  data: OptionsChain | null;
  status: 'pending' | 'loading' | 'success' | 'error';
  error?: string;
}

export default function Index() {
  const { toast } = useToast();

  const [isScrapingAll, setIsScrapingAll] = useState(false);
  const [allOptionsData, setAllOptionsData] = useState<OptionsDataEntry[]>([]);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  // Filter states for viewing scraped data
  const [filterCategory, setFilterCategory] = useState<CommodityCategory | 'all'>('all');
  const [filterSymbol, setFilterSymbol] = useState<string | 'all'>('all');
  const [filterMaturity, setFilterMaturity] = useState<string | 'all'>('all');
  const [optionType, setOptionType] = useState<"calls" | "puts" | "all">("all");

  // Selected entry for detailed view
  const [selectedEntry, setSelectedEntry] = useState<OptionsDataEntry | null>(null);

  const maturities = useMemo(() => generateMaturities().slice(0, 6), []); // Limit to 6 maturities for reasonable load

  const allSymbols = useMemo(() => {
    const symbols: { category: CommodityCategory; symbol: CommoditySymbol }[] = [];
    (Object.keys(COMMODITY_SYMBOLS) as CommodityCategory[]).forEach(cat => {
      COMMODITY_SYMBOLS[cat].forEach(sym => {
        symbols.push({ category: cat, symbol: sym });
      });
    });
    return symbols;
  }, []);

  const startScrapeAll = useCallback(async () => {
    setIsScrapingAll(true);
    setCurrentProgress(0);
    
    // Build all combinations
    const entries: OptionsDataEntry[] = [];
    allSymbols.forEach(({ category, symbol }) => {
      maturities.forEach(mat => {
        entries.push({
          category,
          symbol,
          maturity: mat,
          data: null,
          status: 'pending',
        });
      });
    });

    setTotalItems(entries.length);
    setAllOptionsData(entries);

    // Process in batches to avoid overwhelming the API
    const batchSize = 2;
    const delayBetweenBatches = 3000; // 3 seconds between batches
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      // Update status to loading
      setAllOptionsData(prev => {
        const updated = [...prev];
        batch.forEach((_, idx) => {
          if (updated[i + idx]) {
            updated[i + idx] = { ...updated[i + idx], status: 'loading' };
          }
        });
        return updated;
      });

      // Fetch batch in parallel
      const results = await Promise.allSettled(
        batch.map(async entry => {
          try {
            const data = await fetchOptionsData(entry.symbol, entry.maturity);
            return { entry, data, error: null };
          } catch (err) {
            return { entry, data: null, error: err instanceof Error ? err.message : 'Unknown error' };
          }
        })
      );

      // Update with results
      setAllOptionsData(prev => {
        const updated = [...prev];
        results.forEach((result, idx) => {
          const entryIdx = i + idx;
          if (updated[entryIdx]) {
            if (result.status === 'fulfilled') {
              const { data, error } = result.value;
              updated[entryIdx] = {
                ...updated[entryIdx],
                data,
                status: error ? 'error' : 'success',
                error: error || undefined,
              };
            } else {
              updated[entryIdx] = {
                ...updated[entryIdx],
                status: 'error',
                error: 'Request failed',
              };
            }
          }
        });
        return updated;
      });

      setCurrentProgress(Math.min(i + batchSize, entries.length));

      // Delay before next batch (except for last batch)
      if (i + batchSize < entries.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    setIsScrapingAll(false);
    toast({
      title: "Scraping terminé",
      description: `${entries.length} combinaisons traitées`,
    });
  }, [allSymbols, maturities, toast]);

  const handleDownloadAll = () => {
    const successfulData = allOptionsData.filter(e => e.status === 'success' && e.data);
    if (successfulData.length === 0) return;

    const headers = ["Category", "Symbol", "Name", "Maturity", "Strike", "Type", "Latest", "IV", "Delta", "Gamma", "Theta", "Vega", "IV Skew", "Last Trade"];
    const rows: string[][] = [];

    successfulData.forEach(entry => {
      if (!entry.data) return;
      [...entry.data.calls, ...entry.data.puts].forEach(opt => {
        rows.push([
          entry.category,
          entry.symbol.baseSymbol,
          entry.symbol.name,
          entry.maturity.label,
          opt.strike.toString(),
          opt.type,
          opt.latest,
          opt.iv.toString(),
          opt.delta.toString(),
          opt.gamma.toString(),
          opt.theta.toString(),
          opt.vega.toString(),
          opt.ivSkew.toString(),
          opt.lastTrade,
        ]);
      });
    });

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all_options_data_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Téléchargé",
      description: `${rows.length} lignes exportées en CSV`,
    });
  };

  // Filtered data for display
  const filteredData = useMemo(() => {
    return allOptionsData.filter(entry => {
      if (filterCategory !== 'all' && entry.category !== filterCategory) return false;
      if (filterSymbol !== 'all' && entry.symbol.baseSymbol !== filterSymbol) return false;
      if (filterMaturity !== 'all' && entry.maturity.code !== filterMaturity) return false;
      return true;
    });
  }, [allOptionsData, filterCategory, filterSymbol, filterMaturity]);

  // Stats
  const stats = useMemo(() => {
    const success = allOptionsData.filter(e => e.status === 'success').length;
    const error = allOptionsData.filter(e => e.status === 'error').length;
    const pending = allOptionsData.filter(e => e.status === 'pending' || e.status === 'loading').length;
    const totalCalls = allOptionsData.reduce((sum, e) => sum + (e.data?.calls.length || 0), 0);
    const totalPuts = allOptionsData.reduce((sum, e) => sum + (e.data?.puts.length || 0), 0);
    return { success, error, pending, totalCalls, totalPuts };
  }, [allOptionsData]);

  // Get unique symbols for filter
  const uniqueSymbols = useMemo(() => {
    const symbols = new Set<string>();
    allOptionsData.forEach(e => symbols.add(e.symbol.baseSymbol));
    return Array.from(symbols).sort();
  }, [allOptionsData]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-8">
        {/* Title & Controls */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Options Data - Toutes les Commodités
          </h1>
          <p className="text-muted-foreground mb-6">
            Scraping complet de toutes les options: {allSymbols.length} symboles × {maturities.length} maturités = {allSymbols.length * maturities.length} combinaisons
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={startScrapeAll}
              disabled={isScrapingAll}
              size="lg"
              className="bg-primary hover:bg-primary/90"
            >
              {isScrapingAll ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Scraping en cours...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Démarrer le Scraping Complet
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={handleDownloadAll}
              disabled={stats.success === 0}
            >
              <Download className="w-5 h-5 mr-2" />
              Télécharger Tout (CSV)
            </Button>
          </div>
        </div>

        {/* Progress */}
        {(isScrapingAll || totalItems > 0) && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Progression du Scraping</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Progress value={(currentProgress / Math.max(totalItems, 1)) * 100} />
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Succès: {stats.success}
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="w-4 h-4 text-destructive" />
                    Erreurs: {stats.error}
                  </span>
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-4 h-4 text-muted-foreground" />
                    En attente: {stats.pending}
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span>Total Calls: {stats.totalCalls}</span>
                  <span>Total Puts: {stats.totalPuts}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        {allOptionsData.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Filtres</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Catégorie</label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value as CommodityCategory | 'all')}
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="all">Toutes</option>
                    {(Object.keys(COMMODITY_CATEGORIES) as CommodityCategory[]).map(cat => (
                      <option key={cat} value={cat}>
                        {COMMODITY_CATEGORIES[cat].icon} {COMMODITY_CATEGORIES[cat].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Symbole</label>
                  <select
                    value={filterSymbol}
                    onChange={(e) => setFilterSymbol(e.target.value)}
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="all">Tous</option>
                    {uniqueSymbols.map(sym => (
                      <option key={sym} value={sym}>{sym}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Maturité</label>
                  <select
                    value={filterMaturity}
                    onChange={(e) => setFilterMaturity(e.target.value)}
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="all">Toutes</option>
                    {maturities.map(mat => (
                      <option key={mat.code} value={mat.code}>{mat.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Grid */}
        {allOptionsData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: List of entries */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  Données ({filteredData.length} résultats)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <div className="divide-y divide-border">
                    {filteredData.map((entry, idx) => (
                      <button
                        key={`${entry.symbol.baseSymbol}-${entry.maturity.code}-${idx}`}
                        onClick={() => setSelectedEntry(entry)}
                        className={`w-full p-3 text-left hover:bg-accent/50 transition-colors ${
                          selectedEntry === entry ? 'bg-accent' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium text-foreground">
                                {entry.symbol.baseSymbol}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {entry.maturity.label}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {COMMODITY_CATEGORIES[entry.category].icon} {entry.category}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {entry.symbol.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {entry.status === 'loading' && (
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            )}
                            {entry.status === 'success' && (
                              <div className="text-right">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                <span className="text-xs text-muted-foreground block">
                                  {entry.data?.calls.length || 0}C / {entry.data?.puts.length || 0}P
                                </span>
                              </div>
                            )}
                            {entry.status === 'error' && (
                              <XCircle className="w-4 h-4 text-destructive" />
                            )}
                            {entry.status === 'pending' && (
                              <span className="text-xs text-muted-foreground">En attente</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Right: Selected entry details */}
            <div className="space-y-4">
              {selectedEntry?.status === 'success' && selectedEntry.data ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {selectedEntry.data.name}
                        <span className="text-primary ml-2 font-mono text-lg">
                          ({selectedEntry.data.symbol})
                        </span>
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        {selectedEntry.maturity.label} • IV: {selectedEntry.data.impliedVolatility}%
                      </p>
                    </CardHeader>
                    <CardContent>
                      <StatsCards data={selectedEntry.data} />
                    </CardContent>
                  </Card>

                  {selectedEntry.data.calls.length > 0 && (
                    <IVSmileChart 
                      calls={selectedEntry.data.calls} 
                      puts={selectedEntry.data.puts} 
                    />
                  )}

                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Chaîne d'Options</CardTitle>
                        <TypeToggle selected={optionType} onSelect={setOptionType} />
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[400px]">
                        <OptionsTable
                          calls={selectedEntry.data.calls}
                          puts={selectedEntry.data.puts}
                          showType={optionType}
                        />
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </>
              ) : selectedEntry?.status === 'error' ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 text-destructive">
                      <AlertCircle className="w-5 h-5" />
                      <div>
                        <p className="font-medium">Erreur</p>
                        <p className="text-sm text-muted-foreground">{selectedEntry.error}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : selectedEntry?.status === 'loading' ? (
                <LoadingSkeleton />
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-muted-foreground text-center">
                      Sélectionnez un élément pour voir les détails
                    </p>
                  </CardContent>
                </Card>
              )}
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
            Données extraites de Barchart.com • Volatilité implicite et Greeks pour les options sur commodités
          </p>
        </div>
      </footer>
    </div>
  );
}
