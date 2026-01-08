import { Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TVForexMaturitySelectorProps {
  maturities: string[];
  selected: string | null;
  onSelect: (maturity: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function TVForexMaturitySelector({
  maturities,
  selected,
  onSelect,
  disabled = false,
  isLoading = false,
}: TVForexMaturitySelectorProps) {
  if (maturities.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <Select
        value={selected || undefined}
        onValueChange={onSelect}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="w-[200px] border-border hover:border-primary/50">
          <SelectValue placeholder={isLoading ? "Chargement..." : "Sélectionner maturité"} />
        </SelectTrigger>
        <SelectContent>
          {maturities.map((maturity) => (
            <SelectItem key={maturity} value={maturity}>
              <span className="font-mono text-sm">{maturity}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
