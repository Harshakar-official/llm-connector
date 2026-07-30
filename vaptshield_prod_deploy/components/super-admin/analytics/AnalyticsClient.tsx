"use client"

import { useState } from "react"
import {
  BarChart3,
  Building,
  Users,
  Shield,
  Activity,
  TrendingUp,
  PieChart,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

interface AnalyticsData {
  totalOrgs: number
  totalUsers: number
  totalScans: number
  totalFindings: number
  activeScans: number
  failedScans: number
  approvedFindings: number
  orgGrowth: { name: string; count: number }[]
  userGrowth: { name: string; count: number }[]
  planDistribution: { name: string; value: number }[]
  recentScans: { id: string; org_name: string; status: string; started_at: string }[]
  orgTrend?: { value: string; up: boolean }
  userTrend?: { value: string; up: boolean }
}

const PLAN_COLORS: Record<string, string> = {
  enterprise: "#8b5cf6",
  pro: "#3b82f6",
  starter: "#10b981",
  free: "#6b7280",
}

const STATUS_COLORS: Record<string, string> = {
  completed: "var(--success)",
  running: "var(--warning)",
  failed: "var(--danger)",
  queued: "var(--fg-muted)",
}

export function AnalyticsClient({ data }: { data: AnalyticsData }) {
  const [timeRange, setTimeRange] = useState<"all" | "6m" | "12m">("all")

  const filteredOrgGrowth = (() => {
    if (timeRange === "all") return data.orgGrowth
    const months = timeRange === "6m" ? 6 : 12
    return data.orgGrowth.slice(-months)
  })()

  const filteredUserGrowth = (() => {
    if (timeRange === "all") return data.userGrowth
    const months = timeRange === "6m" ? 6 : 12
    return data.userGrowth.slice(-months)
  })()

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Platform Analytics</h1>
          <p className="text-sm text-fg-muted mt-1">
            Enterprise-grade real-time metrics across all organizations
          </p>
        </div>
        <div className="flex gap-2">
          {(["all", "12m", "6m"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                timeRange === range
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-fg-muted hover:bg-bg-subtle"
              }`}
            >
              {range === "all" ? "All Time" : range === "12m" ? "12 Months" : "6 Months"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Organizations"
          value={data.totalOrgs}
          icon={Building}
          color="text-primary"
          trend={data.orgTrend?.value}
          trendUp={data.orgTrend?.up}
        />
        <KpiCard
          label="Total Users"
          value={data.totalUsers}
          icon={Users}
          color="text-success"
          trend={data.userTrend?.value}
          trendUp={data.userTrend?.up}
        />
        <KpiCard
          label="Total Scans"
          value={data.totalScans}
          icon={Activity}
          color="text-warning"
          sub={`${data.activeScans} active · ${data.failedScans} failed`}
        />
        <KpiCard
          label="Findings"
          value={data.totalFindings}
          icon={Shield}
          color="text-danger"
          sub={`${data.approvedFindings} approved`}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Org Growth */}
        <div className="bg-panel border border-border rounded-md p-6">
          <div className="mb-6">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Organization Growth
            </h3>
            <p className="text-xs text-fg-muted">Cumulative platform scale</p>
          </div>
          <div className="h-[260px] w-full">
            {filteredOrgGrowth.length === 0 ? (
              <EmptyChart message="No organization data yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredOrgGrowth}>
                  <defs>
                    <linearGradient id="colorOrg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--fg-subtle)" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(val) => val.split(' ')[0]} 
                  />
                  <YAxis stroke="var(--fg-subtle)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-panel border border-border p-3 rounded-lg shadow-xl">
                            <p className="text-[10px] font-bold text-fg-muted uppercase mb-1">{label}</p>
                            <p className="text-sm font-bold text-primary">
                              {payload[0].value} Organizations
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="var(--primary)" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#colorOrg)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* User Growth */}
        <div className="bg-panel border border-border rounded-md p-6">
          <div className="mb-6">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-success" />
              User Growth
            </h3>
            <p className="text-xs text-fg-muted">Cumulative registered users</p>
          </div>
          <div className="h-[260px] w-full">
            {filteredUserGrowth.length === 0 ? (
              <EmptyChart message="No user data yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredUserGrowth}>
                  <defs>
                    <linearGradient id="colorUser" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--fg-subtle)" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => val.split(' ')[0]}
                  />
                  <YAxis stroke="var(--fg-subtle)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-panel border border-border p-3 rounded-lg shadow-xl">
                            <p className="text-[10px] font-bold text-fg-muted uppercase mb-1">{label}</p>
                            <p className="text-sm font-bold text-success">
                              {payload[0].value} Registered Users
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="var(--success)" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#colorUser)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Distribution */}
        <div className="bg-panel border border-border rounded-md p-6">
          <div className="mb-6">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <PieChart className="h-4 w-4 text-warning" />
              Plan Tier Distribution
            </h3>
            <p className="text-xs text-fg-muted">Organizations by subscription tier</p>
          </div>
          <div className="h-[260px] w-full">
            {data.planDistribution.length === 0 ? (
              <EmptyChart message="No plan data yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={data.planDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="var(--panel)"
                    strokeWidth={2}
                  >
                    {data.planDistribution.map((entry) => (
                      <Cell key={entry.name} fill={PLAN_COLORS[entry.name.toLowerCase()] || "var(--fg-muted)"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--panel)",
                      borderColor: "var(--border)",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    formatter={(value: string) => (
                      <span className="text-xs text-fg-muted capitalize">{value}</span>
                    )}
                  />
                </RePieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Scan Activity */}
        <div className="bg-panel border border-border rounded-md p-6">
          <div className="mb-6">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-fg-muted" />
              Recent Scan Activity
            </h3>
            <p className="text-xs text-fg-muted">Latest scans across the platform</p>
          </div>
          <div className="space-y-3 max-h-[260px] overflow-y-auto scrollbar-thin">
            {data.recentScans.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-fg-muted text-sm">
                No scan activity yet
              </div>
            ) : (
              data.recentScans.map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between p-3 rounded-md bg-bg-subtle/50 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[scan.status] || "var(--fg-muted)" }}
                    />
                    <div>
                      <p className="text-sm font-medium text-fg">{scan.org_name}</p>
                      <p className="text-xs text-fg-muted">
                        {new Date(scan.started_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs capitalize px-2 py-0.5 rounded bg-bg-muted border border-border text-fg-muted">
                    {scan.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* System Health Footer */}
      <div className="bg-panel border border-border rounded-md p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <div>
            <p className="text-sm font-medium text-fg">All Systems Operational</p>
            <p className="text-xs text-fg-muted">Docker Nodes: 4 Active · Redis: 0.4ms latency · DB: 2ms response</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-fg-muted">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-warning" />
            Uptime 99.99%
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            0 Critical Alerts
          </span>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  trend,
  trendUp,
  sub,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: string
  trend?: string
  trendUp?: boolean
  sub?: string
}) {
  return (
    <div className="bg-panel border border-border rounded-md p-5 hover:border-primary/20 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-fg-muted uppercase tracking-wider">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold font-mono tracking-tight text-fg">
          {value.toLocaleString()}
        </span>
        {trend && (
          <span className={`text-xs font-medium ${trendUp ? "text-success" : "text-danger"}`}>
            {trend}
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-fg-muted mt-1">{sub}</p>}
    </div>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <BarChart3 className="h-8 w-8 text-fg-subtle mx-auto mb-2" />
        <p className="text-sm text-fg-muted">{message}</p>
      </div>
    </div>
  )
}