import { getServerClient } from "@/lib/supabase/server"

/**
 * Z+ SECURITY: Central Quota Engine
 * Prevents resource abuse and ensures commercial tier compliance.
 * 
 * Flow:
 * 1. Fetch current org's max limits from 'org_quotas'
 * 2. Fetch current active counts from respective tables
 * 3. Compare and throw error if limit reached
 */
export async function checkQuota(orgId: string, type: 'projects' | 'users') {
  // Z+ FIX: Always use server client (user session) for quota checks.
  // Admin client may have invalid/expired service role keys causing cryptic errors.
  const supabase = await getServerClient()

  // 1. Get Quota Limits
  const { data: quota, error: quotaError } = await supabase
    .from("org_quotas")
    .select("max_projects, max_users")
    .eq("org_id", orgId)
    .single()

  if (quotaError) {
    // If quota row doesn't exist yet (new org), allow with defaults
    if ((quotaError as unknown as Record<string,unknown>).code === 'PGRST116') {
      return {
          allowed: true,
          current: 0,
          limit: type === 'projects' ? 5 : 10
      }
    }
    // Real error — throw as proper Error
    return { allowed: false, current: 0, limit: type === 'projects' ? 5 : 10, error: "Quota check failed" }
  }

  if (!quota) {
    return {
        allowed: true,
        current: 0,
        limit: type === 'projects' ? 5 : 10
    }
  }

  // 2. Check current usage
  if (type === 'projects') {
    const { count, error } = await supabase
      .from("projects")
      .select("*", { count: 'exact', head: true })
      .eq("org_id", orgId)
      .eq("is_archived", false)

    if (error) return { allowed: false, current: 0, limit: quota.max_projects, error: "Quota check failed" }

    const limit = quota.max_projects
    if ((count ?? 0) >= limit) {
      return { allowed: false, current: count ?? 0, limit, error: "Project limit reached. Please upgrade your plan to create more projects." }
    }
    return { allowed: true, current: count ?? 0, limit }
  }

  if (type === 'users') {
    const { count, error } = await supabase
      .from("profiles")
      .select("*", { count: 'exact', head: true })
      .eq("org_id", orgId)

    if (error) return { allowed: false, current: 0, limit: quota.max_users, error: "Quota check failed" }

    const limit = quota.max_users
    if ((count ?? 0) >= limit) {
      return { allowed: false, current: count ?? 0, limit, error: "User seat limit reached. Please upgrade your plan to invite more team members." }
    }
    return { allowed: true, current: count ?? 0, limit }
  }

  return { allowed: true }
}
