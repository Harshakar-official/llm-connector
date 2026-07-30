export const dynamic = "force-dynamic"
import { redirect } from "next/navigation"
import { StatCards, DashboardStats } from "@/components/dashboard/StatCards"
import nextDynamic from "next/dynamic"
import type { VulnTrendData } from "@/components/dashboard/VulnEvolutionChart"
import type { SeverityData } from "@/components/dashboard/SeverityDonut"
import type { ProjectVulnCount } from "@/components/dashboard/TopProjectsCard"
import type { ScanData } from "@/components/dashboard/ScanHistoryChart"

const VulnEvolutionChart = nextDynamic(() => import("@/components/dashboard/VulnEvolutionChart").then(m => m.VulnEvolutionChart), { loading: () => <div className="animate-pulse h-[300px] w-full bg-bg-muted/50 rounded-xl" /> })
const SeverityDonut = nextDynamic(() => import("@/components/dashboard/SeverityDonut").then(m => m.SeverityDonut), { loading: () => <div className="animate-pulse h-[300px] w-full bg-bg-muted/50 rounded-xl" /> })
const TopProjectsCard = nextDynamic(() => import("@/components/dashboard/TopProjectsCard").then(m => m.TopProjectsCard), { loading: () => <div className="animate-pulse h-[300px] w-full bg-bg-muted/50 rounded-xl" /> })
const ScanHistoryChart = nextDynamic(() => import("@/components/dashboard/ScanHistoryChart").then(m => m.ScanHistoryChart), { loading: () => <div className="animate-pulse h-[300px] w-full bg-bg-muted/50 rounded-xl" /> })
import { LatestAlertsTable, Alert } from "@/components/dashboard/LatestAlertsTable"
import { getServerClient } from "@/lib/supabase/server"
import { getAllowedProjectIds } from "@/lib/utils/security-guard"
import { getServerDateRange } from "@/lib/utils/date-server"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"

