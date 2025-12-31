import { TrendingUp, Activity } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Header() {
  const location = useLocation();

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3">
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
            </Link>

            {/* Navigation */}
            <nav className="hidden sm:flex items-center gap-1 ml-4">
              <Link
                to="/"
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  location.pathname === "/"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                Options
              </Link>
              <Link
                to="/futures"
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  location.pathname === "/futures"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                Futures
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
              <Activity className="w-3 h-3 text-success animate-pulse" />
              <span className="text-xs font-medium text-success">Live Data</span>
            </div>
            <div className="text-right hidden sm:block">
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
