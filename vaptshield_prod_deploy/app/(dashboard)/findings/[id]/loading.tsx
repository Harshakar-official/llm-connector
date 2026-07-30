import { Skeleton } from "@/components/ui/skeleton"

export default function FindingDetailLoading() {
  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 items-start">
        {/* Sidebar skeleton */}
        <aside className="space-y-6 bg-panel border border-border p-6 rounded-2xl shadow-sm">
          {/* Severity badge */}
          <div className="flex justify-center">
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          {/* Metadata fields */}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-full" />
            </div>
          ))}

          {/* Assignee */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </aside>

        {/* Main content skeleton */}
        <main className="space-y-6">
          {/* Status workflow */}
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-md" />
            ))}
          </div>

          {/* Tabs */}
          <div className="bg-panel border border-border rounded-2xl overflow-hidden">
            <div className="px-6 border-b border-border bg-bg-subtle/30 h-12 flex items-center gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-4 w-20" />
              ))}
            </div>
            <div className="p-8 space-y-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}