// Define VulnQueryResult explicitly so TS knows the structure
interface VulnQueryResult {
  id: string
  title: string
  severity: string
  created_at: string
  project_id: string
  projects: { name: string } | null
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; range?: string }>
}) {
  const params = await searchParams
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single()

  if (!profile) {
      redirect("/login?error=profile_missing")
  }

  // REDIRECT: Super Admin should see the platform dashboard
  if (profile.role === "super_admin") {
    redirect("/super-admin/dashboard")
  }

  const allowedProjectIds = await getAllowedProjectIds()

  let orgName = "Your Organization"
  if (profile?.org_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", profile.org_id)
      .single()
    if (org) orgName = org.name
  }

  // Date Logic
  const { from, to } = getServerDateRange(params)
  
  // PREVIOUS PERIOD CALCULATION for trends
  const duration = to.getTime() - from.getTime()
  const prevTo = new Date(from.getTime() - 1)
  const prevFrom = new Date(prevTo.getTime() - duration)

  // Human-friendly date range text
  const rangeLabels: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    this_month: "This Month",
    last_month: "Last Month",
  }
  const dateRangeText = params.range
    ? rangeLabels[params.range] || `Last ${params.range}`
    : params.from && params.to
      ? "Custom range"
      : "Last 30 days"

  // For single-day presets (today/yesterday), the client sends local TZ boundaries
  // as UTC timestamps. The `from` land on the previous UTC date for TZs ahead
  // of UTC (e.g. IST). Use only the `to` date for the label to avoid showing a
  // misleading two-day range like "May 15 – May 16" for "Today".
  const isSingleDayPreset = params.range === "today" || params.range === "yesterday"
  const dateRangeLabel = isSingleDayPreset
    ? to.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`

  // Trend Label Logic
  let trendLabel = "from last period"
  if (params.range === "7d") trendLabel = "from last week"
  else if (params.range === "30d" || !params.range) trendLabel = "from last month"
  else if (params.range === "90d") trendLabel = "from last quarter"
  else if (params.range === "today") trendLabel = "vs yesterday"
  else if (params.range === "yesterday") trendLabel = "vs day before"
  else if (params.range === "this_month") trendLabel = "vs last month"
  else if (params.range === "last_month") trendLabel = "vs month before"

  // ==========================================
  // SERVER-SIDE AGGREGATION & DATA FETCHING
  // ==========================================

  // Early return: if non-admin user has zero allowed projects, skip all queries
  if (allowedProjectIds.length === 0 && profile.role !== 'admin') {
    const emptyStats: DashboardStats = {
      totalProjects: 0,
      totalProjectsTrend: { value: 0, label: trendLabel },
      criticalFindings: 0,
      criticalFindingsTrend: { value: 0, label: trendLabel },
      successfulScans: 0,
      successfulScansTrend: { value: 0, label: trendLabel },
      failedScans: 0,
      failedScansTrend: { value: 0, label: trendLabel },
    }
    return (
      <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
        <DashboardHeader orgName={orgName} dateRangeText={dateRangeText} stats={emptyStats} alerts={[]} />
        <StatCards stats={emptyStats} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
          <div className="lg:col-span-7">
            <VulnEvolutionChart data={[]} dateRangeLabel={dateRangeLabel} />
          </div>
          <div className="lg:col-span-3">
            <SeverityDonut data={[]} dateRangeLabel={dateRangeLabel} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopProjectsCard projects={[]} dateRangeLabel={dateRangeLabel} />
          <ScanHistoryChart data={[]} dateRangeLabel={dateRangeLabel} />
        </div>
        <LatestAlertsTable alerts={[]} dateRangeLabel={dateRangeLabel} />
        <div className="text-center text-xs text-fg-subtle pt-2">
          Dashboard showing live data from your Supabase database
        </div>
      </div>
    )
  }

  const safeProjectIds = allowedProjectIds

  // 1. Current Period Queries
  const projectsQuery = profile.role === 'admin'
    ? supabase.from("projects").select("id, name, created_at").eq("org_id", profile.org_id).eq("is_archived", false).lte("created_at", to.toISOString())
    : supabase.from("projects").select("id, name, created_at").in("id", safeProjectIds).eq("is_archived", false).lte("created_at", to.toISOString())
  
  // 2. Previous Period Queries (for Trends)
  const prevProjectsQuery = profile.role === 'admin'
    ? supabase.from("projects").select("id").eq("org_id", profile.org_id).eq("is_archived", false).lte("created_at", prevTo.toISOString())
    : supabase.from("projects").select("id").in("id", safeProjectIds).eq("is_archived", false).lte("created_at", prevTo.toISOString())

  // 3. AGGREGATED QUERIES
  // Critical Findings for the CURRENT PERIOD ONLY (to align with graphs)
  const periodCriticalQuery = supabase.from("vulnerabilities")
      .select("id", { count: 'exact', head: true })
      .eq("org_id", profile.org_id)
      .eq("severity", "critical")
      .in("status", ["open", "reopened", "in_progress", "resolved", "verified"])
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())

  const [
    { data: projects },
    { data: scanHistory },
    { data: vulns },
    { data: latestVulns },
    // Trend Data
    { data: prevScanHistory },
    { data: prevVulns },
    { data: prevProjects },
    { count: periodOpenCriticalCount }
  ] = await Promise.all([
    projectsQuery,
    supabase.from("scan_history")
      .select("status, started_at, scan_type")
      .eq("org_id", profile.org_id)
      .in("project_id", safeProjectIds)
      .gte("started_at", from.toISOString())
      .lte("started_at", to.toISOString()),
    supabase.from("vulnerabilities")
      .select("id, project_id, severity, status, created_at")
      .eq("org_id", profile.org_id)
      .in("project_id", safeProjectIds)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString()),
    supabase.from("vulnerabilities")
      .select("id, title, severity, created_at, project_id, projects(name)")
      .eq("org_id", profile.org_id)
      .in("project_id", safeProjectIds)
      .in("severity", ["critical", "high"])
      .in("status", ["open", "reopened", "in_progress", "resolved", "verified"])
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(10),
    // Previous Scan History
    supabase.from("scan_history")
      .select("status")
      .eq("org_id", profile.org_id)
      .in("project_id", safeProjectIds)
      .gte("started_at", prevFrom.toISOString())
      .lte("started_at", prevTo.toISOString()),
    // Previous Vulns
    supabase.from("vulnerabilities")
      .select("severity, status")
      .eq("org_id", profile.org_id)
      .in("project_id", safeProjectIds)
      .gte("created_at", prevFrom.toISOString())
      .lte("created_at", prevTo.toISOString()),
    // Previous Projects
    prevProjectsQuery,
    periodCriticalQuery
  ])

  // StatCards Data Calculation
  const successfulScans = scanHistory?.filter((s) => s.status === "completed").length || 0
  const failedScans = scanHistory?.filter((s) => s.status === "failed").length || 0
  
  // KPI Logic: Respect Date Range for primary card value
  const projectsInPeriodCount = projects?.filter(p => 
    new Date(p.created_at) >= from && new Date(p.created_at) <= to
  ).length || 0

  const criticalFindings = periodOpenCriticalCount || 0
  
  // Previous Period Stats
  const prevSuccessfulScans = prevScanHistory?.filter((s) => s.status === "completed").length || 0
  const prevFailedScans = prevScanHistory?.filter((s) => s.status === "failed").length || 0
  const prevCriticalFindings = prevVulns?.filter(v => v.severity === 'critical' && ['open', 'reopened', 'in_progress', 'resolved', 'verified'].includes(v.status)).length || 0
  const prevProjectsCount = prevProjects?.length || 0

  const statCardsData: DashboardStats = {
    totalProjects: projectsInPeriodCount,
    totalProjectsTrend: {
        value: (projects?.length || 0) - prevProjectsCount,
        label: trendLabel
    },
    criticalFindings,
    criticalFindingsTrend: {
        value: criticalFindings - prevCriticalFindings,
        label: trendLabel
    },
    successfulScans,
    successfulScansTrend: {
        value: successfulScans - prevSuccessfulScans,
        label: trendLabel
    },
    failedScans,
    failedScansTrend: {
        value: failedScans - prevFailedScans,
        label: trendLabel
    }
  }

  // Top Projects Data (Solving N+1)
  const projectVulnCountMap: Record<string, { critical: number; high: number }> = {}
  projects?.forEach(p => projectVulnCountMap[p.id] = { critical: 0, high: 0 })
  
  vulns?.filter(v => ['open', 'reopened', 'in_progress', 'resolved', 'verified'].includes(v.status)).forEach(v => {
    if (projectVulnCountMap[v.project_id]) {
      if (v.severity === 'critical') projectVulnCountMap[v.project_id].critical++
      if (v.severity === 'high') projectVulnCountMap[v.project_id].high++
    }
  })

  const topProjectsData: ProjectVulnCount[] = projects?.map(p => {
    const counts = projectVulnCountMap[p.id] || { critical: 0, high: 0 }
    return {
      project_id: p.id,
      project_name: p.name,
      critical: counts.critical,
      high: counts.high,
      total: counts.critical + counts.high
    }
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 5) || []

  // SeverityDonut Data
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
  vulns?.forEach((v) => {
    if (v.severity === "critical") severityCounts.critical++
    else if (v.severity === "high") severityCounts.high++
    else if (v.severity === "medium") severityCounts.medium++
    else if (v.severity === "low") severityCounts.low++
    else if (v.severity === "informational") severityCounts.informational++
  })

  const severityDonutData: SeverityData[] = [
    { name: "Critical", value: severityCounts.critical, color: "hsl(var(--critical))" },
    { name: "High", value: severityCounts.high, color: "hsl(var(--high))" },
    { name: "Medium", value: severityCounts.medium, color: "hsl(var(--medium))" },
    { name: "Low", value: severityCounts.low, color: "hsl(var(--low))" },
    { name: "Info", value: severityCounts.informational, color: "hsl(var(--info))" },
  ].filter(d => d.value > 0)

  // VulnEvolution Data - Pre-populate with all dates in range for a continuous timeline
  const vulnEvoGrouped: Record<string, { critical: number; high: number; medium: number; low: number }> = {}
  const scanDataGrouped: Record<string, ScanData> = {}

  // Fill date gaps
  const currentDay = new Date(from)
  while (currentDay <= to) {
    const dateKey = currentDay.toLocaleDateString("en-CA")
    vulnEvoGrouped[dateKey] = { critical: 0, high: 0, medium: 0, low: 0 }
    scanDataGrouped[dateKey] = { date: dateKey, zap: 0, semgrep: 0, trivy: 0, gitleaks: 0, manual: 0 }
    currentDay.setDate(currentDay.getDate() + 1)
  }

  vulns?.forEach((v) => {
    const date = new Date(v.created_at).toLocaleDateString("en-CA")
    if (vulnEvoGrouped[date]) {
      if (v.severity === "critical") vulnEvoGrouped[date].critical++
      else if (v.severity === "high") vulnEvoGrouped[date].high++
      else if (v.severity === "medium") vulnEvoGrouped[date].medium++
      else if (v.severity === "low") vulnEvoGrouped[date].low++
    }
  })

  const evolutionData: VulnTrendData[] = Object.entries(vulnEvoGrouped).map(([date, counts]) => ({
    date,
    ...counts
  })).sort((a, b) => a.date.localeCompare(b.date))

  // Latest Alerts Data (High/Critical findings)
  const latestAlertsData: Alert[] = latestVulns?.map(v => ({
    id: v.id,
    title: v.title,
    severity: v.severity as any,
    project_id: v.project_id,
    project_name: (v.projects as unknown as { name: string })?.name || "Unknown Project",
    created_at: v.created_at
  })) || []

  // Scan History Data
  scanHistory?.forEach(s => {
      const date = new Date(s.started_at).toLocaleDateString("en-CA")
      if (scanDataGrouped[date]) {
          const type = s.scan_type?.toLowerCase() || 'manual'
          if (type === 'zap') scanDataGrouped[date].zap++
          else if (type === 'semgrep') scanDataGrouped[date].semgrep++
          else if (type === 'trivy') scanDataGrouped[date].trivy++
          else if (type === 'gitleaks') scanDataGrouped[date].gitleaks++
          else scanDataGrouped[date].manual++
      }
  })
  const scanHistoryData = Object.values(scanDataGrouped).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto animate-in fade-in duration-700">
      <DashboardHeader 
        orgName={orgName} 
        dateRangeText={dateRangeText} 
        stats={statCardsData} 
        alerts={latestAlertsData} 
      />
      
      <StatCards stats={statCardsData} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
        <div className="lg:col-span-7">
          <VulnEvolutionChart data={evolutionData} dateRangeLabel={dateRangeLabel} />
        </div>
        <div className="lg:col-span-3">
          <SeverityDonut data={severityDonutData} dateRangeLabel={dateRangeLabel} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopProjectsCard projects={topProjectsData} dateRangeLabel={dateRangeLabel} />
        <ScanHistoryChart 
            data={scanHistoryData} 
            dateRangeLabel={dateRangeLabel} 
        />
      </div>

      <LatestAlertsTable alerts={latestAlertsData} dateRangeLabel={dateRangeLabel} />

      {/* Footer note */}
      <div className="text-center text-xs text-fg-subtle pt-2">
        Dashboard showing live data from your Supabase database
      </div>
    </div>
  )
}
