import { Activity, Clock, DollarSign, TrendingUp } from "lucide-react";
import { type OptionsChain } from "@/lib/commodityData";

interface StatsCardsProps {
  data: OptionsChain | null;
}

export function StatsCards({ data }: StatsCardsProps) {
  const stats = [
    {
      label: "Days to Expiration",
      value: data?.daysToExpiration ?? "--",
      icon: Clock,
      color: "text-accent",
      bgColor: "bg-accent/10",
      borderColor: "border-accent/20",
    },
    {
      label: "Implied Volatility",
      value: data ? `${data.impliedVolatility}%` : "--",
      icon: Activity,
      color: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/20",
    },
    {
      label: "Option Point Value",
      value: data ? `$${data.priceOfOptionPoint.toLocaleString()}` : "--",
      icon: DollarSign,
      color: "text-success",
      bgColor: "bg-success/10",
      borderColor: "border-success/20",
    },
    {
      label: "Total Strikes",
      value: data ? (data.calls.length + data.puts.length) : "--",
      icon: TrendingUp,
      color: "text-foreground",
      bgColor: "bg-secondary",
      borderColor: "border-border",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={`
            glass-card rounded-xl p-4 border ${stat.borderColor}
            animate-fade-in
          `}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                {stat.label}
              </p>
              <p className={`text-2xl font-semibold font-mono ${stat.color}`}>
                {stat.value}
              </p>
            </div>
            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
