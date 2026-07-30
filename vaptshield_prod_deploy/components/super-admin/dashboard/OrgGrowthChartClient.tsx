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

interface ChartDataPoint {
  name: string
  count: number
}

export function OrgGrowthChartClient({ data }: { data: ChartDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="bg-panel border border-border rounded-xl p-6 shadow-sm">
        <div className="mb-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-fg-muted">Organization Growth</h3>
          <p className="text-xs text-fg-subtle">Cumulative new organizations per month</p>
        </div>
        <div className="h-[240px] w-full flex items-center justify-center text-fg-muted text-sm font-medium italic">
          No organization data available yet.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-panel border border-border rounded-xl p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-fg-muted">Organization Growth</h3>
        <p className="text-xs text-fg-subtle">Cumulative new organizations per month</p>
      </div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.5} />
            <XAxis 
              dataKey="name" 
              stroke="var(--fg-subtle)" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              tickMargin={10}
            />
            <YAxis 
              stroke="var(--fg-subtle)" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              tickMargin={10}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--panel)",
                borderColor: "var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
              }}
              itemStyle={{ color: "var(--fg)", fontWeight: "bold" }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--primary)"
              fillOpacity={1}
              fill="url(#colorCount)"
              strokeWidth={2}
              activeDot={{ r: 6, fill: "var(--primary)", stroke: "var(--bg)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}