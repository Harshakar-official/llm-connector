export const dynamic = "force-dynamic"
import { redirect } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { ProjectsClient } from "./ProjectsClient"
import { getAllowedProjectIds } from "@/lib/utils/security-guard"

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string; status?: string; type?: string; search?: string }>
}) {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get user's role and org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.org_id) {
    redirect("/dashboard")
  }

  const allowedProjectIds = await getAllowedProjectIds()
  const safeProjectIds = allowedProjectIds.length > 0 ? allowedProjectIds : ['00000000-0000-0000-0000-000000000000']

  // Parse query params
  const params = await searchParams
  const page = parseInt(params.page || "1")
  const limit = parseInt(params.limit || "24")
  const offset = (page - 1) * limit
  const statusFilter = params.status
  const typeFilter = params.type
  const searchQuery = params.search

  // Build query
  let query = supabase
    .from("projects")
    .select(`
      *,
      creator:profiles!projects_created_by_fkey(id, full_name, avatar_url, role),
      project_members(
        profile_id,
        profiles:profiles!project_members_profile_id_fkey(id, full_name, avatar_url, role)
      )
    `, { count: "exact" })
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  // Z+ SECURITY: Filter out projects the user doesn't have access to
  if (profile.role !== "admin") {
    query = query.in("id", safeProjectIds)
  }

  // Z+ ENTERPRISE ARCHIVE BEHAVIOR:
  // - "Archived" filter → show ONLY archived projects (SE can see their archived projects)
  // - No filter or other status filter → show ONLY active (non-archived) projects
  // This ensures SE doesn't lose archived projects — they can always find them via the filter.
  if (statusFilter === "archived") {
    query = query.eq("is_archived", true)
  } else {
    query = query.eq("is_archived", false)
    if (statusFilter) {
      query = query.eq("status", statusFilter)
    }
  }

  if (typeFilter) {
    query = query.eq("project_type", typeFilter)
  }

  if (searchQuery) {
    query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
  }

  // Execute
  const { data: projects, count } = await query

  // Get severity counts for each project
  const projectIds = projects?.map(p => p.id) || []
  let severityData: Record<string, { critical: number; high: number; medium: number; low: number; informational: number }> = {}

  if (projectIds.length > 0) {
    const { data: vulns } = await supabase
      .from("vulnerabilities")
      .select("project_id, severity")
      .eq("org_id", profile.org_id)
      .in("project_id", projectIds)
      .in("status", ["open", "in_review"])

    if (vulns) {
      const validSeverities = ["critical", "high", "medium", "low", "informational"] as const
      severityData = vulns.reduce<Record<string, { critical: number; high: number; medium: number; low: number; informational: number }>>((acc, v) => {
        if (!acc[v.project_id]) {
          acc[v.project_id] = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
        }
        if (validSeverities.includes(v.severity as typeof validSeverities[number])) {
          const sev = v.severity as "critical" | "high" | "medium" | "low" | "informational"
          acc[v.project_id][sev]++
        }
        return acc
      }, {})
    }
  }

  // Get total count for pagination
  const totalPages = Math.ceil((count || 0) / limit)

  return (
    <ProjectsClient
      initialProjects={projects || []}
      currentPage={page}
      totalPages={totalPages}
      totalCount={count || 0}
      severityData={severityData}
      userRole={profile.role}
      currentUserId={user.id}
    />
  )
}