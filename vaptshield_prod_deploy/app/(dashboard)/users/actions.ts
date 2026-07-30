"use server"

import { revalidatePath } from "next/cache"
import { getSafeSession } from "@/lib/utils/security-guard"
import { canDemoteOrDelete, changeUserRole, removeUserFromOrg } from "@/lib/utils/rbac-server"
import { canChangeRole } from "@/lib/utils/permissions"
import { Role } from "@/lib/supabase/types"
import { logAudit } from "@/lib/utils/audit-server"
import { getServerClient } from "@/lib/supabase/server"
import { headers } from "next/headers"

/**
 * Server Action to update a user's role and department
 */
export async function updateUserDetails(targetUserId: string, data: { role: Role; department_id: string | null }) {
  try {
    const { orgId, user: currentUser, role: currentRole, error: sessionError } = await getSafeSession()

    if (sessionError || !orgId || !currentUser) {
      return { success: false, error: "Unauthorized" }
    }

    const userId = currentUser.id
    const supabase = await getServerClient()

    // ─── RATE LIMITING (Audit Gap) ───
    const { data: recentUpdates } = await supabase
        .from("audit_log")
        .select("id")
        .eq("actor_id", userId)
        .eq("action", "user.role_changed")
        .gte("created_at", new Date(Date.now() - 5000).toISOString())
    
    if (recentUpdates && recentUpdates.length > 0) {
        return { success: false, error: "Please wait 5 seconds between member updates." }
    }

    // Z+ SECURITY: Prevent self-action (user cannot modify their own role/department)
    if (userId === targetUserId) {
      return { success: false, error: "Access Denied: You cannot modify your own account." }
    }

    // 1. Fetch current user data to see what's changing
    const { data: targetProfile } = await supabase
        .from("profiles")
        .select("role, department_id")
        .eq("id", targetUserId)
        .single()
    
    if (!targetProfile) return { success: false, error: "User not found" }

    // 2. Handle Role Change (with guards)
    if (data.role !== targetProfile.role) {
        // RBAC: Check if current user has permission to change this user to this role
        if (!canChangeRole(currentRole as Role, targetProfile.role as Role, data.role)) {
            return { success: false, error: "Access Denied: You do not have permission to change this user's role." }
        }

        // Guard: Prevent removing the last admin
        const guard = await canDemoteOrDelete(targetUserId, orgId)
        if (!guard.allowed) {
            return { success: false, error: guard.reason }
        }

        // Execute role change and session invalidation
        const roleResult = await changeUserRole(targetUserId, data.role, userId)
        if (!roleResult.success) return { success: false, error: roleResult.error }
    }

    // 3. Handle Department Change
    if (data.department_id !== targetProfile.department_id) {
        // PM can only change department for non-Admins
        if (currentRole === 'program_manager' && targetProfile.role === 'admin') {
            return { success: false, error: "Program Managers cannot modify Administrator departments." }
        }

        const { error: deptError } = await supabase
            .from("profiles")
            .update({ department_id: data.department_id })
            .eq("id", targetUserId)
        
        if (deptError) {
            console.error("Department update error:", deptError)
            return { success: false, error: "Failed to update department" }
        }
    }

    revalidatePath("/users")
    return { success: true }

  } catch (err) {
    console.error("updateUserDetails error:", err)
    return { success: false, error: "Internal server error" }
  }
}

/**
 * Server Action to remove a user from the organization
 */
