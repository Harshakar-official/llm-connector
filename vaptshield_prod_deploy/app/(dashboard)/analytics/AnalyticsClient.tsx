"use client"

import { 
  BarChart3, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Target
} from "lucide-react"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts"
import { Badge } from "@/components/ui/badge"

interface AnalyticsData {
  vulns: any[] | null
  projects: any[] | null
}

const SEVERITY_COLORS = {
  critical: "hsl(var(--critical))",
  high: "hsl(var(--high))",
  medium: "hsl(var(--medium))",
  low: "hsl(var(--low))",
  informational: "hsl(var(--info))"
}

export default function AnalyticsClient({ data }: { data: AnalyticsData | null }) {
  if (!data || !data.vulns) {
    return (
      <div className="p-6 space-y-6 max-w-[1440px] mx-auto text-center">
        <div className="bg-panel border border-border rounded-xl p-12">
            <BarChart3 className="h-12 w-12 text-fg-muted mx-auto mb-4" />
            <h2 className="text-xl font-bold">No Data Available</h2>
            <p className="text-fg-muted mt-2">You need to have at least one project with findings to see analytics.</p>
        </div>
      </div>
    )
  }

  const { vulns, projects } = data

  // ── 1. Severity Distribution ─────────────────────────────────
  const severityCounts = vulns.reduce((acc: any, v: any) => {
    acc[v.severity] = (acc[v.severity] || 0) + 1
    return acc
  }, {})

  const pieData = Object.entries(severityCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: SEVERITY_COLORS[name as keyof typeof SEVERITY_COLORS] || "hsl(var(--fg-muted))"
  })).sort((a, b) => (b.value as number) - (a.value as number))

  // ── 2. Remediation Progress ──────────────────────────────────
  const statusCounts = vulns.reduce((acc: any, v: any) => {
    const group = ['resolved', 'verified', 'closed'].includes(v.status) ? 'Resolved' : 'Active'
    acc[group] = (acc[group] || 0) + 1
    return acc
  }, {})

  const progressData = [
    { name: 'Active', value: statusCounts.Active || 0 },
    { name: 'Resolved', value: statusCounts.Resolved || 0 }
  ]

  // ── 3. MTTR Calculation ──────────────────────────────────────
  const resolvedVulns = vulns.filter((v: any) => v.resolved_at && v.created_at)
  const mttrDays = resolvedVulns.length > 0 
    ? resolvedVulns.reduce((sum: number, v: any) => {
        const diff = new Date(v.resolved_at).getTime() - new Date(v.created_at).getTime()
        return sum + (diff / (1000 * 60 * 60 * 24))
      }, 0) / resolvedVulns.length
    : 0

  // ── 4. Discovery Trend (Last 30 Days) ────────────────────────
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    return d.toLocaleDateString("en-CA")
  })

  const trendData = last30Days.map(date => {
    const discovered = vulns.filter((v: any) => new Date(v.created_at).toLocaleDateString("en-CA") === date).length
    const resolved = vulns.filter((v: any) => v.resolved_at && new Date(v.resolved_at).toLocaleDateString("en-CA") === date).length
    return { date, discovered, resolved }
  })

  // ── 5. Top Vulnerable Projects ───────────────────────────────
  const projectStats = projects?.map(p => {
    const pVulns = vulns.filter(v => v.project_id === p.id)
    return {
      name: p.name,
      critical: pVulns.filter(v => v.severity === 'critical').length,
      high: pVulns.filter(v => v.severity === 'high').length,
      total: pVulns.length
    }
  }).sort((a, b) => b.total - a.total).slice(0, 5) || []

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-fg">
            Security <span className="text-primary">Analytics</span>
          </h1>
          <p className="text-sm text-fg-muted font-medium">Deep forensic insights into organizational risk posture.</p>
        </div>
        <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold px-3 py-1">
                LIVE METRICS
            </Badge>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-panel border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Target className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Mean Time to Fix</span>
            </div>
            <div className="text-2xl font-black font-mono text-fg">
                {mttrDays.toFixed(1)} <span className="text-xs text-fg-muted font-sans uppercase">Days</span>
            </div>
        </div>
        <div className="bg-panel border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-success/10 text-success">
                    <CheckCircle2 className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Resolution Rate</span>
            </div>
            <div className="text-2xl font-black font-mono text-fg">
                {vulns.length > 0 ? ((statusCounts.Resolved || 0) / vulns.length * 100).toFixed(1) : 0}%
            </div>
        </div>
        <div className="bg-panel border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-warning/10 text-warning">
                    <ShieldAlert className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Critical Density</span>
            </div>
            <div className="text-2xl font-black font-mono text-fg">
                {vulns.length > 0 ? ((severityCounts.critical || 0) / vulns.length * 100).toFixed(1) : 0}%
            </div>
        </div>
        <div className="bg-panel border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-info/10 text-info">
                    <BarChart3 className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Total Findings</span>
            </div>
            <div className="text-2xl font-black font-mono text-fg">
                {vulns.length}
            </div>
        </div>
      </div>

      {/* ── Visualizations ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Trend Chart */}
        <div className="bg-panel border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted mb-6 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Discovery vs Resolution (30D)
            </h3>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                        <defs>
                            <linearGradient id="colorDiscovered" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: 'hsl(var(--fg-muted))', fontSize: 10}}
                            tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--fg-muted))', fontSize: 10}} />
                        <Tooltip 
                            contentStyle={{backgroundColor: 'hsl(var(--panel))', borderColor: 'hsl(var(--border))', fontSize: 12, borderRadius: '8px'}}
                            itemStyle={{fontWeight: 'bold'}}
                        />
                        <Area type="monotone" dataKey="discovered" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorDiscovered)" strokeWidth={2} name="Discovered" />
                        <Area type="monotone" dataKey="resolved" stroke="hsl(var(--success))" fillOpacity={1} fill="url(#colorResolved)" strokeWidth={2} name="Resolved" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Severity Donut */}
        <div className="bg-panel border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted mb-6 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" /> Risk Concentration
            </h3>
            <div className="h-64 w-full flex flex-col md:flex-row items-center justify-center gap-8">
                <div className="h-48 w-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2">
                    {pieData.map((d, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full" style={{backgroundColor: d.color}} />
                            <span className="text-xs font-bold text-fg w-20">{d.name}</span>
                            <span className="text-xs font-mono text-fg-muted">{d.value as number}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Top Projects */}
        <div className="lg:col-span-2 bg-panel border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted mb-6 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" /> High-Risk Business Assets
            </h3>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="text-[10px] font-black uppercase tracking-widest text-fg-muted border-b border-border">
                            <th className="px-4 py-3 text-left">Project Identity</th>
                            <th className="px-4 py-3 text-left">Critical</th>
                            <th className="px-4 py-3 text-left">High</th>
                            <th className="px-4 py-3 text-left">Total Findings</th>
                            <th className="px-4 py-3 text-right">Risk Score</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {projectStats.map((p, i) => (
                            <tr key={i} className="hover:bg-panel-hover transition-colors">
                                <td className="px-4 py-4">
                                    <span className="text-sm font-bold text-fg">{p.name}</span>
                                </td>
                                <td className="px-4 py-4">
                                    <Badge className="bg-critical/10 text-critical border-critical/20 text-[10px] font-black uppercase">
                                        {p.critical}
                                    </Badge>
                                </td>
                                <td className="px-4 py-4">
                                    <Badge className="bg-high/10 text-high border-high/20 text-[10px] font-black uppercase">
                                        {p.high}
                                    </Badge>
                                </td>
                                <td className="px-4 py-4 font-mono text-xs text-fg-muted">
                                    {p.total}
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="h-1.5 w-24 bg-bg-subtle rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-primary" 
                                                style={{width: `${Math.min(100, (p.critical * 40 + p.high * 15))}%`}} 
                                            />
                                        </div>
                                        <span className="text-[10px] font-black font-mono">
                                            {(p.critical * 10 + p.high * 5).toFixed(1)}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

      </div>
    </div>
  )
}
