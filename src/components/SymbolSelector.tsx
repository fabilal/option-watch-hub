import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type CommoditySymbol } from "@/lib/commodityData";

interface SymbolSelectorProps {
  symbols: CommoditySymbol[];
  selected: CommoditySymbol | null;
  onSelect: (symbol: CommoditySymbol) => void;
}

export function SymbolSelector({ symbols, selected, onSelect }: SymbolSelectorProps) {
  return (
    <Select
      value={selected?.baseSymbol || ""}
      onValueChange={(value) => {
        const symbol = symbols.find((s) => s.baseSymbol === value);
        if (symbol) onSelect(symbol);
      }}
    >
      <SelectTrigger className="w-[280px] bg-card border-border hover:border-primary/50 transition-colors">
        <SelectValue placeholder="Select commodity" />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {symbols.map((symbol) => (
          <SelectItem
            key={symbol.baseSymbol}
            value={symbol.baseSymbol}
            className="cursor-pointer hover:bg-secondary focus:bg-secondary"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-primary font-semibold">
                {symbol.baseSymbol}
              </span>
              <span className="text-muted-foreground">|</span>
              <span>{symbol.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {symbol.exchange}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
