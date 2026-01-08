import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TVForexOptionContract } from "@/lib/tvForexApi";

interface TVForexOptionsTableProps {
  calls: TVForexOptionContract[];
  puts: TVForexOptionContract[];
}

export function TVForexOptionsTable({ calls, puts }: TVForexOptionsTableProps) {
  // Merge calls and puts by strike
  const allStrikes = [...new Set([...calls.map(c => c.strike), ...puts.map(p => p.strike)])].sort((a, b) => a - b);

  const getCallByStrike = (strike: number) => calls.find(c => c.strike === strike);
  const getPutByStrike = (strike: number) => puts.find(p => p.strike === strike);

  const formatValue = (value: string | undefined) => {
    if (!value || value === '0' || value === '0.00') return '-';
    return value;
  };

  const formatIV = (iv: number | undefined) => {
    if (!iv || iv === 0) return '-';
    return `${iv.toFixed(1)}%`;
  };

  const formatGreek = (value: string | undefined) => {
    if (!value || value === '0') return '-';
    return value;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          Chaîne d'Options TradingView
        </h3>
        <Badge variant="outline" className="text-xs">
          {allStrikes.length} strikes
        </Badge>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead colSpan={8} className="text-center border-r border-border bg-success/10 text-success">
                  CALLS
                </TableHead>
                <TableHead className="text-center font-bold bg-muted">
                  Strike
                </TableHead>
                <TableHead className="text-center font-bold bg-muted border-r border-border">
                  IV
                </TableHead>
                <TableHead colSpan={8} className="text-center bg-destructive/10 text-destructive">
                  PUTS
                </TableHead>
              </TableRow>
              <TableRow className="bg-muted/30">
                {/* Call headers */}
                <TableHead className="text-right text-xs">Theta</TableHead>
                <TableHead className="text-right text-xs">Gamma</TableHead>
                <TableHead className="text-right text-xs">Delta</TableHead>
                <TableHead className="text-right text-xs">Prix</TableHead>
                <TableHead className="text-right text-xs">Bid</TableHead>
                <TableHead className="text-right text-xs">Ask</TableHead>
                <TableHead className="text-right text-xs">Vol</TableHead>
                <TableHead className="text-right text-xs border-r border-border">IV</TableHead>
                {/* Strike */}
                <TableHead className="text-center font-bold bg-muted"></TableHead>
                <TableHead className="text-center font-bold bg-muted border-r border-border"></TableHead>
                {/* Put headers */}
                <TableHead className="text-right text-xs">Vol</TableHead>
                <TableHead className="text-right text-xs">Bid</TableHead>
                <TableHead className="text-right text-xs">Ask</TableHead>
                <TableHead className="text-right text-xs">Prix</TableHead>
                <TableHead className="text-right text-xs">Delta</TableHead>
                <TableHead className="text-right text-xs">Gamma</TableHead>
                <TableHead className="text-right text-xs">Theta</TableHead>
                <TableHead className="text-right text-xs">IV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allStrikes.map((strike) => {
                const call = getCallByStrike(strike);
                const put = getPutByStrike(strike);
                const avgIV = call?.iv || put?.iv || 0;

                return (
                  <TableRow key={strike} className="hover:bg-muted/30">
                    {/* Call data */}
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatGreek(call?.theta)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatGreek(call?.gamma)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatGreek(call?.delta)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatValue(call?.last)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatValue(call?.bid)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatValue(call?.ask)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatValue(call?.volume)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-primary border-r border-border">
                      {formatIV(call?.iv)}
                    </TableCell>
                    
                    {/* Strike */}
                    <TableCell className="text-center font-bold bg-muted/50">
                      {strike.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm text-primary bg-muted/50 border-r border-border">
                      {avgIV > 0 ? `${avgIV.toFixed(1)}%` : '-'}
                    </TableCell>
                    
                    {/* Put data */}
                    <TableCell className="text-right font-mono text-sm">
                      {formatValue(put?.volume)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatValue(put?.bid)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatValue(put?.ask)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatValue(put?.last)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatGreek(put?.delta)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatGreek(put?.gamma)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatGreek(put?.theta)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-primary">
                      {formatIV(put?.iv)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
