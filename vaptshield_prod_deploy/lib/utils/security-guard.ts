import { getServerClient } from "@/lib/supabase/server"

/**
 * Z+ SECURITY: Global Tenancy Guard
 * This utility ensures that every server-side operation is strictly bound
 * to the user's organization. It prevents any cross-tenant data leakage.
 */
export async function getSafeSession() {
  const supabase = await getServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { user: null, profile: null, orgId: null, error: "Unauthorized" }
  }

  // Fetch verified profile from DB (JWT can be spoofed, DB is source of truth)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role, organizations(is_active)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return { user: user, profile: null, orgId: null, error: "Profile not found" }
  }

  // Enterprise Guard: Block access if Org is suspended
  const orgData = profile.organizations as { is_active?: boolean } | null
  const orgIsActive = orgData?.is_active ?? true
  if (profile.role !== 'super_admin' && !orgIsActive) {
      return { user: user, profile, orgId: profile.org_id, error: "Organization suspended" }
  }

  return {
    user: user,
    profile,
    orgId: profile.org_id,
    role: profile.role,
    error: null
  }
}

/**
 * Enforces that a database query is always filtered by the current user's org_id.
 * Use this in every single Server Action / API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scopeToOrg<T extends { eq: (column: string, value: string) => any }>(query: T, orgId: string | null): ReturnType<T["eq"]> {
  if (!orgId) throw new Error("Security Violation: Attempted scoped query without OrgID")
  return query.eq("org_id", orgId)
}

/**
 * Z+ SECURITY: Project Access Guard
 * Verifies if a user has access to a specific project based on their role and assignments.
 * Admin: Has access to all projects in the org.
 * PM/SE/Guest: Must be explicitly assigned to the project.
 */
export async function verifyProjectAccess(projectId: string) {
    const session = await getSafeSession()
    if (session.error || !session.orgId || !session.user) return { allowed: false, error: session.error || "Unauthorized" }
    
    const { orgId, user, role } = session

    const supabase = await getServerClient()

    // Admins have global access within their OWN org — but we still confirm the
    // project actually belongs to their org. Without this check an admin could
    // pass a projectId from a DIFFERENT tenant and be granted access (cross-tenant IDOR).
    if (role === 'admin') {
        const { data: adminProject } = await supabase
            .from("projects")
            .select("id")
            .eq("id", projectId)
            .eq("org_id", orgId)
            .maybeSingle()

        if (!adminProject) {
            return { allowed: false, error: "Access Denied: Project not found in your organization." }
        }
        return { allowed: true, orgId, user, role }
    }

    // Project creator is auto-added as member during creation (actions.ts:158-163).
    // No separate creator bypass needed — membership check handles it.
    const { data: membership } = await supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("profile_id", user.id)
        .single()
    
    if (!membership) {
        return { allowed: false, error: "Access Denied: You are not assigned to this project." }
    }
    
    return { allowed: true, orgId, user, role }
}

/**
 * Z+ SECURITY: Fetch all allowed project IDs for the current user.
 * Useful for dashboard metrics and global list queries.
 */
export async function getAllowedProjectIds(): Promise<string[]> {
    const session = await getSafeSession()
    if (session.error || !session.orgId || !session.user) return []

    const { orgId, user, role } = session
    const supabase = await getServerClient()

    if (role === 'admin') {
        const { data } = await supabase.from("projects").select("id").eq("org_id", orgId)
        return data?.map(p => p.id) || []
    }

    const { data: memberResult } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("profile_id", user.id)

    return memberResult?.map(m => m.project_id) || []
}
