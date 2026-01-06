import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ForexSymbol } from "@/lib/forexApi";

interface ForexSymbolSelectorProps {
  symbols: ForexSymbol[];
  selected: ForexSymbol | null;
  onSelect: (symbol: ForexSymbol) => void;
  disabled?: boolean;
}

export function ForexSymbolSelector({ symbols, selected, onSelect, disabled }: ForexSymbolSelectorProps) {
  return (
    <Select
      value={selected?.symbol}
      onValueChange={(value) => {
        const sym = symbols.find((s) => s.symbol === value);
        if (sym) onSelect(sym);
      }}
      disabled={disabled || symbols.length === 0}
    >
      <SelectTrigger className="w-[280px] bg-card border-border">
        <SelectValue placeholder="Sélectionner un symbole" />
      </SelectTrigger>
      <SelectContent>
        {symbols.map((sym) => (
          <SelectItem key={sym.symbol} value={sym.symbol}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-primary">{sym.symbol}</span>
              <span className="text-muted-foreground">•</span>
              <span>{sym.name}</span>
              <span className="text-xs text-muted-foreground">({sym.exchange})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
