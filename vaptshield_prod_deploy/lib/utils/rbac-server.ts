// ============================================================
// VAPTShield — Server-side RBAC Helpers
// These functions use supabaseAdmin and must ONLY be used in
// Server Components or Server Actions.
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logAudit } from "@/lib/utils/audit-server"
import { getServerClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import type { Role } from "@/lib/supabase/types"

/**
 * Get a working client (Admin if available/valid, otherwise User)
 */
async function getResilientClient() {
  const adminClient = getSupabaseAdmin()
  const userClient = await getServerClient()

  // We'll try a simple query to see if the admin client is actually valid
  if (adminClient) {
    try {
      const { error } = await adminClient.from("organizations").select("id").limit(1)
      if (!error) return { client: adminClient, isAdmin: true }
      if (error.message.includes("API key")) {
          console.warn("RBAC: Service Role Key is invalid, falling back to user client.")
      }
    } catch (e) {
      console.warn("RBAC: Admin client failed, falling back to user client.")
    }
  }

  return { client: userClient, isAdmin: false }
}

/**
 * Count active admins in an org
 */
export async function countAdminsInOrg(orgId: string): Promise<number> {
  const { client } = await getResilientClient()

  const { count, error } = await client
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "admin")
    .eq("is_active", true)

  if (error) throw error
  return count ?? 0
}

/**
 * Check if target user can be demoted or deleted
 * Throws if it would leave the org without an admin
 */
export async function canDemoteOrDelete(
  targetUserId: string,
  orgId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { client } = await getResilientClient()

  const { data: profile, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", targetUserId)
    .single()

  if (error || !profile) {
    console.error("RBAC canDemoteOrDelete error:", error)
    return { allowed: false, reason: "User not found or access denied" }
  }

  if (profile.role === "admin") {
    const adminCount = await countAdminsInOrg(orgId)
    if (adminCount <= 1) {
      return {
        allowed: false,
        reason:
          "Cannot remove last admin. Promote another user to admin first.",
      }
    }
  }

  return { allowed: true }
}

import { createNotification } from "@/lib/supabase/notification-actions"

/**
 * Change user role and force re-login (invalidate JWT)
 * Used when demoting/promoting to ensure immediate effect
 */
export async function changeUserRole(
  userId: string,
  newRole: Role,
  performedBy?: string
): Promise<{ success: boolean; error?: string }> {
  const { client, isAdmin } = await getResilientClient()

  // 1. Get user current org for notification
  const { data: userData } = await client
    .from("profiles")
    .select("org_id, role")
    .eq("id", userId)
    .single()

  const oldRole = userData?.role

  // 2. Update the role in profiles
  const { error: updateError } = await client
    .from("profiles")
    .update({
      role: newRole,
      updated_at: new Date().toISOString() // Force a change for realtime listeners
    })
    .eq("id", userId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // 3. Create Notification for the user
  if (userData?.org_id) {
    await createNotification({
        user_id: userId,
        org_id: userData.org_id,
        title: "Permissions Updated",
        message: `Your role has been changed to ${newRole.replace('_', ' ')}. Please refresh or re-login if changes don't appear.`,
        type: 'role_changed'
    })
  }

  // 4. Audit log: role change
  if (userData?.org_id) {
    try {
      await logAudit({
        org_id: userData.org_id,
        actor_id: performedBy || userId,
        action: "user.role_changed",
          ip_address: (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || (await headers()).get("x-real-ip") || null,
          user_agent: (await headers()).get("user-agent") || null,
        resource_type: "user",
        resource_id: userId,
        old_value: { role: oldRole },
        new_value: { role: newRole },
      })
    } catch (e) {
      console.warn("Audit log skipped for role change:", e)
    }
  }

  // 5. Sync auth metadata so JWT claims reflect the new role
  if (isAdmin) {
    try {
      await client.auth.admin.updateUserById(userId, {
        app_metadata: { role: newRole },
      })
    } catch (e) {
      console.warn("Could not sync auth metadata for user:", e)
    }
  }

  // 6. Force re-login by invalidating sessions
  // NOTE: client.auth.admin.signOut(userId) is NOT supported in this way (it expects a JWT).
  // We instead rely on the 'role_changed' notification created in step 3.
  // The RealtimeProvider/useNotifications hook on the client will detect this 
  // and trigger a local supabase.auth.signOut() for the affected user.
  if (isAdmin) {
    // We've already updated metadata and created a notification.
    // The user's browser will handle the logout gracefully.
    console.log(`RBAC: Role changed for ${userId} to ${newRole}. Client-side logout triggered via notification.`)
  }

  return { success: true }
}

/**
 * Remove user from organization
 * Sets org_id to null and role to guest
 */
export async function removeUserFromOrg(
  userId: string,
  performedBy?: string
): Promise<{ success: boolean; error?: string }> {
  const { client, isAdmin } = await getResilientClient()

  // Get user data before removal for audit
  const { data: userData } = await client
    .from("profiles")
    .select("org_id, role, email")
    .eq("id", userId)
    .single()

  // Update profile to be org-less
  const { error: updateError } = await client
    .from("profiles")
    .update({
      org_id: null,
      role: "guest",
      is_active: false // Mark as inactive until they join another org
    })
    .eq("id", userId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Audit log: user removal
  if (userData?.org_id) {
    try {
      await logAudit({
        org_id: userData.org_id,
        actor_id: performedBy || userId,
        action: "user.removed",
          ip_address: (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || (await headers()).get("x-real-ip") || null,
          user_agent: (await headers()).get("user-agent") || null,
        resource_type: "user",
        resource_id: userId,
        old_value: { role: userData.role, email: userData.email },
        new_value: { removed: true },
      })
    } catch (e) {
      console.warn("Audit log skipped for user removal:", e)
    }
  }

  // Force re-login
  if (isAdmin) {
    await client.auth.admin.signOut(userId)
  }

  return { success: true }
}
