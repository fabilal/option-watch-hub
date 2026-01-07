import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUp, ArrowDown, Minus, Calendar, Badge } from "lucide-react";
import { type TVForexFutures } from "@/lib/tvForexApi";

interface TVForexFuturesTableProps {
  contracts: TVForexFutures[];
}

export function TVForexFuturesTable({ contracts }: TVForexFuturesTableProps) {
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

  const formatRating = (rating: string) => {
    const ratingLower = rating.toLowerCase();
    if (ratingLower.includes('strong buy')) {
      return <span className="px-2 py-0.5 rounded text-xs bg-success/20 text-success font-medium">Strong Buy</span>;
    }
    if (ratingLower.includes('buy')) {
      return <span className="px-2 py-0.5 rounded text-xs bg-success/10 text-success">Buy</span>;
    }
    if (ratingLower.includes('strong sell')) {
      return <span className="px-2 py-0.5 rounded text-xs bg-destructive/20 text-destructive font-medium">Strong Sell</span>;
    }
    if (ratingLower.includes('sell')) {
      return <span className="px-2 py-0.5 rounded text-xs bg-destructive/10 text-destructive">Sell</span>;
    }
    return <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">Neutral</span>;
  };

  const calculateDaysToExpiry = (expiration: string): number => {
    if (!expiration) return 0;
    const expiryDate = new Date(expiration);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Contrat</TableHead>
            <TableHead className="font-semibold">Nom</TableHead>
            <TableHead className="font-semibold">Expiration</TableHead>
            <TableHead className="font-semibold text-right">Jours</TableHead>
            <TableHead className="font-semibold text-right">Prix</TableHead>
            <TableHead className="font-semibold text-right">Variation</TableHead>
            <TableHead className="font-semibold text-right">Haut</TableHead>
            <TableHead className="font-semibold text-right">Bas</TableHead>
            <TableHead className="font-semibold text-center">Signal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.map((contract, idx) => {
            const daysToExpiry = calculateDaysToExpiry(contract.expiration);
            return (
              <TableRow 
                key={contract.symbol || idx}
                className="hover:bg-muted/30 transition-colors"
              >
                <TableCell className="font-mono text-primary font-medium">
                  {contract.symbol}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                  {contract.name}
                </TableCell>
                <TableCell className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {contract.expiration || '-'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={daysToExpiry <= 30 ? 'text-warning' : daysToExpiry <= 7 ? 'text-destructive' : ''}>
                    {daysToExpiry > 0 ? daysToExpiry : '-'}
                  </span>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {contract.price}
                </TableCell>
                <TableCell className="text-right">
                  {formatChange(contract.change, contract.changePercent)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {contract.high || '-'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {contract.low || '-'}
                </TableCell>
                <TableCell className="text-center">
                  {formatRating(contract.rating)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
