"use server"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { logAudit } from "@/lib/utils/audit-server"
import { getServerClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { PLAN_TIERS, type PlanTier } from "@/lib/config/plans"

export type { PlanTier };

/**
 * MOCK PAYMENT BRIDGE (2026 Simulation)
 * In a real app, this would be a Stripe Webhook.
 * Here, it simulates a successful payment and upgrades the org quota.
 */
export async function upgradeOrganizationPlan(orgId: string, newTier: PlanTier) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Session expired. Please login again." }

    // ─── RATE LIMITING (Audit Gap) ───
    const { data: recentUpgrades } = await supabase
        .from("audit_log")
        .select("id")
        .eq("actor_id", user.id)
        .eq("action", "upgrade_plan")
        .gte("created_at", new Date(Date.now() - 30000).toISOString())
    
    if (recentUpgrades && recentUpgrades.length > 0) {
        return { success: false, error: "Please wait 30 seconds between billing actions." }
    }

    // 1. Fetch current profile to verify permissions
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, org_id")
      .eq("id", user.id)
      .single()

    const isPlatformAdmin = profile?.role === 'super_admin'
    const isOrgAdmin = profile?.role === 'admin' && profile?.org_id === orgId

    if (!isPlatformAdmin && !isOrgAdmin) {
      return { success: false, error: "Unauthorized: Only organization administrators can change plans." }
    }

    // 2. Define Limits Config — single source of truth in lib/config/plans.ts
    const limits = PLAN_TIERS[newTier]

    // 3. EXECUTION: Use User Client
    const { error: updateError } = await supabase
      .from("org_quotas")
      .update({
        plan_tier: newTier,
        max_users: limits.maxUsers,
        max_projects: limits.maxProjects,
        max_docker_containers: limits.maxDockerSlots,
        storage_limit_gb: limits.maxStorageGb,
        max_scans_per_month: limits.maxScansPerMonth,
        updated_at: new Date().toISOString()
      })
      .eq("org_id", orgId)

    if (updateError) {
        console.error("[BillingAction] Quota update failed:", updateError)
        // If it's still an API key error, it means even the anon key might be wonky
        if (updateError.message.includes("API key")) {
            return { success: false, error: "Gateway Error: Authentication credentials mismatch. Please contact your developer." }
        }
        return { success: false, error: `Update failed: ${updateError.message}` }
    }

    // 4. Log the transaction for audit trail
    // We try to log with the current user client (new policy allows this)
    try {
        await logAudit({
            org_id: orgId,
            actor_id: user.id,
            action: "upgrade_plan",
            resource_type: "organization",
            resource_id: orgId,
            new_value: { tier: newTier, limits }
        })
    } catch (auditErr) {
        console.warn("[BillingAction] Audit log failed (non-blocking):", auditErr)
    }

    revalidatePath("/", "layout")
    revalidatePath("/organization/billing")
    
    return { success: true, message: `Successfully upgraded to ${newTier} plan!` }

  } catch (error) {
    console.error("[BillingAction] Critical failure:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return { success: false, error: message }
  }
}
