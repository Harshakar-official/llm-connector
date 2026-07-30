export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { AnalyticsClient } from "@/components/super-admin/analytics/AnalyticsClient"

/**
 * Platform Analytics — Server Component
 * Z+ SECURITY: Uses server client (anon key + session) for all DB queries.
 * No service role key needed. Super admin role enforced via RLS + explicit check.
 */
export default async function SuperAdminAnalyticsPage() {
  const supabase = await getServerClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "super_admin") notFound()

  // ─── Fetch all analytics data in parallel ───

  const [
    { count: totalOrgs },
    { count: totalUsers },
    { count: totalScans },
    { count: totalFindings },
    { count: activeScans },
    { count: failedScans },
    { count: approvedFindings },
    { data: orgs },
    { data: users },
    { data: planData },
    { data: recentScans },
  ] = await Promise.all([
    supabase.from("organizations").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("scan_history").select("*", { count: "exact", head: true }),
    supabase.from("vulnerabilities").select("*", { count: "exact", head: true }),
    supabase.from("scan_history").select("*", { count: "exact", head: true }).eq("status", "running"),
    supabase.from("scan_history").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("vulnerabilities").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("organizations").select("created_at").order("created_at", { ascending: true }),
    supabase.from("profiles").select("created_at").order("created_at", { ascending: true }),
    supabase.from("org_quotas").select("plan_tier"),
    supabase
      .from("scan_history")
      .select("id, status, started_at, organizations!inner(name)")
      .order("started_at", { ascending: false })
      .limit(10),
  ])

  // ─── Build org growth data (cumulative monthly) ───
  const orgGrowth = buildCumulativeMonthly(orgs || [], "created_at")

  // ─── Build user growth data (cumulative monthly) ───
  const userGrowth = buildCumulativeMonthly(users || [], "created_at")

  // ─── Build plan distribution ───
  const planCounts: Record<string, number> = {}
  for (const row of planData || []) {
    const tier = row.plan_tier || "free"
    planCounts[tier] = (planCounts[tier] || 0) + 1
  }
  const planDistribution = Object.entries(planCounts).map(([name, value]) => ({ name, value }))

  // ─── Build recent scans ───
  const recentScanList = (recentScans || []).map((s) => ({
    id: s.id,
    org_name: (s.organizations as unknown as { name: string })?.name || "Unknown",
    status: s.status,
    started_at: s.started_at,
  }))

  // ─── Calculate Real Trends (Audit Fix #A14) ───
  const getTrend = (records: any[]) => {
    if (records.length < 2) return { value: "0%", up: true };
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const currentMonthCount = records.filter(r => new Date(r.created_at) >= lastMonth).length;
    const prevMonthCount = records.filter(r => {
        const d = new Date(r.created_at);
        return d >= twoMonthsAgo && d < lastMonth;
    }).length;

    if (prevMonthCount === 0) return { value: currentMonthCount > 0 ? "+100%" : "0%", up: true };
    const pct = Math.round(((currentMonthCount - prevMonthCount) / prevMonthCount) * 100);
    return { value: `${pct > 0 ? '+' : ''}${pct}%`, up: pct >= 0 };
  };

  const orgTrend = getTrend(orgs || []);
  const userTrend = getTrend(users || []);

  return (
    <AnalyticsClient
      data={{
        totalOrgs: totalOrgs || 0,
        totalUsers: totalUsers || 0,
        totalScans: totalScans || 0,
        totalFindings: totalFindings || 0,
        activeScans: activeScans || 0,
        failedScans: failedScans || 0,
        approvedFindings: approvedFindings || 0,
        orgGrowth,
        userGrowth,
        planDistribution,
        recentScans: recentScanList,
        orgTrend,
        userTrend
      }}
    />
  )
}

/**
 * Build cumulative monthly data from an array of records with a date field.
 * Fills gaps between months to ensure a continuous timeline.
 */
function buildCumulativeMonthly(
  records: { created_at: string }[],
  dateField: string
): { name: string; count: number }[] {
  if (records.length === 0) return []

  const monthlyMap = new Map<string, number>()
  let firstDate = new Date()
  let lastDate = new Date(0)

  // 1. Group by month and find range
  for (const record of records) {
    const date = new Date((record as Record<string, string>)[dateField])
    if (isNaN(date.getTime())) continue
    
    if (date < firstDate) firstDate = date
    if (date > lastDate) lastDate = date

    const key = date.toLocaleString("en-US", { month: "short", year: "numeric" })
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1)
  }

  // 2. Generate all months in range
  const sortedData: { name: string; count: number }[] = []
  const current = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
  const end = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1)
  
  let cumulative = 0
  
  while (current <= end) {
    const key = current.toLocaleString("en-US", { month: "short", year: "numeric" })
    const monthCount = monthlyMap.get(key) || 0
    cumulative += monthCount
    sortedData.push({ name: key, count: cumulative })
    
    // Move to next month
    current.setMonth(current.getMonth() + 1)
  }

  return sortedData
}