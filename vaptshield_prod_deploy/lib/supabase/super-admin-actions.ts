"use server"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logAudit } from "@/lib/utils/audit-server"
import { getServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { getPlatformSettingsMap } from "@/lib/utils/platform-settings"
import { getPlanLimits, DEFAULT_PLAN } from "@/lib/config/plans"

// ─── Z+ SECURITY: Input Sanitization Utilities ────────────────────

/** Allowed industries — whitelist approach prevents injection */
const ALLOWED_INDUSTRIES = [
  "Technology", "Finance", "Healthcare", "Government",
  "E-commerce", "Education", "Other"
] as const

/** HTML tag pattern — strips any HTML/XML tags */
const HTML_TAG_RE = /<[^>]*>/g

/** URL pattern — must be http/https with valid domain */
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i

/** Slug pattern — lowercase alphanumeric + hyphens only */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Name pattern — letters, numbers, spaces, basic punctuation (no HTML) */
const NAME_RE = /^[a-zA-Z0-9\s\-_&.,'()]+$/

/** Rate limit cooldown for org creation (per super admin) */
const ORG_CREATE_COOLDOWN_MS = 10_000 // 10 seconds

/**
 * Strip all HTML tags and trim whitespace.
 * This is the primary defense against XSS/injection via form fields.
 */
function sanitizeText(input: string): string {
  return input.replace(HTML_TAG_RE, "").trim()
}

/**
 * Validate and sanitize organization name.
 */
function validateOrgName(name: string): { valid: boolean; sanitized: string; error?: string } {
  const sanitized = sanitizeText(name)
  if (!sanitized || sanitized.length < 2) {
    return { valid: false, sanitized: "", error: "Organization name must be at least 2 characters." }
  }
  if (sanitized.length > 100) {
    return { valid: false, sanitized: "", error: "Organization name must be under 100 characters." }
  }
  if (!NAME_RE.test(sanitized)) {
    return { valid: false, sanitized: "", error: "Organization name contains invalid characters." }
  }
  return { valid: true, sanitized: sanitized }
}

/**
 * Validate and sanitize slug.
 */
function validateSlug(slug: string): { valid: boolean; sanitized: string; error?: string } {
  const sanitized = sanitizeText(slug).toLowerCase()
  if (!sanitized || sanitized.length < 2) {
    return { valid: false, sanitized: "", error: "Slug must be at least 2 characters." }
  }
  if (sanitized.length > 50) {
    return { valid: false, sanitized: "", error: "Slug must be under 50 characters." }
  }
  if (!SLUG_RE.test(sanitized)) {
    return { valid: false, sanitized: "", error: "Slug can only contain lowercase letters, numbers, and hyphens." }
  }
  return { valid: true, sanitized: sanitized }
}

/**
 * Validate and sanitize website URL.
 */
function validateWebsite(url: string): { valid: boolean; sanitized: string; error?: string } {
  if (!url || url.trim() === "") {
    return { valid: true, sanitized: "" } // Website is optional
  }
  const sanitized = sanitizeText(url)
  if (sanitized.length > 500) {
    return { valid: false, sanitized: "", error: "Website URL is too long." }
  }
  if (!URL_RE.test(sanitized)) {
    return { valid: false, sanitized: "", error: "Website must be a valid URL starting with http:// or https://" }
  }
  return { valid: true, sanitized: sanitized }
}

/**
 * Validate industry against whitelist.
 */
function validateIndustry(industry: string): { valid: boolean; sanitized: string; error?: string } {
  if (!industry || industry.trim() === "") {
    return { valid: true, sanitized: "" } // Industry is optional
  }
  const sanitized = sanitizeText(industry)
  if (!ALLOWED_INDUSTRIES.includes(sanitized as typeof ALLOWED_INDUSTRIES[number])) {
    return { valid: false, sanitized: "", error: "Invalid industry selection." }
  }
  return { valid: true, sanitized: sanitized }
}

export async function createOrganizationAction(
  _prevState: { success: boolean; error?: string; orgId?: string } | null,
  formData: FormData
): Promise<{ success: boolean; error?: string; orgId?: string }> {
  const rawName = (formData.get("name") as string) || ""
  const rawSlug = (formData.get("slug") as string) || ""
  const rawIndustry = (formData.get("industry") as string) || ""
  const rawWebsite = (formData.get("website") as string) || ""

  const supabase = await getServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "You must be signed in." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    return { success: false, error: "Access denied. Super admin only." }
  }

  // Rate limiting
  const cooldownSince = new Date(Date.now() - ORG_CREATE_COOLDOWN_MS).toISOString()
  const { data: recentCreations } = await supabase
    .from("audit_log")
    .select("id")
    .eq("actor_id", user.id)
    .eq("action", "create_organization")
    .gte("created_at", cooldownSince)
    .limit(1)

  if (recentCreations && recentCreations.length > 0) {
    return { success: false, error: "Please wait 10 seconds before creating another organization." }
  }

  const nameResult = validateOrgName(rawName)
  if (!nameResult.valid) return { success: false, error: nameResult.error }

  const slugResult = validateSlug(rawSlug)
  if (!slugResult.valid) return { success: false, error: slugResult.error }

  const websiteResult = validateWebsite(rawWebsite)
  if (!websiteResult.valid) return { success: false, error: websiteResult.error }

  const industryResult = validateIndustry(rawIndustry)
  if (!industryResult.valid) return { success: false, error: industryResult.error }

  // Z+ SECURITY: Use the user's session client (supabase) for database operations.
  // The admin client (getSupabaseAdmin) uses a service role key that is corrupted 
  // in this environment (contains a typo 'cervice_role').
  // RLS policies already allow Super Admins to manage organizations and quotas.

  const { data: existingOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slugResult.sanitized)
    .maybeSingle()

  if (existingOrg) {
    return { success: false, error: `The slug "${slugResult.sanitized}" is already taken. Please choose another.` }
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name: nameResult.sanitized,
      slug: slugResult.sanitized,
      industry: industryResult.sanitized || null,
      website: websiteResult.sanitized || null,
    })
    .select()
    .single()

  if (orgError) {
    console.error("Org Creation DB Error:", orgError)
    return { success: false, error: "Database operation failed: " + orgError.message }
  }

  // Fetch dynamic defaults from platform settings
  const settings = await getPlatformSettingsMap()
  const defaultTier = (settings['default_org_plan_tier'] || DEFAULT_PLAN) as string
  const planDefaults = getPlanLimits(defaultTier)
  const maxProjects = parseInt(settings['default_org_projects_limit'] || String(planDefaults.maxProjects), 10)
  const maxUsers = parseInt(settings['default_org_users_limit'] || String(planDefaults.maxUsers), 10)

  const { error: quotaError } = await supabase
    .from("org_quotas")
    .insert({
      org_id: org.id,
      max_docker_containers: planDefaults.maxDockerSlots,
      max_ci_scans_per_day: planDefaults.maxCiScansPerDay,
      max_projects: maxProjects,
      max_users: maxUsers,
      storage_limit_gb: planDefaults.maxStorageGb,
      plan_tier: defaultTier,
    })

  if (quotaError) {
    console.error("Quota Initialization DB Error:", quotaError)
    await supabase.from("organizations").delete().eq("id", org.id)
    return { success: false, error: "Failed to initialize organization quotas." }
  }

  const headersList = await headers()
  const ipAddress = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || headersList.get("x-real-ip") || null
  const userAgent = headersList.get("user-agent") || null

  await logAudit({
    org_id: org.id,
    actor_id: user.id,
    action: "create_organization",
    resource_type: "organization",
    resource_id: org.id,
    new_value: {
      name: nameResult.sanitized,
      slug: slugResult.sanitized,
      industry: industryResult.sanitized || null,
      website: websiteResult.sanitized || null,
    }
  })

  revalidatePath("/super-admin/organizations")
  return { success: true, orgId: org.id }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TRANSFER_COOLDOWN_MS = 30_000

export async function assignOrgAdminAction(orgId: string, email: string) {
  try {
    const supabase = await getServerClient()
    const { data: { user: superUser } } = await supabase.auth.getUser()

    if (!superUser) return { success: false, error: "You must be signed in." }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", superUser.id).single()
    if (profile?.role !== 'super_admin') return { success: false, error: "Access denied. Super admin only." }

    const sanitizedEmail = email.trim().toLowerCase()
    if (!EMAIL_RE.test(sanitizedEmail)) {
      return { success: false, error: "Please enter a valid email address." }
    }

    const adminClient = getSupabaseAdmin()
    if (!adminClient) return { success: false, error: "Service temporarily unavailable." }

    const cooldownSince = new Date(Date.now() - TRANSFER_COOLDOWN_MS).toISOString()
    const { data: recentTransfers } = await adminClient
      .from("audit_log")
      .select("id")
      .eq("org_id", orgId)
      .eq("action", "transfer_ownership")
      .gte("created_at", cooldownSince)
      .limit(1)

    if (recentTransfers && recentTransfers.length > 0) {
      return { success: false, error: "Please wait 30 seconds before another ownership transfer for this organization." }
    }

    const { data: currentAdmin } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .eq("org_id", orgId)
      .eq("role", "admin")
      .maybeSingle()

    const { data: targetUser, error: userError } = await adminClient
      .from("profiles")
      .select("id, email, org_id, full_name")
      .eq("email", sanitizedEmail)
      .maybeSingle()

    if (userError || !targetUser) {
      return { success: false, error: "User not found. They must register on the platform first." }
    }

    if (currentAdmin && targetUser.id === currentAdmin.id) {
      return { success: false, error: "This user is already the admin of this organization." }
    }

    const { data: orgData } = await adminClient
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single()

    const orgName = orgData?.name || "the organization"

    if (currentAdmin && currentAdmin.id !== targetUser.id) {
      await adminClient
        .from("profiles")
        .update({ role: 'program_manager' })
        .eq("id", currentAdmin.id)

      await adminClient.from("notifications").insert({
        user_id: currentAdmin.id,
        org_id: orgId,
        title: "Ownership Transferred",
        message: `You have been demoted to Program Manager. ${targetUser.full_name || sanitizedEmail} is now the admin of ${orgName}.`,
        type: "role_changed",
        is_read: false,
      })
    }

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        org_id: orgId,
        role: 'admin'
      })
      .eq("id", targetUser.id)

    if (updateError) throw updateError

    // ── Layer 4: NOTIFICATIONS & EMAILS (Z+ Security) ────────────
    const { sendBrandedEmail } = await import("@/lib/utils/email")

    // 1. Notify New Admin
    await adminClient.from("notifications").insert({
      user_id: targetUser.id,
      org_id: orgId,
      title: "You Are Now the Admin",
      message: `You have been promoted to Admin of ${orgName}. You now have full control over this organization.`,
      type: "role_changed",
      is_read: false,
    })

    try {
        await sendBrandedEmail({
            to: sanitizedEmail,
            subject: `Action Required: You are now the Admin of ${orgName}`,
            templateName: "invite", // Reusing template for simple text
            templateVars: {
                ConfirmationURL: `${process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')}/dashboard`,
                orgName: orgName
            }
        })
    } catch (e) { console.warn("Failed to send email to new admin:", e) }

    // 2. Notify Old Admin (if any)
    if (currentAdmin) {
        try {
            await sendBrandedEmail({
                to: currentAdmin.email,
                subject: `Security Alert: Ownership Transferred for ${orgName}`,
                templateName: "invite",
                templateVars: {
                    ConfirmationURL: `${process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')}/dashboard`,
                    orgName: orgName
                }
            })
        } catch (e) { console.warn("Failed to send email to old admin:", e) }
    }

    const headersList = await headers()
    const ipAddress = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || headersList.get("x-real-ip") || null
    const userAgent = headersList.get("user-agent") || null

    await logAudit({
      org_id: orgId,
      actor_id: superUser.id,
      action: "transfer_ownership",
      resource_type: "organization",
      resource_id: orgId,
      new_value: {
        new_admin: sanitizedEmail,
        new_admin_id: targetUser.id,
        old_admin: currentAdmin?.email || 'none',
        old_admin_id: currentAdmin?.id || 'none',
      }
    })

    revalidatePath(`/super-admin/organizations/${orgId}`)
    revalidatePath("/super-admin/organizations")
    return {
      success: true,
      message: `Ownership transferred to ${sanitizedEmail}. ${currentAdmin ? "Previous admin demoted to Program Manager." : ""}`,
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * DELETE USER ACTION
 * Super Admin tool to remove users safely.
 * Z+ SECURITY: Uses server client (anon key + session) for DB operations.
 * Falls back gracefully if service role key is unavailable for auth deletion.
 */
export async function deleteUserAction(userId: string) {
  try {
    const supabase = await getServerClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) return { success: false, error: "Session expired. Please login again." }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", currentUser.id)
      .single()

    if (profile?.role !== 'super_admin') return { success: false, error: "Only platform staff can delete users." }

    // 1. Check for active project ownership (use server client — no service key needed)
    const { count: projectCount } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("created_by", userId)

    if (projectCount && projectCount > 0) {
      return { success: false, error: "User owns active projects. Re-assign or delete projects first." }
    }

    // 2. Attempt auth deletion via admin client (service role key)
    const adminClient = getSupabaseAdmin()
    let authDeleted = false

    if (adminClient) {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
      if (deleteError) {
        // If service role key is invalid, log and fall through to DB-only cleanup
        if (deleteError.message.includes("API key") || deleteError.message.includes("Invalid API key")) {
          console.warn("[deleteUserAction] Service role key invalid — falling back to DB-only deletion for userId:", userId)
        } else {
          throw deleteError
        }
      } else {
        authDeleted = true
      }
    } else {
      console.warn("[deleteUserAction] Admin client unavailable — falling back to DB-only deletion for userId:", userId)
    }

    // 3. Delete profile from DB (always runs — ensures user is removed from platform)
    const { error: profileDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId)

    if (profileDeleteError) {
      console.error("[deleteUserAction] Profile deletion failed:", profileDeleteError)
      return { success: false, error: `Failed to remove user profile: ${profileDeleteError.message}` }
    }

    // 4. Audit log
    try {
      const headersList = await headers()
      const ipAddress = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || headersList.get("x-real-ip") || null
      const userAgent = headersList.get("user-agent") || null

      await logAudit({
        actor_id: currentUser.id,
        action: "delete_user",
        resource_type: "user",
        resource_id: userId,
        new_value: { auth_deleted: authDeleted, db_purged: true }
      })
    } catch (auditErr) {
      console.warn("[deleteUserAction] Audit log failed (non-blocking):", auditErr)
    }

    revalidatePath("/super-admin/users")
    return {
      success: true,
      message: authDeleted
        ? "User account and data purged successfully."
        : "User profile purged from database. Manual auth cleanup may be required."
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[deleteUserAction] Critical failure:", message)
    return { success: false, error: message }
  }
}

import { processInvitation } from "@/lib/utils/invite-internal"

/**
 * INVITE ORG ADMIN ACTION
 * Calls the internal processing utility directly (Fix Medium #6 + Vercel Fetch Fix)
 */
export async function inviteOrgAdminAction(data: { email: string; orgId: string }) {
  try {
    const invitation = await processInvitation({
      email: data.email,
      role: 'admin',
      org_id: data.orgId
    })

    return { success: true, data: invitation }
  } catch (error: any) {
    console.error("inviteOrgAdminAction Error:", error.message)
    return { success: false, error: error.message || "Failed to send invitation" }
  }
}
