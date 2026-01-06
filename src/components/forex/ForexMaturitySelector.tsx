import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";

interface ForexMaturitySelectorProps {
  maturities: string[];
  selected: string;
  onSelect: (maturity: string) => void;
  disabled?: boolean;
}

export function ForexMaturitySelector({ maturities, selected, onSelect, disabled }: ForexMaturitySelectorProps) {
  return (
    <Select
      value={selected}
      onValueChange={onSelect}
      disabled={disabled || maturities.length === 0}
    >
      <SelectTrigger className="w-[180px] bg-card border-border">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <SelectValue placeholder="Maturité" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {maturities.map((mat) => (
          <SelectItem key={mat} value={mat}>
            {mat}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
