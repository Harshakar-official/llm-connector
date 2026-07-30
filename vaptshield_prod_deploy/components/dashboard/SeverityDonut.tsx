"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { useRouter } from "next/navigation"

export interface SeverityData {
  name: string
  value: number
  color: string
}

export function SeverityDonut({ data, dateRangeLabel }: { data: SeverityData[] | null, dateRangeLabel: string }) {
  const router = useRouter()
  
  if (!data) {
    return (
      <div className="bg-panel border border-border rounded-md p-5 h-[350px] animate-pulse">
        <div className="h-4 bg-bg-muted rounded w-1/3 mb-4" />
        <div className="h-48 bg-bg-muted rounded mx-auto w-48" style={{ borderRadius: "50%" }} />
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="bg-panel border border-border rounded-md p-5 h-[350px] flex flex-col">
      <div className="mb-2 shrink-0">
        <h3 className="text-base font-semibold">Severity Distribution</h3>
        <p className="text-xs text-fg-muted">{dateRangeLabel}</p>
      </div>

      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">
          No findings in the selected range
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
          <div className="relative w-full h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(entry) => router.push(`/findings?severity=${entry.name.toLowerCase()}`)}
                    className="cursor-pointer"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity" />
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
              
              {/* Fix: Center label absolute positioning to prevent overlap */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-2xl font-semibold font-mono leading-none">{total}</div>
                <div className="text-[10px] text-fg-muted uppercase tracking-wider mt-1">Total</div>
              </div>
          </div>

          {/* Legend */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 w-full max-w-[200px]">
            {data.map(d => (
              <div 
                key={d.name} 
                onClick={() => router.push(`/findings?severity=${d.name.toLowerCase()}`)}
                className="flex items-center justify-between text-xs cursor-pointer hover:bg-bg-muted px-1.5 py-0.5 rounded transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-fg-muted">{d.name}</span>
                </div>
                <span className="font-mono text-fg font-medium">
                  {d.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
