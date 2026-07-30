"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { useRouter } from "next/navigation"

export interface ScanData {
  date: string
  zap: number
  semgrep: number
  trivy: number
  gitleaks: number
  manual: number
}

export function ScanHistoryChart({ data, dateRangeLabel }: { data: ScanData[] | null, dateRangeLabel: string }) {
  const router = useRouter()

  if (!data) {
    return (
      <div className="bg-panel border border-border rounded-md p-5 h-[300px] animate-pulse">
        <div className="h-4 bg-bg-muted rounded w-1/3 mb-4" />
        <div className="h-48 bg-bg-muted rounded" />
      </div>
    )
  }

  const totalScans = data.reduce(
    (sum, d) => sum + d.zap + d.semgrep + d.trivy + d.gitleaks + d.manual,
    0
  )

  const handleBarClick = (entry: unknown) => {
    const e = entry as { activePayload?: Array<{ payload: ScanData }> }
    // Navigate dashboard to that specific day
    if (e && Array.isArray(e.activePayload) && e.activePayload[0]) {
      const payload = e.activePayload[0].payload
      if (payload && payload.date) {
          router.push(`?from=${payload.date}&to=${payload.date}`)
      }
    }
  }

  return (
    <div className="bg-panel border border-border rounded-md p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Scan History</h3>
          <p className="text-xs text-fg-muted">{dateRangeLabel}</p>
        </div>
        <span className="text-xs font-mono text-fg-muted">
          {totalScans} scans
        </span>
      </div>

      {totalScans === 0 ? (
        <div className="h-48 flex items-center justify-center text-fg-muted text-sm border border-dashed border-border rounded-md bg-bg-subtle/30">
          No scans in the selected range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart 
            data={data} 
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            onClick={handleBarClick}
          >
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
              cursor={{ fill: "hsl(var(--panel-hover))" }}
              contentStyle={{
                backgroundColor: "hsl(var(--panel))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            />
            <Bar dataKey="zap" stackId="a" fill="hsl(var(--chart-1))" name="ZAP" className="cursor-pointer" />
            <Bar dataKey="semgrep" stackId="a" fill="hsl(var(--chart-2))" name="Semgrep" className="cursor-pointer" />
            <Bar dataKey="trivy" stackId="a" fill="hsl(var(--chart-3))" name="Trivy" className="cursor-pointer" />
            <Bar dataKey="gitleaks" stackId="a" fill="hsl(var(--chart-4))" name="Gitleaks" className="cursor-pointer" />
            <Bar dataKey="manual" stackId="a" fill="hsl(var(--chart-5))" name="Manual" className="cursor-pointer" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
