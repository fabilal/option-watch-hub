import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TypeToggle } from "@/components/TypeToggle";
import { type TVOptionContract } from "@/lib/tradingviewApi";

interface TVOptionsTableProps {
  calls: TVOptionContract[];
  puts: TVOptionContract[];
}

export function TVOptionsTable({ calls, puts }: TVOptionsTableProps) {
  const [showType, setShowType] = useState<"calls" | "puts" | "all">("all");

  const formatIV = (iv: number) => {
    if (!iv || iv === 0) return '-';
    return `${(iv * 100).toFixed(1)}%`;
  };

  const formatGreek = (value: number, decimals: number = 4) => {
    if (!value || value === 0) return '-';
    return value.toFixed(decimals);
  };

  const renderOptions = (options: TVOptionContract[], type: 'Call' | 'Put') => {
    const typeClass = type === 'Call' ? 'text-success' : 'text-destructive';
    
    return options.map((opt, idx) => (
      <TableRow 
        key={`${type}-${opt.strike}-${idx}`}
        className="hover:bg-muted/30 transition-colors"
      >
        <TableCell className={`font-medium ${typeClass}`}>
          {type}
        </TableCell>
        <TableCell className="font-mono font-semibold">
          {opt.strike}
        </TableCell>
        <TableCell className="text-right tabular-nums font-semibold">
          {opt.last || '-'}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {opt.bid || '-'}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {opt.ask || '-'}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {opt.volume || '-'}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {opt.openInterest || '-'}
        </TableCell>
        <TableCell className="text-right tabular-nums text-primary">
          {formatIV(opt.iv)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {formatGreek(opt.delta, 3)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatGreek(opt.gamma)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatGreek(opt.theta)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatGreek(opt.vega)}
        </TableCell>
      </TableRow>
    ));
  };

  const displayCalls = showType === "puts" ? [] : calls;
  const displayPuts = showType === "calls" ? [] : puts;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TypeToggle selected={showType} onSelect={setShowType} />
      </div>
      
      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Type</TableHead>
              <TableHead className="font-semibold">Strike</TableHead>
              <TableHead className="font-semibold text-right">Dernier</TableHead>
              <TableHead className="font-semibold text-right">Bid</TableHead>
              <TableHead className="font-semibold text-right">Ask</TableHead>
              <TableHead className="font-semibold text-right">Volume</TableHead>
              <TableHead className="font-semibold text-right">OI</TableHead>
              <TableHead className="font-semibold text-right">IV</TableHead>
              <TableHead className="font-semibold text-right">Δ</TableHead>
              <TableHead className="font-semibold text-right">Γ</TableHead>
              <TableHead className="font-semibold text-right">Θ</TableHead>
              <TableHead className="font-semibold text-right">V</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderOptions(displayCalls, 'Call')}
            {renderOptions(displayPuts, 'Put')}
            {displayCalls.length === 0 && displayPuts.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  Aucune donnée d'options disponible
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
