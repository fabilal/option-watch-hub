import { BarChart3 } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
        <BarChart3 className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">
        Select a Commodity
      </h3>
      <p className="text-muted-foreground text-center max-w-md">
        Choose a category, commodity symbol, and maturity date to view the options chain with volatility and greeks data.
      </p>
    </div>
  );
}
