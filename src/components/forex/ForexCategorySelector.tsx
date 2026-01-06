import { cn } from "@/lib/utils";
import { FOREX_CATEGORIES, type ForexCategory } from "@/lib/forexApi";

interface ForexCategorySelectorProps {
  selected: ForexCategory;
  onSelect: (category: ForexCategory) => void;
}

export function ForexCategorySelector({ selected, onSelect }: ForexCategorySelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(FOREX_CATEGORIES) as ForexCategory[]).map((key) => {
        const cat = FOREX_CATEGORIES[key];
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 text-sm font-medium",
              selected === key
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
            )}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        );
      })}
    </div>
  );
}
