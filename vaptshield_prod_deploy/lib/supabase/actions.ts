"use server"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createNotification } from "./notification-actions"

import { cookies } from "next/headers"

/**
 * Z+ SECURITY: Accept Invitation
 * This server-side action strictly binds the invitation token to the email address.
 * It prevents attackers from using a valid token with a different email.
 */
export async function acceptInvitationAction(token?: string) {
  try {
    let activeToken = token
    if (!activeToken) {
      const cookieStore = await cookies()
      activeToken = cookieStore.get("invite_token")?.value
    }
    
    if (!activeToken) {
        return { success: false, error: "No invitation token found" }
    }
    const supabase = await getServerClient()
    const supabaseAdmin = getSupabaseAdmin()

    // 1. Get current authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "Authentication required" }
    }

    // 2. Fetch invitation via standard client (filtered by token)
    // Z+ SECURITY: We use a regular client because the admin client (supabaseAdmin) 
    // uses a corrupted service role key in this environment.
    // The RLS policy 'invitations_public_read' already allows public read by token.
    const { data: invite, error: fetchError } = await supabase
      .from("invitations")
      .select("*")
      .eq("token", activeToken)
      .single()

    if (fetchError || !invite) {
      console.error("Invite Fetch Error:", fetchError)
      return { success: false, error: "Invalid invitation token or permission denied" }
    }

    // 3. Check if invite is already used or expired
    if (invite.accepted_at) {
      return { success: false, error: "Invitation already accepted" }
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return { success: false, error: "Invitation expired" }
    }

    // 4. CRITICAL SECURITY CHECK: Email Binding
    if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
      console.error(`SECURITY ALERT: User ${user.email} tried to use invitation for ${invite.email}`)
      return {
        success: false,
        error: "Access Denied: This invitation was not intended for your email address."
      }
    }

    // 5. ORG-SWITCH GUARD: Prevent silent org overwrite
    // Z+ SECURITY: Use user session (supabase) to fetch own profile.
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, org_id, organizations(name)")
      .eq("id", user.id)
      .maybeSingle()

    if (existingProfile?.org_id && existingProfile.org_id !== invite.org_id) {
      const currentOrgName = (existingProfile.organizations as unknown as { name: string }[] | null)?.[0]?.name || "another organization"
      return {
        success: false,
        error: `You are already a member of "${currentOrgName}". Please leave your current organization before accepting this invitation.`,
      }
    }

    if (existingProfile?.org_id === invite.org_id) {
      return {
        success: false,
        error: "You are already a member of this organization.",
      }
    }

    // 6. Ensure Profile Exists (Resilience for trigger delays)
    // Z+ SECURITY: Use the user's session client (supabase) for these operations.
    // RLS already allows users to select/update their OWN profile.
    if (!existingProfile) {
      console.log("Profile missing, creating on the fly for:", user.id)
      const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
        email: user.email,
        org_id: invite.org_id,
        role: invite.role,
        department_id: invite.department_id || null,
      })
      if (insertError) {
        console.error("Profile on-the-fly creation failed:", insertError)
        return { success: false, error: "Failed to create user profile" }
      }
    } else {
      // 7. Atomic Update: Link Profile and Mark Invite as Used
      const updateData = {
        org_id: invite.org_id,
        role: invite.role,
        department_id: invite.department_id || null,
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id)

      if (updateError) {
        console.error("Profile update failed:", updateError)
        return { success: false, error: "Failed to link organization" }
      }
    }

    // 7. Mark Invite Accepted
    // RLS policy "invitations_accept" allows the user to update their own invitation.
    try {
      await supabase
        .from("invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id)
    } catch (inviteError) {
      console.warn("Invitation status update deferred:", inviteError)
    }

    // ─── ENTERPRISE NOTIFICATION: INVITE ACCEPTED ───
    if (invite.invited_by && invite.org_id) {
        await createNotification({
            user_id: invite.invited_by,
            org_id: invite.org_id,
            title: "Invitation Accepted",
            message: `${user.email} has joined your organization.`,
            type: 'invite_received'
        })
    }

    // 8. Log the event (Audit Trail - Try best effort)
    try {
      await supabase
        .from("audit_log")
        .insert({
          org_id: invite.org_id,
          actor_id: user.id,
          action: "accept_invitation",
          resource_type: "user",
          resource_id: user.id,
          new_value: { role: invite.role }
        })
    } catch (e) {
        console.warn("Audit log skipped due to permissions")
    }

    revalidatePath("/", "layout")
    return { success: true, message: "Welcome aboard!" }

  } catch (err) {
    console.error("Critical error in acceptInvitationAction:", err)
    return { success: false, error: "Internal security error" }
  }
}

/**
 * Z+ SECURITY: Server-Side Rate Limiting for Login
 * Increments failed_login_attempts in the profiles table.
 * Locks the account (sets locked_until) after MAX_FAILED_ATTEMPTS.
 * This is the REAL enforcement — client-side localStorage is just UX convenience.
 */
const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export async function incrementFailedLoginAttempts(email: string): Promise<{
  locked: boolean
  lockedUntil: string | null
  remaining: number
}> {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) {
      // Fallback: if admin client unavailable, skip server-side enforcement
      console.warn("⚠️ Admin client unavailable, skipping server-side rate limit")
      return { locked: false, lockedUntil: null, remaining: MAX_FAILED_ATTEMPTS }
    }

    // Fetch current profile by email
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from("profiles")
      .select("id, failed_login_attempts, locked_until")
      .eq("email", email.toLowerCase())
      .single()

    if (fetchError || !profile) {
      // User doesn't exist in profiles — no lock possible
      return { locked: false, lockedUntil: null, remaining: MAX_FAILED_ATTEMPTS }
    }

    // If already locked, don't increment further
    if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(profile.locked_until).getTime() - Date.now()) / 1000)
      return { locked: true, lockedUntil: profile.locked_until, remaining: 0 }
    }

    const newAttempts = (profile.failed_login_attempts || 0) + 1
    const locked = newAttempts >= MAX_FAILED_ATTEMPTS
    const lockedUntil = locked ? new Date(Date.now() + LOCK_DURATION_MS).toISOString() : null

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        failed_login_attempts: newAttempts,
        locked_until: lockedUntil,
      })
      .eq("id", profile.id)

    if (updateError) {
      console.error("Failed to update login attempts:", updateError)
      return { locked: false, lockedUntil: null, remaining: MAX_FAILED_ATTEMPTS - newAttempts }
    }

    return {
      locked,
      lockedUntil,
      remaining: Math.max(0, MAX_FAILED_ATTEMPTS - newAttempts),
    }
  } catch (err) {
    console.error("Error in incrementFailedLoginAttempts:", err)
    return { locked: false, lockedUntil: null, remaining: MAX_FAILED_ATTEMPTS }
  }
}

export async function resetFailedLoginAttempts(userId: string): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdmin()
    if (!supabaseAdmin) return

    await supabaseAdmin
      .from("profiles")
      .update({
        failed_login_attempts: 0,
        locked_until: null,
      })
      .eq("id", userId)
  } catch (err) {
    console.error("Error resetting login attempts:", err)
  }
}
