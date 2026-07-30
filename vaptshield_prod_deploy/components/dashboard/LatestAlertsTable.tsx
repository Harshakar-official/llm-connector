"use client"

import { SeverityBadge } from "@/components/findings/SeverityBadge"
import { CheckCircle2 } from "lucide-react"
import Link from "next/link"

export interface Alert {
  id: string
  title: string
  severity: string
  project_id: string
  project_name: string
  created_at: string
}

function formatAge(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 60) return `${Math.max(1, minutes)}m`
  if (hours < 24) return `${hours}h`
  return `${days}d`
}

export function LatestAlertsTable({ alerts, dateRangeLabel }: { alerts: Alert[] | null, dateRangeLabel: string }) {
  if (!alerts) {
    return (
      <div className="bg-panel border border-border rounded-md p-5 animate-pulse">
        <div className="h-4 bg-bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-panel border border-border rounded-md overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-semibold">Latest High Severity Alerts</h3>
          <p className="text-xs text-fg-muted">{dateRangeLabel}</p>
        </div>
        <Link
          href="/findings"
          className="text-xs text-primary hover:text-primary-hover transition-colors font-medium"
        >
          View all findings →
        </Link>
      </div>

      {alerts.length === 0 ? (
        <div className="px-5 py-12 text-center bg-bg-subtle/20 flex flex-col items-center justify-center space-y-3">
          <div className="p-3 rounded-full bg-success/5 border border-success/10">
            <CheckCircle2 className="h-6 w-6 text-success opacity-40" />
          </div>
          <div>
            <p className="text-sm font-bold text-fg">Clear of High Severity</p>
            <p className="text-[11px] text-fg-muted">No critical or high severity alerts detected in this timeframe.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-bg-subtle/50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">Severity</th>
                <th className="px-5 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">Vulnerability</th>
                <th className="px-5 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider">Project</th>
                <th className="px-5 py-3 text-xs font-semibold text-fg-muted uppercase tracking-wider text-right">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-panel-hover transition-colors group">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <SeverityBadge severity={alert.severity as "critical" | "high" | "medium" | "low" | "informational"} />
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/findings/${alert.id}`}
                      className="text-sm font-medium text-fg hover:text-primary transition-colors line-clamp-1 max-w-[400px]"
                    >
                      {alert.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <Link
                      href={`/projects/${alert.project_id}`}
                      className="text-sm text-fg-muted hover:text-fg transition-colors"
                    >
                      {alert.project_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-right text-sm text-fg-muted font-mono">
                    {formatAge(alert.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
