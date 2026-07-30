import Link from "next/link"
import { Building, ArrowRight } from "lucide-react"
import { getServerClient } from "@/lib/supabase/server"
import type { DateRange } from "@/lib/utils/date-server"

interface RecentOrgsTableProps {
  dateRange: DateRange
}

export async function RecentOrgsTable({ dateRange }: RecentOrgsTableProps) {
  const supabase = await getServerClient()

  const fromISO = dateRange.from.toISOString()
  const toISO = dateRange.to.toISOString()

  const { data: orgs } = await supabase
    .from("organizations")
    .select(`
      id,
      name,
      slug,
      created_at,
      org_quotas (plan_tier)
    `)
    .gte("created_at", fromISO)
    .lte("created_at", toISO)
    .order("created_at", { ascending: false })
    .limit(5)

  return (
    <div className="bg-panel border border-border rounded-md overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Recent Organizations</h3>
        <Link 
          href="/super-admin/organizations" 
          className="text-xs text-primary flex items-center gap-1 hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <table className="w-full">
        <thead className="bg-bg-subtle border-b border-border">
          <tr>
            <th className="text-left px-5 py-3 text-xs font-medium text-fg-muted uppercase">Organization</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-fg-muted uppercase">Plan</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-fg-muted uppercase">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orgs?.map((org) => (
            <tr key={org.id} className="hover:bg-panel-hover transition-colors">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-primary-subtle flex items-center justify-center">
                    <Building className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{org.name}</div>
                    <div className="text-xs text-fg-subtle font-mono">{org.slug}</div>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3">
                <span className="text-xs px-2 py-0.5 rounded bg-bg-muted border border-border capitalize">
                  {(org.org_quotas as { plan_tier?: string })?.plan_tier || "free"}
                </span>
              </td>
              <td className="px-5 py-3 text-xs text-fg-muted font-mono" suppressHydrationWarning>
                {new Date(org.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
          {(!orgs || orgs.length === 0) && (
            <tr>
              <td colSpan={3} className="px-5 py-8 text-center text-sm text-fg-muted italic">
                No organizations registered in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
