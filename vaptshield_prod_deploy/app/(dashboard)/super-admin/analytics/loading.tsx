import { Skeleton } from "@/components/ui/skeleton"

export default function SuperAdminAnalyticsLoading() {
  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-panel border border-border p-6 rounded-2xl space-y-4">

            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-panel border border-border rounded-xl p-5 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-[300px] w-full rounded-md" />
        </div>
        <div className="bg-panel border border-border rounded-xl p-5 space-y-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-[300px] w-full rounded-md" />
        </div>
      </div>

      {/* Recent scans table */}
      <div className="bg-panel border border-border rounded-xl p-5 space-y-4">
        <Skeleton className="h-4 w-32" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    </div>
  )
}