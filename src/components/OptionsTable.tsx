import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type OptionData } from "@/lib/commodityData";
import { ArrowDown, ArrowUp } from "lucide-react";

interface OptionsTableProps {
  calls: OptionData[];
  puts: OptionData[];
  showType: "calls" | "puts" | "all";
}

type SortField = "strike" | "iv" | "delta" | "gamma" | "theta" | "vega" | "ivSkew";
type SortDirection = "asc" | "desc";

export function OptionsTable({ calls, puts, showType }: OptionsTableProps) {
  const [sortField, setSortField] = useState<SortField>("strike");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const data = showType === "calls" ? calls : showType === "puts" ? puts : [...calls, ...puts];

  const sortedData = [...data].sort((a, b) => {
    const multiplier = sortDirection === "asc" ? 1 : -1;
    return (a[sortField] - b[sortField]) * multiplier;
  });

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1" />
    );
  };

  const formatValue = (value: number, decimals: number = 4) => {
    return value.toFixed(decimals);
  };

  const getIVColor = (iv: number) => {
    if (iv > 40) return "text-destructive";
    if (iv > 30) return "text-accent";
    return "text-foreground";
  };

  const getSkewColor = (skew: number) => {
    if (skew > 0) return "data-positive";
    if (skew < 0) return "data-negative";
    return "data-neutral";
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card/50">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-table-header border-b border-table-border hover:bg-table-header">
              <TableHead
                className="cursor-pointer hover:text-primary transition-colors font-semibold"
                onClick={() => handleSort("strike")}
              >
                Strike <SortIcon field="strike" />
              </TableHead>
              <TableHead className="font-semibold">Type</TableHead>
              <TableHead className="font-semibold">Latest</TableHead>
              <TableHead
                className="cursor-pointer hover:text-primary transition-colors font-semibold"
                onClick={() => handleSort("iv")}
              >
                IV % <SortIcon field="iv" />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-primary transition-colors font-semibold"
                onClick={() => handleSort("delta")}
              >
                Delta <SortIcon field="delta" />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-primary transition-colors font-semibold"
                onClick={() => handleSort("gamma")}
              >
                Gamma <SortIcon field="gamma" />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-primary transition-colors font-semibold"
                onClick={() => handleSort("theta")}
              >
                Theta <SortIcon field="theta" />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-primary transition-colors font-semibold"
                onClick={() => handleSort("vega")}
              >
                Vega <SortIcon field="vega" />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-primary transition-colors font-semibold"
                onClick={() => handleSort("ivSkew")}
              >
                IV Skew <SortIcon field="ivSkew" />
              </TableHead>
              <TableHead className="font-semibold">Last Trade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((option, index) => (
              <TableRow
                key={`${option.type}-${option.strike}-${index}`}
                className={cn(
                  "border-b border-table-border transition-colors",
                  "hover:bg-table-hover",
                  index % 2 === 0 ? "bg-card/30" : "bg-card/50"
                )}
              >
                <TableCell className="font-mono font-semibold text-foreground">
                  {option.strike.toFixed(2)}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      option.type === "Call"
                        ? "bg-primary/20 text-primary"
                        : "bg-destructive/20 text-destructive"
                    )}
                  >
                    {option.type}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {option.latest}
                </TableCell>
                <TableCell className={cn("font-mono font-medium", getIVColor(option.iv))}>
                  {option.iv.toFixed(2)}%
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {formatValue(option.delta)}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {formatValue(option.gamma)}
                </TableCell>
                <TableCell className="font-mono text-destructive">
                  {formatValue(option.theta)}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {formatValue(option.vega)}
                </TableCell>
                <TableCell className={cn("font-mono", getSkewColor(option.ivSkew))}>
                  {option.ivSkew > 0 ? "+" : ""}
                  {option.ivSkew.toFixed(2)}%
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {option.lastTrade}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
