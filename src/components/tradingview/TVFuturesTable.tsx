import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { type TVFuturesContract } from "@/lib/tradingviewApi";

interface TVFuturesTableProps {
  contracts: TVFuturesContract[];
}

export function TVFuturesTable({ contracts }: TVFuturesTableProps) {
  const formatChange = (change: string, percent: string) => {
    const numChange = parseFloat(change.replace(/[^-\d.]/g, ''));
    
    if (numChange > 0) {
      return (
        <div className="flex items-center gap-1 text-success">
          <ArrowUp className="w-3 h-3" />
          <span>+{change}</span>
          <span className="text-xs">({percent})</span>
        </div>
      );
    } else if (numChange < 0) {
      return (
        <div className="flex items-center gap-1 text-destructive">
          <ArrowDown className="w-3 h-3" />
          <span>{change}</span>
          <span className="text-xs">({percent})</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Minus className="w-3 h-3" />
        <span>0</span>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Contrat</TableHead>
            <TableHead className="font-semibold">Expiration</TableHead>
            <TableHead className="font-semibold text-right">Jours</TableHead>
            <TableHead className="font-semibold text-right">Dernier</TableHead>
            <TableHead className="font-semibold text-right">Variation</TableHead>
            <TableHead className="font-semibold text-right">Ouv.</TableHead>
            <TableHead className="font-semibold text-right">Haut</TableHead>
            <TableHead className="font-semibold text-right">Bas</TableHead>
            <TableHead className="font-semibold text-right">Volume</TableHead>
            <TableHead className="font-semibold text-right">OI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.map((contract, idx) => (
            <TableRow 
              key={contract.symbol || idx}
              className="hover:bg-muted/30 transition-colors"
            >
              <TableCell className="font-mono text-primary font-medium">
                {contract.symbol}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {contract.expiration || '-'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {contract.daysLeft || '-'}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {contract.last}
              </TableCell>
              <TableCell className="text-right">
                {formatChange(contract.change, contract.changePercent)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {contract.open || '-'}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {contract.high || '-'}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {contract.low || '-'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {contract.volume || '-'}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {contract.openInterest || '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
