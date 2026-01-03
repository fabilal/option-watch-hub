import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";
import { type TVOptionsChain } from "@/lib/tradingviewApi";

interface TVOptionsStatsProps {
  options: TVOptionsChain;
}

export function TVOptionsStats({ options }: TVOptionsStatsProps) {
  // Calculate stats
  const totalCalls = options.calls.length;
  const totalPuts = options.puts.length;
  
  const avgCallIV = totalCalls > 0 
    ? options.calls.reduce((sum, c) => sum + c.iv, 0) / totalCalls 
    : 0;
  const avgPutIV = totalPuts > 0 
    ? options.puts.reduce((sum, p) => sum + p.iv, 0) / totalPuts 
    : 0;
  
  const avgCallDelta = totalCalls > 0
    ? options.calls.reduce((sum, c) => sum + Math.abs(c.delta), 0) / totalCalls
    : 0;
  const avgPutDelta = totalPuts > 0
    ? options.puts.reduce((sum, p) => sum + Math.abs(p.delta), 0) / totalPuts
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <DollarSign className="w-4 h-4" />
          <span className="text-xs font-medium">Prix Sous-jacent</span>
        </div>
        <p className="text-2xl font-bold text-foreground">
          ${options.underlyingPrice || '-'}
        </p>
        {options.selectedMaturity && (
          <p className="text-xs text-muted-foreground mt-1">{options.selectedMaturity}</p>
        )}
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <TrendingUp className="w-4 h-4 text-success" />
          <span className="text-xs font-medium">Calls</span>
        </div>
        <p className="text-2xl font-bold text-success">{totalCalls}</p>
        <p className="text-xs text-muted-foreground mt-1">
          IV moy: {avgCallIV.toFixed(1)}% | Δ: {avgCallDelta.toFixed(2)}
        </p>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <TrendingDown className="w-4 h-4 text-destructive" />
          <span className="text-xs font-medium">Puts</span>
        </div>
        <p className="text-2xl font-bold text-destructive">{totalPuts}</p>
        <p className="text-xs text-muted-foreground mt-1">
          IV moy: {avgPutIV.toFixed(1)}% | Δ: {avgPutDelta.toFixed(2)}
        </p>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium">Put/Call Ratio</span>
        </div>
        <p className="text-2xl font-bold text-primary">
          {totalCalls > 0 ? (totalPuts / totalCalls).toFixed(2) : '-'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {totalPuts + totalCalls} options au total
        </p>
      </Card>
    </div>
  );
}
