import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-panel border border-border rounded-lg p-5 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
        <div className="lg:col-span-7 bg-panel border border-border rounded-lg p-5 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-[280px] w-full rounded-md" />
        </div>
        <div className="lg:col-span-3 bg-panel border border-border rounded-lg p-5 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-[180px] w-[180px] rounded-full mx-auto" />
        </div>
      </div>

      {/* Row 3: Top Projects + Scan History */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-panel border border-border rounded-lg p-5 space-y-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-[240px] w-full rounded-md" />
        </div>
        <div className="bg-panel border border-border rounded-lg p-5 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-[240px] w-full rounded-md" />
        </div>
      </div>

      {/* Row 4: Latest Alerts Table */}
      <div className="bg-panel border border-border rounded-lg p-5 space-y-4">
        <Skeleton className="h-4 w-44" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}