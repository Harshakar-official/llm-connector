"use client"

import { FolderKanban, ShieldAlert, CheckCircle2, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"

export interface StatTrend {
  value: number
  isPercentage?: boolean
  label: string // e.g., "from last month"
}

export interface DashboardStats {
  totalProjects: number
  totalProjectsTrend?: StatTrend
  criticalFindings: number
  criticalFindingsTrend?: StatTrend
  successfulScans: number
  successfulScansTrend?: StatTrend
  failedScans: number
  failedScansTrend?: StatTrend
}

interface StatCardProps {
  label: string
  value: number
  delta?: string
  deltaType?: "up" | "down" | "neutral"
  trend?: StatTrend
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
  href?: string
}

export function StatCards({ stats }: { stats: DashboardStats | null }) {
  const router = useRouter()

  if (!stats) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-panel border border-border rounded-md p-5 animate-pulse">
            <div className="h-4 bg-bg-muted rounded w-1/3 mb-4" />
            <div className="h-8 bg-bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  const getTrendUI = (trend?: StatTrend, inverse: boolean = false) => {
    if (!trend || trend.value === 0) return null;
    
    const isPositive = trend.value > 0;
    // For findings and failed scans, "up" (positive) is bad (downType).
    // inverse = true means positive value is bad.
    let colorClass = "text-fg-muted";
    let prefix = "";

    if (isPositive) {
        colorClass = inverse ? "text-severity-high" : "text-success";
        prefix = "▲ ";
    } else {
        colorClass = inverse ? "text-success" : "text-severity-high";
        prefix = "▼ ";
    }

    const displayValue = trend.isPercentage 
        ? `${Math.abs(trend.value)}%` 
        : Math.abs(trend.value);

    return (
        <p className="mt-1 text-xs text-fg-muted">
            <span className={colorClass}>{prefix}{displayValue}</span> {trend.label}
        </p>
    );
  };

  const cards: StatCardProps[] = [
    {
      label: "Total Projects",
      value: stats.totalProjects,
      trend: stats.totalProjectsTrend,
      icon: FolderKanban,
      iconColor: "text-chart-1",
      href: "/projects"
    },
    {
      label: "Critical Findings",
      value: stats.criticalFindings,
      trend: stats.criticalFindingsTrend,
      icon: ShieldAlert,
      iconColor: stats.criticalFindings > 0 ? "text-severity-critical" : "text-fg-muted",
      href: "/findings?severity=critical"
    },
    {
      label: "Successful Scans",
      value: stats.successfulScans,
      trend: stats.successfulScansTrend,
      icon: CheckCircle2,
      iconColor: "text-success",
    },
    {
      label: "Failed Scans",
      value: stats.failedScans,
      trend: stats.failedScansTrend,
      icon: XCircle,
      iconColor: stats.failedScans > 0 ? "text-severity-high" : "text-fg-muted",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div 
            key={card.label} 
            onClick={() => card.href && router.push(card.href)}
            className={`bg-panel border border-border rounded-md p-5 flex items-start gap-4 transition-colors ${card.href ? 'cursor-pointer hover:border-primary/50 hover:bg-panel-hover' : ''}`}
        >
          <div className="p-3 bg-bg-muted rounded-md flex items-center justify-center shrink-0">
            <card.icon className={`h-5 w-5 ${card.iconColor}`} />
          </div>
          <div>
            <div className="text-3xl font-semibold tabular-nums font-mono">
                {card.value}
            </div>
            <div className="text-sm font-medium text-fg mt-0.5">{card.label}</div>
            {card.trend ? (
                getTrendUI(card.trend, card.label.includes("Findings") || card.label.includes("Failed"))
            ) : (
                <div className="text-xs mt-1 text-fg-muted opacity-50">Stable</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
