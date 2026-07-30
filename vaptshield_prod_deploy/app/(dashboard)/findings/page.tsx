export const dynamic = "force-dynamic"
import { redirect } from "next/navigation"
import { getSafeSession, getAllowedProjectIds } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import { FindingsClient } from "./FindingsClient"

interface Props {
  searchParams: Promise<{ project?: string }>
}

export default async function FindingsPage({ searchParams }: Props) {
  const { project: projectId } = await searchParams
  const { orgId, error, role, user } = await getSafeSession()

  // Z+ Security Check
  if (error) {
    if (error === "Organization suspended") {
      redirect("/login?error=suspended")
    }
    redirect("/login")
  }

  // Double Check: Super Admins should be redirected to platform dashboard
  if (role === "super_admin") {
    redirect("/super-admin/dashboard")
  }

  if (!orgId || !user) redirect("/dashboard")

  const supabase = await getServerClient()

  // ─── Z+ RBAC Security: Filter allowed projects ───
  const allowedProjectIds = await getAllowedProjectIds()
  const safeProjectIds = allowedProjectIds.length > 0 ? allowedProjectIds : ['00000000-0000-0000-0000-000000000000']

  // Parallel fetch: projects, members, and severity counts (aggregate query)
  // ─── Z+ UX: Filter severity counts by project if selected ───
  let severityQuery = supabase
      .from("vulnerabilities")
      .select("severity, status")
      .eq("org_id", orgId)
      .not("status", "in", '("resolved","false_positive")')
  
  if (projectId && projectId !== "all") {
      severityQuery = severityQuery.eq("project_id", projectId)
  }

  // Only count severity for allowed projects if not admin
  if (role !== "admin") {
      severityQuery = severityQuery.in("project_id", safeProjectIds)
  }

  // Build project query with RBAC
  let projectQuery = supabase
      .from("projects")
      .select("id, name")
      .eq("org_id", orgId)
      .order("name")
  
  if (role !== "admin") {
      projectQuery = projectQuery.in("id", safeProjectIds)
  }

  const [{ data: projects }, { data: members }, { data: severityAgg }] = await Promise.all([
    projectQuery,
    supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .eq("org_id", orgId)
        .order("full_name"),
    severityQuery
  ])

  // Calculate total severity counts from aggregate data (server-side filtering)
  const severityCounts = {
    critical: severityAgg?.filter(f => f.severity === 'critical').length || 0,
    high: severityAgg?.filter(f => f.severity === 'high').length || 0,
    medium: severityAgg?.filter(f => f.severity === 'medium').length || 0,
    low: severityAgg?.filter(f => f.severity === 'low').length || 0,
    informational: severityAgg?.filter(f => f.severity === 'informational').length || 0,
  }

  return (
    <div className="p-6">
      <FindingsClient
        orgId={orgId}
        projects={projects || []}
        members={members || []}
        userRole={role || "guest"}
        severityCounts={severityCounts}
      />
    </div>
  )
}
