import { ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type TVForexSymbol } from "@/lib/tvForexApi";

interface TVForexSymbolSelectorProps {
  symbols: TVForexSymbol[];
  selected: TVForexSymbol | null;
  onSelect: (symbol: TVForexSymbol) => void;
  disabled?: boolean;
}

export function TVForexSymbolSelector({
  symbols,
  selected,
  onSelect,
  disabled,
}: TVForexSymbolSelectorProps) {
  const handleChange = (value: string) => {
    const symbol = symbols.find((s) => s.symbol === value);
    if (symbol) {
      onSelect(symbol);
    }
  };

  const getChangeIcon = (change: string) => {
    const numChange = parseFloat(change.replace(/[^-\d.]/g, ''));
    if (numChange > 0) return <TrendingUp className="w-3 h-3 text-success" />;
    if (numChange < 0) return <TrendingDown className="w-3 h-3 text-destructive" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  return (
    <Select
      value={selected?.symbol || ""}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-[320px] bg-card border-border hover:border-primary/50 transition-colors">
        <SelectValue placeholder="Sélectionner un symbole" />
      </SelectTrigger>
      <SelectContent className="max-h-[400px]">
        {symbols.map((symbol) => (
          <SelectItem 
            key={symbol.symbol} 
            value={symbol.symbol}
            className="hover:bg-muted/50"
          >
            <div className="flex items-center justify-between w-full gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-primary font-semibold text-sm">
                  {symbol.symbol}
                </span>
                <span className="text-muted-foreground text-xs truncate max-w-[160px]">
                  {symbol.name}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                {getChangeIcon(symbol.changePercent)}
                <span className={
                  parseFloat(symbol.changePercent.replace(/[^-\d.]/g, '')) > 0 
                    ? 'text-success' 
                    : parseFloat(symbol.changePercent.replace(/[^-\d.]/g, '')) < 0 
                      ? 'text-destructive' 
                      : 'text-muted-foreground'
                }>
                  {symbol.changePercent}
                </span>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
