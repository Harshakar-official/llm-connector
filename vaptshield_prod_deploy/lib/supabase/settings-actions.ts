"use server"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { logAudit } from "@/lib/utils/audit-server"

// ─── Z+ SECURITY: Platform Settings Actions ────────────────────────
//
// Security Layers:
//  1. Authentication (session-based)
//  2. Authorization (super_admin role only)
//  3. Input sanitization (HTML stripping, key whitelist)
//  4. Audit logging (IP + User-Agent captured)
//  5. Rate limiting via audit_log cooldown

/** Allowed setting keys — whitelist prevents arbitrary key injection */
const ALLOWED_SETTING_KEYS = [
  "support_email",
  "self_registration_enabled",
  "default_org_projects_limit",
  "default_org_users_limit",
  "maintenance_mode",
  "maintenance_message",
  "default_org_plan_tier",
  "allowed_email_domains",
  "audit_log_retention_days",
  "notification_retention_days",
] as const

type SettingKey = (typeof ALLOWED_SETTING_KEYS)[number]

/** HTML tag pattern */
const HTML_TAG_RE = /<[^>]*>/g

/** Rate limit cooldown for settings updates */
const SETTINGS_COOLDOWN_MS = 3_000 // 3 seconds

export interface PlatformSetting {
  id: string
  key: string
  value: string
  category: string
  description: string | null
  updated_at: string
}

export interface SettingsActionResult {
  success: boolean
  error?: string
  settings?: PlatformSetting[]
}

/**
 * Fetch all platform settings.
 * Only accessible by super admins (enforced via RLS + server check).
 */
export async function getPlatformSettingsAction(): Promise<SettingsActionResult> {
  try {
    const supabase = await getServerClient()

    // ── Layer 1: Authentication ──────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "Authentication required" }
    }

    // ── Layer 2: Authorization ───────────────────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "super_admin") {
      return { success: false, error: "Only super administrators can access platform settings" }
    }

    // ── Layer 3: Fetch settings ──────────────────────────────────
    const { data: settings, error } = await supabase
      .from("platform_settings")
      .select("*")
      .order("category", { ascending: true })
      .order("key", { ascending: true })

    if (error) {
      console.error("Failed to fetch platform settings:", error)
      return { success: false, error: "Failed to load platform settings" }
    }

    return { success: true, settings: settings as PlatformSetting[] }
  } catch (err) {
    console.error("getPlatformSettingsAction error:", err)
    return { success: false, error: "Internal server error" }
  }
}

/**
 * Update a single platform setting.
 * Z+ Security: Whitelist-based key validation, HTML stripping, audit logging.
 */
export async function updatePlatformSettingAction(
  key: string,
  value: string
): Promise<SettingsActionResult> {
  try {
    const supabase = await getServerClient()

    // ── Layer 1: Authentication ──────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "Authentication required" }
    }

    // ── Layer 2: Authorization ───────────────────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "super_admin") {
      return { success: false, error: "Only super administrators can modify platform settings" }
    }

    // ── Layer 3: Key whitelist validation ────────────────────────
    if (!ALLOWED_SETTING_KEYS.includes(key as SettingKey)) {
      return { success: false, error: `Invalid setting key: ${key}` }
    }

    // ── Layer 4: Input sanitization ──────────────────────────────
    const sanitizedValue = value.replace(HTML_TAG_RE, "").trim()

    // Type-specific validation
    const booleanKeys = ["self_registration_enabled", "maintenance_mode"]
    const numberKeys = ["default_org_projects_limit", "default_org_users_limit", "audit_log_retention_days", "notification_retention_days"]
    const selectKeys = ["default_org_plan_tier"]

    if (booleanKeys.includes(key)) {
      if (!["true", "false"].includes(sanitizedValue.toLowerCase())) {
        return { success: false, error: "Boolean settings must be 'true' or 'false'" }
      }
    }

    if (numberKeys.includes(key)) {
      const num = parseInt(sanitizedValue, 10)
      if (isNaN(num) || num < 0 || num > 1000000) {
        return { success: false, error: `Invalid number value for ${key}. Must be between 0 and 1,000,000.` }
      }
    }

    if (selectKeys.includes(key) && key === "default_org_plan_tier") {
        if (!["starter", "pro", "enterprise"].includes(sanitizedValue.toLowerCase())) {
            return { success: false, error: "Plan tier must be 'starter', 'pro', or 'enterprise'" }
        }
    }

    // ── Layer 5: Rate limiting ───────────────────────────────────
    const cooldownSince = new Date(Date.now() - SETTINGS_COOLDOWN_MS).toISOString()
    const { data: recentUpdates } = await supabase
      .from("audit_log")
      .select("id")
      .eq("actor_id", user.id)
      .eq("action", "settings.updated")
      .gte("created_at", cooldownSince)
      .limit(1)

    if (recentUpdates && recentUpdates.length > 0) {
      return { success: false, error: "Please wait before making another change. Rate limit in effect." }
    }

    // ── Layer 6: Fetch old value for audit ───────────────────────
    const { data: oldSetting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .single()

    // ── Layer 7: Update setting ──────────────────────────────────
    const { error: updateError } = await supabase
      .from("platform_settings")
      .update({
        value: sanitizedValue,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key)

    if (updateError) {
      console.error("Failed to update platform setting DB Error:", updateError)
      return { success: false, error: "Failed to update setting: " + updateError.message }
    }

    // ── Layer 8: Audit logging ───────────────────────────────────
    await logAudit({
      org_id: null, // Platform-level setting, not org-specific
      action: "settings.updated",
      resource_type: "platform_setting",
      resource_id: key,
      old_value: oldSetting ? { value: oldSetting.value } : null,
      new_value: { value: sanitizedValue },
    })

    // ── Layer 9: Revalidate and return ───────────────────────────
    revalidatePath("/super-admin/settings")

    // Fetch updated settings
    const { data: updatedSettings } = await supabase
      .from("platform_settings")
      .select("*")
      .order("category", { ascending: true })
      .order("key", { ascending: true })

    return { success: true, settings: updatedSettings as PlatformSetting[] }
  } catch (err) {
    console.error("updatePlatformSettingAction error:", err)
    return { success: false, error: "Internal server error" }
  }
}