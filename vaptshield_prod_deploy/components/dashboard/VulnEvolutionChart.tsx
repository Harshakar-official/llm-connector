"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { useRouter } from "next/navigation"
import { ShieldCheck } from "lucide-react"

export interface VulnTrendData {
  date: string
  critical: number
  high: number
  medium: number
  low: number
}

export function VulnEvolutionChart({ data, dateRangeLabel }: { data: VulnTrendData[] | null, dateRangeLabel: string }) {
  const router = useRouter()

  if (!data) {
    return (
      <div className="bg-panel border border-border rounded-md p-5 h-[350px] animate-pulse">
        <div className="h-4 bg-bg-muted rounded w-1/3 mb-4" />
        <div className="h-64 bg-bg-muted rounded" />
      </div>
    )
  }

  const totalVulns = data.reduce((sum, d) => sum + d.critical + d.high + d.medium + d.low, 0)

  // Recharts AreaChart requires at least 2 points to draw a shape. 
  // If it's a single-day range (e.g. "Today" or "Yesterday"), duplicate the point to create a flat line across the day.
  const chartData = data.length === 1 
    ? [
        { ...data[0], date: `${data[0].date}T00:00:00` },
        { ...data[0], date: `${data[0].date}T23:59:59` }
      ]
    : data

  const handleAreaClick = (entry: unknown) => {
    const e = entry as { activePayload?: Array<{ payload: VulnTrendData }> }
    if (e && Array.isArray(e.activePayload) && e.activePayload[0]) {
      const payload = e.activePayload[0].payload
      if (payload && payload.date) {
          const rawDateStr = payload.date.split("T")[0] // Strip T00:00:00 if present
          router.push(`?from=${rawDateStr}&to=${rawDateStr}`)
      }
    }
  }

  return (
    <div className="bg-panel border border-border rounded-md p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Vulnerability Evolution</h3>
          <p className="text-xs text-fg-muted">{dateRangeLabel}</p>
        </div>
        <span className="text-xs font-mono text-fg-muted">
          {totalVulns} total
        </span>
      </div>

      {totalVulns === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border rounded-md bg-bg-subtle/10 relative overflow-hidden group">
          {/* Subtle background pattern/grid */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[length:20px_20px]" style={{ backgroundImage: `linear-gradient(to_right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to_bottom, hsl(var(--border)) 1px, transparent 1px)` }} />
          
          <div className="relative z-10 flex flex-col items-center text-center px-4">
            <div className="mb-3 p-3 rounded-full bg-success/10 text-success ring-8 ring-success/5">
                <ShieldCheck className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-fg">All Clear</h4>
            <p className="text-xs text-fg-muted mt-1 max-w-[200px]">
              No vulnerabilities were identified during this period.
            </p>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart 
            data={chartData} 
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            onClick={handleAreaClick}
            className="cursor-pointer"
          >
            <defs>
              <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--critical))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--critical))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--high))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--high))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorMedium" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--medium))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--medium))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorLow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--low))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--low))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "hsl(var(--fg-muted))", fontSize: 11 }}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              tick={{ fill: "hsl(var(--fg-muted))", fontSize: 11 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--panel))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            />
            <Area
              type="monotone"
              dataKey="critical"
              name="Critical"
              stackId="1"
              stroke="hsl(var(--critical))"
              fillOpacity={1}
              fill="url(#colorCritical)"
            />
            <Area
              type="monotone"
              dataKey="high"
              name="High"
              stackId="1"
              stroke="hsl(var(--high))"
              fillOpacity={1}
              fill="url(#colorHigh)"
            />
            <Area
              type="monotone"
              dataKey="medium"
              name="Medium"
              stackId="1"
              stroke="hsl(var(--medium))"
              fillOpacity={1}
              fill="url(#colorMedium)"
            />
            <Area
              type="monotone"
              dataKey="low"
              name="Low"
              stackId="1"
              stroke="hsl(var(--low))"
              fillOpacity={1}
              fill="url(#colorLow)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
