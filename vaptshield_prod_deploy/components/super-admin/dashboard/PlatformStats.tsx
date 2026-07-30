import { Building, Users, Activity, AlertCircle } from "lucide-react"
import { getServerClient } from "@/lib/supabase/server"
import type { DateRange } from "@/lib/utils/date-server"
import Link from "next/link"

interface PlatformStatsProps {
  dateRange: DateRange
}

export async function PlatformStats({ dateRange }: PlatformStatsProps) {
  const supabase = await getServerClient()

  const fromISO = dateRange.from.toISOString()
  const toISO = dateRange.to.toISOString()

  // Fetch real platform stats filtered by date range
  const { count: orgCount } = await supabase
    .from("organizations")
    .select("*", { count: "exact", head: true })
    .gte("created_at", fromISO)
    .lte("created_at", toISO)

  const { count: userCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .gte("created_at", fromISO)
    .lte("created_at", toISO)

  const { count: activeScans } = await supabase
    .from("scan_history")
    .select("*", { count: "exact", head: true })
    .eq("status", "running")
    .gte("created_at", fromISO)
    .lte("created_at", toISO)

  const { count: failedScans } = await supabase
    .from("scan_history")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", fromISO)
    .lte("created_at", toISO)

  const stats = [
    {
      label: "Total Organizations",
      value: orgCount || 0,
      icon: Building,
      color: "text-primary",
      href: "/super-admin/organizations"
    },
    {
      label: "Total Registered Users",
      value: userCount || 0,
      icon: Users,
      color: "text-success",
      href: "/super-admin/users"
    },
    {
      label: "Active Scans",
      value: activeScans || 0,
      icon: Activity,
      color: "text-warning",
      href: "/super-admin/analytics"
    },
    {
      label: "Critical Alerts",
      value: failedScans || 0,
      icon: AlertCircle,
      color: failedScans && failedScans > 0 ? "text-danger" : "text-fg-muted",
      href: "/super-admin/analytics"
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Link 
            key={stat.label} 
            href={stat.href}
            className="bg-panel border border-border rounded-md p-5 hover:border-primary/40 hover:shadow-md transition-all active:scale-95 group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-fg-muted uppercase tracking-wider group-hover:text-fg transition-colors">
                {stat.label}
              </span>
              <Icon className={`h-4 w-4 ${stat.color} transition-transform group-hover:scale-110`} />
            </div>
            <div className="text-3xl font-semibold font-mono tracking-tight text-fg">
              {stat.value}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
