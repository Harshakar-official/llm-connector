import { Skeleton } from "@/components/ui/skeleton"

export default function ProjectReportLoading() {
  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <div className="bg-panel border border-border rounded-xl p-8 space-y-6">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-bg border border-border rounded-lg p-4 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-md" />
      </div>
    </div>
  )
}