export async function removeUser(targetUserId: string) {
  try {
    const { orgId, user: currentUser, role: currentRole, error: sessionError } = await getSafeSession()

    if (sessionError || !orgId || !currentUser) {
      return { success: false, error: "Unauthorized" }
    }

    const userId = currentUser.id
    const supabase = await getServerClient()

    // ─── RATE LIMITING (Audit Gap) ───
    const { data: recentRemovals } = await supabase
        .from("audit_log")
        .select("id")
        .eq("actor_id", userId)
        .eq("action", "user.removed")
        .gte("created_at", new Date(Date.now() - 5000).toISOString())
    
    if (recentRemovals && recentRemovals.length > 0) {
        return { success: false, error: "Please wait 5 seconds between member removals." }
    }

    // Z+ SECURITY: Prevent self-action (user cannot remove themselves)
    if (userId === targetUserId) {
      return { success: false, error: "Access Denied: You cannot remove yourself from the organization." }
    }

    const { data: targetProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", targetUserId)
        .single()
    
    if (!targetProfile) return { success: false, error: "User not found" }

    // RBAC: Only Admin can remove anyone. PM can only remove SE, Guest and Developer.
    if (currentRole === 'program_manager' && (targetProfile.role === 'admin' || targetProfile.role === 'program_manager')) {
        return { success: false, error: "Access Denied: Program Managers can only remove Security Engineers, Developers and Guests." }
    }

    if (currentRole !== 'admin' && currentRole !== 'program_manager') {
        return { success: false, error: "Permission denied." }
    }

    // Guard: Prevent removing the last admin
    const guard = await canDemoteOrDelete(targetUserId, orgId)
    if (!guard.allowed) {
        return { success: false, error: guard.reason }
    }

    // 1. Execute Removal (Sets org_id to NULL and role to guest)
    const result = await removeUserFromOrg(targetUserId, userId)
    
    if (result.success) {
        revalidatePath("/users")
        return { success: true }
    } else {
        return { success: false, error: result.error }
    }

  } catch (err) {
    console.error("removeUser error:", err)
    return { success: false, error: "Internal server error" }
  }
}

/**
 * Server Action to remove multiple users from the organization
 */
export async function bulkRemoveUsers(userIds: string[]) {
    try {
        const { orgId, user: currentUser, role: currentRole, error: sessionError } = await getSafeSession()
        if (sessionError || !orgId || !currentUser) return { success: false, error: "Unauthorized" }

        if (currentRole !== 'admin' && currentRole !== 'program_manager') {
            return { success: false, error: "Permission denied." }
        }

        const supabase = await getServerClient()
        
        // ─── RATE LIMITING ───
        const { data: recentRemovals } = await supabase
            .from("audit_log")
            .select("id")
            .eq("actor_id", currentUser.id)
            .eq("action", "user.bulk_removed")
            .gte("created_at", new Date(Date.now() - 5000).toISOString())
        
        if (recentRemovals && recentRemovals.length > 0) {
            return { success: false, error: "Please wait 5 seconds between bulk removals." }
        }

        // Filter out the current user (cannot remove self)
        const targets = userIds.filter(id => id !== currentUser.id)
        if (targets.length === 0) return { success: false, error: "No valid users selected" }

        // Fetch targets to check roles
        const { data: targetProfiles } = await supabase
            .from("profiles")
            .select("id, role")
            .in("id", targets)

        if (!targetProfiles) return { success: false, error: "Targets not found" }

        // Execute removals one by one to respect guards (Z+ Stability)
        const results = []
        for (const profile of targetProfiles) {
            // Role Guard
            if (currentRole === 'program_manager' && (profile.role === 'admin' || profile.role === 'program_manager')) {
                continue // Skip privileged users
            }

            // Execute
            const res = await removeUserFromOrg(profile.id, currentUser.id)
            results.push({ id: profile.id, success: res.success })
        }

        revalidatePath("/users")
        const successCount = results.filter(r => r.success).length
        
        // Log bulk action
        await logAudit({
            org_id: orgId,
            actor_id: currentUser.id,
            action: "user.bulk_removed",
            resource_type: "user",
            new_value: { count: successCount, targets: userIds }
        })

        return { 
            success: true, 
            message: `Successfully removed ${successCount} members.` 
        }

    } catch (err) {
        console.error("Bulk remove error:", err)
        return { success: false, error: "Internal server error" }
    }
}
