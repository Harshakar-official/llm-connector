export const dynamic = "force-dynamic"

import { getServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AnalyticsClient from "./AnalyticsClient"
import { getAllowedProjectIds } from "@/lib/utils/security-guard"
import { getServerDateRange } from "@/lib/utils/date-server"

export default async function AnalyticsPage({
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

  if (!profile || !profile.org_id) {
    redirect("/login?error=profile_missing")
  }

  const { from, to } = getServerDateRange(params)
  const allowedProjectIds = await getAllowedProjectIds()
  
  if (allowedProjectIds.length === 0 && profile.role !== 'admin') {
      return <AnalyticsClient data={null} />
  }

  // 1. Fetch Overall Stats within range
  const { data: vulns } = await supabase
    .from("vulnerabilities")
    .select("id, severity, status, created_at, resolved_at, project_id")
    .eq("org_id", profile.org_id)
    .in("project_id", allowedProjectIds)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())

  // 2. Fetch Project Names for Mapping
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("org_id", profile.org_id)
    .in("id", allowedProjectIds)

  return <AnalyticsClient data={{ vulns, projects }} />
}
