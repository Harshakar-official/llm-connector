"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import Link from "next/link"

export interface ProjectVulnCount {
  project_id: string
  project_name: string
  critical: number
  high: number
  total: number
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

export function TopProjectsCard({ projects, dateRangeLabel }: { projects: ProjectVulnCount[] | null, dateRangeLabel: string }) {
  if (!projects) {
    return (
      <div className="bg-panel border border-border rounded-md p-5 h-[300px] animate-pulse">
        <div className="h-4 bg-bg-muted rounded w-1/3 mb-4" />
        <div className="flex gap-4">
          <div className="h-32 bg-bg-muted rounded w-1/2" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-bg-muted rounded" />
            <div className="h-4 bg-bg-muted rounded" />
            <div className="h-4 bg-bg-muted rounded" />
          </div>
        </div>
      </div>
    )
  }

  const totalVulns = projects.reduce((sum, p) => sum + p.total, 0)

  return (
    <div className="bg-panel border border-border rounded-md p-5 shadow-sm hover:border-border-strong transition-all">
      <div className="mb-4">
        <h3 className="text-base font-semibold">Top Vulnerable Projects</h3>
        <p className="text-xs text-fg-muted">{dateRangeLabel}</p>
      </div>

      {projects.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-fg-muted text-sm border border-dashed border-border rounded-md bg-bg-subtle/30">
          No critical/high findings in this range
        </div>
      ) : (
        <div className="flex gap-6 items-center">
          {/* Donut Chart */}
          <div className="w-32 h-32 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={projects}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="total"
                  nameKey="project_name"
                >
                  {projects.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--panel))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center label with absolute positioning */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-xl font-semibold font-mono">{totalVulns}</div>
            </div>
          </div>

          {/* List of projects */}
          <div className="flex-1 space-y-3">
            {projects.map((p, i) => (
              <div key={p.project_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <Link 
                    href={`/projects/${p.project_id}`}
                    className="text-fg hover:text-primary transition-colors truncate font-medium"
                    title={p.project_name}
                  >
                    {p.project_name}
                  </Link>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                  {p.critical > 0 && (
                    <span className="text-severity-critical px-1.5 py-0.5 bg-severity-critical/10 rounded">
                      {p.critical} C
                    </span>
                  )}
                  {p.high > 0 && (
                    <span className="text-severity-high px-1.5 py-0.5 bg-severity-high/10 rounded">
                      {p.high} H
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
