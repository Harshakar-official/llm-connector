import { getServerClient } from "@/lib/supabase/server"
import { getPlatformSetting } from "@/lib/utils/platform-settings"
import { canInviteRole } from "@/lib/utils/permissions"
import { checkQuota } from "@/lib/utils/quota-engine"
import { sendBrandedEmail } from "@/lib/utils/email"
import { logAudit } from "@/lib/utils/audit-server"
import { headers } from "next/headers"

/** Rate limit cooldown for invitations (per sender) */
const INVITE_COOLDOWN_MS = 5_000 // 5 seconds between invites

export interface InviteParams {
  email: string
  role: "admin" | "program_manager" | "security_engineer" | "guest" | "developer"
  org_id?: string
  department_id?: string | null
}

export async function processInvitation(params: InviteParams) {
  const supabase = await getServerClient()

  // ── Layer 1: Identify and Authenticate Sender ──────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    throw new Error("Authentication required")
  }

  // ── Layer 2: Fetch Sender Profile ──────────────────
  const { data: senderProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single()

  if (profileError || !senderProfile) {
    throw new Error("User profile not found")
  }

  // ── Layer 3: Determine Target Organization ─────────────────────
  let targetOrgId = senderProfile.org_id
  const isSuperAdmin = senderProfile.role === "super_admin"

  // Platform Registration Gate
  const regEnabled = await getPlatformSetting("self_registration_enabled", "true")
  if (regEnabled !== "true" && !isSuperAdmin) {
    throw new Error("Security Policy: New user invitations are currently disabled by the platform administrator.")
  }

  if (isSuperAdmin) {
    if (!params.org_id) throw new Error("Target organization ID required for Super Admins")
    targetOrgId = params.org_id
  } else {
    if (senderProfile.role !== "admin" && senderProfile.role !== "program_manager") {
      throw new Error("Insufficient permissions to invite users")
    }
    
    if (!targetOrgId) throw new Error("Organization isolation breach: No org_id found for sender")

    // Privilege Escalation Guard
    if (params.role === "admin") {
      throw new Error("Access Denied: Only Super Administrators can invite new Organization Admins.")
    }

    if (!canInviteRole(senderProfile.role, params.role)) {
      throw new Error(`Access Denied: Your role (${senderProfile.role.replace("_", " ")}) cannot invite users with role "${params.role.replace("_", " ")}".`)
    }
  }

  // ── Layer 4: RATE LIMITING ───────────────────────
  const sanitizedEmail = params.email.toLowerCase().trim()
  const cooldownSince = new Date(Date.now() - INVITE_COOLDOWN_MS).toISOString()

  // 1. Sender-based Rate Limit
  const { data: recentInvites } = await supabase
    .from("audit_log")
    .select("id")
    .eq("actor_id", user.id)
    .in("action", ["user.invited", "user.invite_refreshed"])
    .gte("created_at", cooldownSince)
    .limit(1)

  if (recentInvites && recentInvites.length > 0) {
    throw new Error("Please wait before sending another invitation. Rate limit in effect.")
  }

  // 2. Recipient-based Rate Limit (5 invites per hour)
  const hourAgo = new Date(Date.now() - 3600000).toISOString()
  const { count: recipientInviteCount } = await supabase
    .from("audit_log")
    .select("id", { count: 'exact', head: true })
    .in("action", ["user.invited", "user.invite_refreshed"])
    .gte("created_at", hourAgo)
    .contains("new_value", { email: sanitizedEmail })

  if (recipientInviteCount !== null && recipientInviteCount >= 5) {
    throw new Error("Invitation limit reached for this email. Please try again later.")
  }

  const allowedDomains = await getPlatformSetting("allowed_email_domains", "")
  if (allowedDomains) {
      const domains = allowedDomains.split(",").map(d => d.trim().toLowerCase()).filter(Boolean)
      const recipientDomain = sanitizedEmail.split("@")[1].toLowerCase()
      if (!domains.includes(recipientDomain)) {
          throw new Error("Invitation could not be processed")
      }
  }

  // ── Layer 5: QUOTA CHECK ───────────────────────────────────────
  const quota = await checkQuota(targetOrgId, 'users')
  if (!quota.allowed) {
      throw new Error(quota.error)
  }

  // ── Layer 5.5: STRICT 1 ADMIN GUARD ───────────────────────────
  // Ensure an organization cannot have multiple admins to prevent power clashes.
  if (params.role === 'admin') {
    const { count: adminCount } = await supabase
      .from("profiles")
      .select("id", { count: 'exact', head: true })
      .eq("org_id", targetOrgId)
      .eq("role", "admin")
    
    if (adminCount && adminCount > 0) {
      throw new Error("Security Policy: This organization already has an Admin. Use 'Transfer Ownership' in the Super Admin panel or invite as 'Program Manager' instead.")
    }
  }

  // ── Layer 6: DUPLICATE & CROSS-ORG CHECK ───────────────────────
  const { data: existingUser } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("email", sanitizedEmail)
    .maybeSingle()

  if (existingUser && existingUser.org_id === targetOrgId) {
    throw new Error("User is already a member of this organization")
  }

    if (existingUser && existingUser.org_id && existingUser.org_id !== targetOrgId) {
      throw new Error("This user is already a member of another organization.")
    }

  // Check for pending invitations
  const { data: pendingInvite } = await supabase
    .from("invitations")
    .select("id")
    .eq("email", sanitizedEmail)
    .eq("org_id", targetOrgId)
    .is("accepted_at", null)
    .maybeSingle()

  let isRefresh = false
  if (pendingInvite) {
    isRefresh = true
    await supabase.from("invitations").delete().eq("id", pendingInvite.id)
  }

  // ── Layer 7: CREATE INVITATION ─────────────────────────────────
  const inviteData = {
    email: sanitizedEmail,
    org_id: targetOrgId,
    role: params.role,
    department_id: params.department_id || null,
    invited_by: user.id,
  }

  const { data: invitation, error: insertError } = await supabase
    .from("invitations")
    .insert(inviteData)
    .select()
    .single()

  if (insertError) {
    throw new Error("Database operation failed: " + insertError.message)
  }

  // ── Layer 8: AUDIT LOGGING ───────────────────────
  await logAudit({
    org_id: targetOrgId,
    actor_id: user.id,
    action: isRefresh ? "user.invite_refreshed" : "user.invited",
    resource_type: "invitation",
    resource_id: invitation.id,
    new_value: {
      email: sanitizedEmail,
      role: params.role,
      invited_by: user.id,
      is_refresh: isRefresh
    }
  })

  // ── Layer 9: SEND BRANDED EMAIL ────────────────────────────────
  try {
    const headersList = await headers()
    const host = headersList.get("host") || "localhost:3000"
    const forwardedHost = headersList.get("x-forwarded-host")
    const actualHost = forwardedHost || host
    const protocol = actualHost.includes("localhost") ? "http" : "https"
    const baseUrl = `${protocol}://${actualHost}`
    const inviteLink = `${baseUrl}/invite/${invitation.token}`

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", targetOrgId)
      .single()

    await sendBrandedEmail({
      to: sanitizedEmail,
      subject: `Invite: Join ${org?.name || "VAPTShield"}`,
      templateName: "invite",
      templateVars: {
        ConfirmationURL: inviteLink,
        orgName: org?.name || "VAPTShield"
      }
    })
  } catch (emailError: any) {
    console.error("Invitation email delivery failed:", emailError)
    await supabase.from("invitations").delete().eq("id", invitation.id)
    throw new Error(`Failed to send invitation email: ${emailError.message || "Unknown SMTP error"}`)
  }

  return invitation
}
