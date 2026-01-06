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
import { type ForexOptionContract } from "@/lib/forexApi";

interface ForexOptionsTableProps {
  calls: ForexOptionContract[];
  puts: ForexOptionContract[];
}

export function ForexOptionsTable({ calls, puts }: ForexOptionsTableProps) {
  const [showType, setShowType] = useState<"calls" | "puts" | "all">("all");

  const formatIV = (iv: number) => {
    if (!iv || iv === 0) return '-';
    return `${iv.toFixed(1)}%`;
  };

  const formatGreek = (value: number, decimals: number = 3) => {
    if (value === undefined || value === null) return '-';
    if (value === 0) return '0';
    return value.toFixed(decimals);
  };

  const formatPrice = (value: string | number) => {
    if (!value || value === '0' || value === 0) return '-';
    return typeof value === 'number' ? value.toFixed(4) : value;
  };

  const renderOptions = (options: ForexOptionContract[], type: 'Call' | 'Put') => {
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
          {opt.strike.toFixed(4)}
        </TableCell>
        <TableCell className="text-right tabular-nums font-semibold">
          {formatPrice(opt.last)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatPrice(opt.bid)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatPrice(opt.ask)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {opt.volume || '-'}
        </TableCell>
        <TableCell className="text-right tabular-nums text-primary font-medium">
          {formatIV(opt.iv)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {formatGreek(opt.delta)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatGreek(opt.gamma, 4)}
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Strike</TableHead>
                <TableHead className="font-semibold text-right">Prix</TableHead>
                <TableHead className="font-semibold text-right">Bid</TableHead>
                <TableHead className="font-semibold text-right">Ask</TableHead>
                <TableHead className="font-semibold text-right">Vol</TableHead>
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
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Aucune donnée d'options disponible
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
