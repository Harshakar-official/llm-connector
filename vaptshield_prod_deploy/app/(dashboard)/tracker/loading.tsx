import { Skeleton } from "@/components/ui/skeleton"

export default function TrackerLoading() {
  return (
    <div className="p-6 h-[calc(100vh-3.5rem)] flex flex-col space-y-6 overflow-hidden">
      {/* Header skeleton */}
      <div className="flex items-center justify-between shrink-0">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* Stats Summary skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
          {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 rounded-2xl border border-border/50 bg-bg-card flex items-center justify-between shadow-sm">
                  <div className="space-y-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-7 w-12" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-xl" />
              </div>
          ))}
      </div>

      {/* Toolbar skeleton */}
      <div className="flex flex-wrap items-center gap-3 bg-bg-card p-3 rounded-xl border border-border/50">
          <Skeleton className="h-9 flex-1 min-w-[200px] rounded-lg" />
          <Skeleton className="h-9 w-[140px] rounded-lg" />
          <Skeleton className="h-9 w-[130px] rounded-lg" />
          <Skeleton className="h-9 w-[150px] rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="border border-border/50 rounded-xl overflow-hidden bg-bg-card flex-1 shadow-sm">
        <div className="h-10 bg-bg-muted/20 border-b border-border/50 flex items-center px-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
        <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
              <div key={row} className="flex items-center gap-4 py-3 border-b border-border/30 last:border-0">
                  {[1, 2, 3, 4, 5, 6].map(col => <Skeleton key={col} className="h-5 flex-1" />)}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}