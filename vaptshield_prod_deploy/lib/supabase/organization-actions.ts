"use server"

import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

// ─── Constants ─────────────────────────────────────────────────
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"]
const LOGO_UPLOAD_COOLDOWN_MS = 60_000 // 1 minute between logo uploads
const ORG_UPDATE_COOLDOWN_MS = 5_000 // 5 seconds between profile updates

// ─── Magic Bytes (File Signatures) ─────────────────────────────
const MAGIC_BYTES: Record<string, { bytes: number[]; minLength: number }> = {
  "image/png": {
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    minLength: 8,
  },
  "image/jpeg": {
    bytes: [0xff, 0xd8, 0xff],
    minLength: 3,
  },
  "image/webp": {
    bytes: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    minLength: 12, 
  },
}

// ─── Validation Helpers ────────────────────────────────────────

const NAME_RE = /^[a-zA-Z0-9\s\-_&.,'()]+$/
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i
const ALLOWED_INDUSTRIES = ["Technology", "Finance", "Healthcare", "Government", "E-commerce", "Education", "Other"]

function sanitizeText(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim()
}

function verifyMagicBytes(buffer: ArrayBuffer, claimedMimeType: string): boolean {
  const spec = MAGIC_BYTES[claimedMimeType]
  if (!spec || buffer.byteLength < spec.minLength) return false
  const view = new Uint8Array(buffer)
  for (let i = 0; i < spec.bytes.length; i++) {
    if (view[i] !== spec.bytes[i]) return false
  }
  return true
}

// ─── Core Actions ──────────────────────────────────────────────

/**
 * Update Organization Details
 * Z+ SECURITY: Uses user session client, enforces rate limits, and validates inputs.
 */
export async function updateOrganizationAction(
    orgId: string, 
    data: { name?: string; industry?: string; website?: string; logo_url?: string }
) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Unauthorized" }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role, org_id")
        .eq("id", user.id)
        .single()
    
    const isSuperAdmin = profile?.role === 'super_admin'
    const isOrgAdmin = profile?.role === 'admin' && profile?.org_id === orgId
    
    if (!isSuperAdmin && !isOrgAdmin) return { success: false, error: "Access denied: Admin only." }

    // 1. Rate Limiting (Audit Fix A4)
    const cooldownSince = new Date(Date.now() - ORG_UPDATE_COOLDOWN_MS).toISOString()
    const { count: recentUpdates } = await supabase
        .from("audit_log")
        .select("*", { count: 'exact', head: true })
        .eq("actor_id", user.id)
        .eq("action", "org.updated")
        .gte("created_at", cooldownSince)

    if (recentUpdates && recentUpdates > 0) {
        return { success: false, error: "Please wait 5 seconds before updating again." }
    }

    // 2. Validation & Sanitization
    const sanitized: Record<string, string | null> = {}
    
    if (data.name !== undefined) {
        const name = sanitizeText(data.name)
        if (name.length < 2 || name.length > 100 || !NAME_RE.test(name)) {
            return { success: false, error: "Invalid organization name." }
        }
        sanitized.name = name
    }

    if (data.industry !== undefined) {
        if (!ALLOWED_INDUSTRIES.includes(data.industry)) {
            return { success: false, error: "Invalid industry selection." }
        }
        sanitized.industry = data.industry
    }

    if (data.website !== undefined) {
        const website = data.website.trim()
        if (website && !URL_RE.test(website)) {
            return { success: false, error: "Website must be a valid URL." }
        }
        sanitized.website = website || null
    }

    if (data.logo_url !== undefined) {
        sanitized.logo_url = data.logo_url
    }

    // 3. Execution (Audit Fix A3 - Use User Client for RLS verification)
    const { error: updateError } = await supabase
      .from("organizations")
      .update(sanitized)
      .eq("id", orgId)

    if (updateError) throw updateError

    // 4. Audit Logging
    const headersList = await headers()
    await logAudit({
      org_id: orgId,
      actor_id: user.id,
      action: "org.updated",
      resource_type: "organization",
      resource_id: orgId,
      new_value: sanitized,
      ip_address: headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || null,
      user_agent: headersList.get("user-agent") || null,
    })

    revalidatePath("/organization")
    revalidatePath(`/super-admin/organizations/${orgId}`)
    
    return { success: true, message: "Organization profile updated" }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update organization" }
  }
}

/**
 * Upload Organization Logo
 * Z+ SECURITY: Magic bytes verification, size limits, and org-isolation.
 */
export async function uploadOrganizationLogoAction(
  orgId: string,
  formData: FormData
): Promise<{ success: boolean; error?: string; logoUrl?: string }> {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Authentication required." }

    // 1. Authorization Check
    const { data: profile } = await supabase
        .from("profiles")
        .select("role, org_id")
        .eq("id", user.id)
        .single()
    
    if (profile?.role !== 'admin' || profile?.org_id !== orgId) {
        return { success: false, error: "Access denied. Only organization admins can upload logos." }
    }

    // 2. Cooldown Check
    const cooldownSince = new Date(Date.now() - LOGO_UPLOAD_COOLDOWN_MS).toISOString()
    const { count: recentUploads } = await supabase
        .from("audit_log")
        .select("*", { count: 'exact', head: true })
        .eq("actor_id", user.id)
        .eq("action", "org.logo_updated")
        .gte("created_at", cooldownSince)

    if (recentUploads && recentUploads > 0) {
        return { success: false, error: "Please wait 1 minute before uploading another logo." }
    }

    // 3. File Validation
    const file = formData.get("logo") as File | null
    if (!file || file.size === 0) return { success: false, error: "No file provided." }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) return { success: false, error: "Only PNG, JPEG, and WebP are allowed." }
    if (file.size > MAX_FILE_SIZE) return { success: false, error: "Logo must be under 2MB." }

    const arrayBuffer = await file.arrayBuffer()
    if (!verifyMagicBytes(arrayBuffer, file.type)) return { success: false, error: "Corrupted or invalid image file." }

    // 4. Upload
    const ext = file.type.split("/")[1]
    const path = `orgs/${orgId}/logo.${ext}`

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "public, max-age=3600",
      })

    if (uploadError) throw uploadError

    // 5. Update Database
    const { data: { publicUrl: rawUrl } } = supabase.storage.from("logos").getPublicUrl(path)
    
    // Append a version timestamp to bypass browser caching globally
    const publicUrl = `${rawUrl}?v=${Date.now()}`
    
    const result = await updateOrganizationAction(orgId, { logo_url: publicUrl })
    
    if (!result.success) return result

    // 6. Finalize Audit
    const headersList = await headers()
    await logAudit({
        org_id: orgId,
        actor_id: user.id,
        action: "org.logo_updated",
        resource_type: "organization",
        resource_id: orgId,
        new_value: { logo_url: publicUrl },
        ip_address: headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || null,
        user_agent: headersList.get("user-agent") || null,
    })

    revalidatePath("/organization")
    return { success: true, logoUrl: publicUrl }
  } catch (error: any) {
    console.error("[LogoUpload] Critical error:", error)
    return { success: false, error: error.message || "Internal server error" }
  }
}
