import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Maturity } from "@/lib/commodityData";
import { Calendar } from "lucide-react";

interface MaturitySelectorProps {
  maturities: Maturity[];
  selected: Maturity | null;
  onSelect: (maturity: Maturity) => void;
}

export function MaturitySelector({ maturities, selected, onSelect }: MaturitySelectorProps) {
  return (
    <Select
      value={selected?.code || ""}
      onValueChange={(value) => {
        const maturity = maturities.find((m) => m.code === value);
        if (maturity) onSelect(maturity);
      }}
    >
      <SelectTrigger className="w-[200px] bg-card border-border hover:border-primary/50 transition-colors">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <SelectValue placeholder="Select maturity" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover border-border max-h-[300px]">
        {maturities.map((maturity) => (
          <SelectItem
            key={maturity.code}
            value={maturity.code}
            className="cursor-pointer hover:bg-secondary focus:bg-secondary"
          >
            <div className="flex items-center justify-between w-full gap-4">
              <span className="font-medium">{maturity.label}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {maturity.code}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
