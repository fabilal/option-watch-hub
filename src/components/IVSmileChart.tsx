import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { type OptionData } from "@/lib/commodityData";

interface IVSmileChartProps {
  calls: OptionData[];
  puts: OptionData[];
}

export function IVSmileChart({ calls, puts }: IVSmileChartProps) {
  // Prepare data for the chart - combine calls and puts by strike
  const chartData = calls.map((call) => {
    const put = puts.find((p) => p.strike === call.strike);
    return {
      strike: call.strike,
      callIV: call.iv,
      putIV: put?.iv ?? null,
      avgIV: put ? (call.iv + put.iv) / 2 : call.iv,
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
        <p className="font-mono font-semibold text-foreground mb-2">
          Strike: {label}
        </p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-mono font-medium" style={{ color: entry.color }}>
              {entry.value?.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="glass-card rounded-xl p-6 border border-border">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">IV Smile</h3>
        <p className="text-sm text-muted-foreground">
          Implied volatility curve across strikes
        </p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
            <XAxis
              dataKey="strike"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(value) => value.toFixed(0)}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(value) => `${value}%`}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              formatter={(value) => (
                <span className="text-muted-foreground text-sm">{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey="callIV"
              stroke="hsl(var(--chart-call))"
              strokeWidth={2}
              dot={{ fill: "hsl(var(--chart-call))", strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, stroke: "hsl(var(--chart-call))", strokeWidth: 2 }}
              name="Call IV"
            />
            <Line
              type="monotone"
              dataKey="putIV"
              stroke="hsl(var(--chart-put))"
              strokeWidth={2}
              dot={{ fill: "hsl(var(--chart-put))", strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, stroke: "hsl(var(--chart-put))", strokeWidth: 2 }}
              name="Put IV"
            />
            <Line
              type="monotone"
              dataKey="avgIV"
              stroke="hsl(var(--chart-iv))"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Avg IV"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
