import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FuturesPricesData } from "@/lib/commodityData";

interface FuturesPricesTableProps {
  data: FuturesPricesData | null;
  isLoading?: boolean;
}

export function FuturesPricesTable({ data, isLoading }: FuturesPricesTableProps) {
  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Prix Futures
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-muted/50 animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.futures.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Prix Futures
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-4">
            Aucune donnée de prix futures disponible
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Prix Futures - {data.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">Contrat</TableHead>
                <TableHead className="text-muted-foreground font-medium">Mois</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Dernier</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Variation</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">%</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Ouverture</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Haut</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Bas</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Volume</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Open Int.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.futures.map((future, index) => {
                const changeValue = parseFloat(future.change.replace(/[^-\d.]/g, '')) || 0;
                const isPositive = changeValue > 0;
                const isNegative = changeValue < 0;

                return (
                  <TableRow
                    key={future.contract || index}
                    className="border-border/30 hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-mono text-sm font-medium text-foreground">
                      {future.contract}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {future.month}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium text-foreground">
                      {future.last}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-flex items-center gap-1 font-mono text-sm ${
                        isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground'
                      }`}>
                        {isPositive ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : isNegative ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                        {future.change}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${
                      isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground'
                    }`}>
                      {future.percentChange}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {future.open}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {future.high}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {future.low}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {future.volume}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {future.openInterest}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
