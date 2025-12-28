import { Skeleton } from "@/components/ui/skeleton";

export function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card rounded-xl p-4 border border-border">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="glass-card rounded-xl p-6 border border-border">
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-[300px] w-full" />
      </div>

      {/* Table Skeleton */}
      <div className="rounded-xl border border-border overflow-hidden bg-card/50">
        <div className="bg-table-header p-4">
          <div className="flex gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-4 w-16" />
            ))}
          </div>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex gap-4">
              {[1, 2, 3, 4, 5, 6].map((j) => (
                <Skeleton key={j} className="h-4 w-16" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
