import { TrendingUp, Activity } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Commodity Options<span className="text-primary">.</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Real-time volatility & greeks dashboard
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
              <Activity className="w-3 h-3 text-success animate-pulse" />
              <span className="text-xs font-medium text-success">Live Data</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Last Update</p>
              <p className="text-sm font-mono text-foreground">
                {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
