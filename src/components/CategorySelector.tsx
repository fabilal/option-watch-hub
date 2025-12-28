import { cn } from "@/lib/utils";
import { COMMODITY_CATEGORIES, type CommodityCategory } from "@/lib/commodityData";

interface CategorySelectorProps {
  selected: CommodityCategory;
  onSelect: (category: CommodityCategory) => void;
}

export function CategorySelector({ selected, onSelect }: CategorySelectorProps) {
  return (
    <div className="flex gap-2">
      {(Object.entries(COMMODITY_CATEGORIES) as [CommodityCategory, { label: string; icon: string }][]).map(
        ([key, { label, icon }]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200",
              "border hover:border-primary/50",
              selected === key
                ? "bg-primary/10 border-primary/30 text-primary shadow-lg shadow-primary/5"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <span className="text-lg">{icon}</span>
            <span>{label}</span>
          </button>
        )
      )}
    </div>
  );
}
