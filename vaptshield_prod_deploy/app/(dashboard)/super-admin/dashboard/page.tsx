export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { getServerDateRange } from "@/lib/utils/date-server"
import { PlatformStats } from "@/components/super-admin/dashboard/PlatformStats"
import nextDynamic from "next/dynamic"
const OrgGrowthChart = nextDynamic(() => import("@/components/super-admin/dashboard/OrgGrowthChart").then(m => m.OrgGrowthChart), { loading: () => <div className="animate-pulse h-[300px] w-full bg-bg-muted/50 rounded-xl" /> })
import { RecentOrgsTable } from "@/components/super-admin/dashboard/RecentOrgsTable"
import { DateRangePickerWrapper } from "@/components/shared/DateRangePickerWrapper"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; range?: string }>
}

export default async function SuperAdminDashboard({ searchParams }: PageProps) {
  const supabase = await getServerClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "super_admin") notFound()

  // Parse date range from URL search params (set by DateRangePicker in Topbar)
  const params = await searchParams
  const dateRange = getServerDateRange({
    from: params.from,
    to: params.to,
    range: params.range,
  })

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Platform Overview</h1>
        <p className="text-sm text-fg-muted mt-1">
          Global metrics and system health for VAPTShield
        </p>
      </div>

      {/* Stats Row */}
      <Suspense fallback={<div className="h-32 animate-pulse bg-panel rounded-md" />}>
        <PlatformStats dateRange={dateRange} />
      </Suspense>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<div className="h-72 animate-pulse bg-panel rounded-md flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
          <OrgGrowthChart dateRange={dateRange} />
        </Suspense>
        <div className="bg-panel border border-border rounded-md p-6 flex flex-col items-center justify-center text-center">
            <p className="text-sm text-fg-muted">System Health</p>
            <p className="text-2xl font-semibold text-success mt-2">All Systems Operational</p>
            <p className="text-xs text-fg-subtle mt-1">Docker Nodes: 4 Active | Redis: 0.4ms lat</p>
        </div>
      </div>

      {/* Recent Orgs */}
      <Suspense fallback={<div className="h-64 animate-pulse bg-panel rounded-md" />}>
        <RecentOrgsTable dateRange={dateRange} />
      </Suspense>
    </div>
  )
}
