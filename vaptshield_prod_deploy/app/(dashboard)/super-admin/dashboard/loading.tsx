import { Home, Building2, Users, BarChart3, Clock } from "lucide-react"

export default function SuperAdminDashboardLoading() {
  return (
    <div className="p-6 space-y-8 max-w-[1440px] mx-auto animate-in fade-in duration-500">
      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-10 w-64 bg-bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-48 bg-bg-muted animate-pulse rounded-md" />
        </div>
        <div className="h-10 w-40 bg-bg-muted animate-pulse rounded-xl" />
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-panel border border-border p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-bg-muted animate-pulse rounded" />
              <div className="h-8 w-8 bg-bg-muted animate-pulse rounded-full" />
            </div>
            <div className="h-8 w-16 bg-bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>

      {/* Charts / Main Content Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-panel border border-border rounded-2xl h-[400px] animate-pulse" />
        <div className="bg-panel border border-border rounded-2xl h-[400px] animate-pulse" />
      </div>

      {/* Table Skeleton */}
      <div className="space-y-4">
        <div className="h-6 w-32 bg-bg-muted animate-pulse rounded" />
        <div className="bg-panel border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border bg-bg-subtle/50 h-12 animate-pulse" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 border-b border-border last:border-0 h-16 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
