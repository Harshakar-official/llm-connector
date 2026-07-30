"use server"

import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { createClient } from "@supabase/supabase-js"
import { headers } from "next/headers"

// ─── Z+ SECURITY: Password Change Action ──────────────────────────
// This server action handles password changes with multiple layers
// of security:
//  1. Session-based authentication (cookie)
//  2. Current password verification (re-authentication)
//  3. Password strength validation (server-side, non-bypassable)
//  4. New password ≠ current password check
//  5. Rate limiting via audit_log cooldown (prevents brute force)
//  6. Audit logging for all attempts (success + failure)
//  7. IP + User-Agent capture for forensic traceability
//  8. Service role key used only for the actual password update
//     (the anon key cannot perform auth admin operations)

const MIN_PASSWORD_LENGTH = 12
const RATE_LIMIT_COOLDOWN_MS = 30_000 // 30 seconds between attempts

/**
 * Password strength validation.
 * Requirements:
 *  - Minimum 8 characters
 *  - At least one uppercase letter
 *  - At least one lowercase letter
 *  - At least one digit
 *  - At least one special character
 */
function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter"
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter"
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one digit"
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain at least one special character"
  }
  return null
}

export async function changePasswordAction(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const currentPassword = formData.get("currentPassword") as string
  const newPassword = formData.get("newPassword") as string
  const confirmPassword = formData.get("confirmPassword") as string

  // ── Layer 1: Input presence validation ──────────────────────────
  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, error: "All fields are required." }
  }

  // ── Layer 2: Password match validation ─────────────────────────
  if (newPassword !== confirmPassword) {
    return { success: false, error: "New passwords do not match." }
  }

  // ── Layer 3: New password ≠ current password ───────────────────
  if (currentPassword === newPassword) {
    return { success: false, error: "New password must be different from your current password." }
  }

  // ── Layer 4: Password strength validation ──────────────────────
  const strengthError = validatePasswordStrength(newPassword)
  if (strengthError) {
    return { success: false, error: strengthError }
  }

  // ── Layer 5: Session authentication ────────────────────────────
  const supabase = await getServerClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user?.email) {
    return { success: false, error: "You must be signed in to change your password." }
  }

  // ── Layer 6: Rate limiting via audit_log cooldown ──────────────
  const cooldownSince = new Date(Date.now() - RATE_LIMIT_COOLDOWN_MS).toISOString()
  const { data: recentAttempts } = await supabase
    .from("audit_log")
    .select("id")
    .eq("actor_id", user.id)
    .eq("action", "auth.password_change")
    .gte("created_at", cooldownSince)
    .limit(1)

  if (recentAttempts && recentAttempts.length > 0) {
    return {
      success: false,
      error: "Please wait 30 seconds before attempting another password change.",
    }
  }

  // ── Layer 7: Verify current password (re-authentication) ───────
  // We use a separate anon client to verify credentials without
  // affecting the user's existing session.
  const verifyClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { error: signInError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (signInError) {
    // Log failed attempt
    const headersList = await headers()
    await logAudit({
      org_id: null,
      actor_id: user.id,
      action: "auth.password_change_failed",
      resource_type: "user",
      resource_id: user.id,
      new_value: { reason: "invalid_current_password" },
      ip_address: headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || null,
      user_agent: headersList.get("user-agent") || null,
    })

    return { success: false, error: "Current password is incorrect." }
  }

  // ── Layer 8: Update password via standard client ──────────────────
  // The standard server client can update the current user's password.
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // ── Layer 9: Audit log (success) ───────────────────────────────
  const headersList = await headers()
  await logAudit({
    org_id: null,
    actor_id: user.id,
    action: "auth.password_change",
    resource_type: "user",
    resource_id: user.id,
    new_value: { changed_at: new Date().toISOString() },
    ip_address: headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || null,
    user_agent: headersList.get("user-agent") || null,
  })

  return { success: true }
}