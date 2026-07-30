"use server"

import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

// ─── Constants ─────────────────────────────────────────────────
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"]
const UPLOAD_COOLDOWN_MS = 30_000 // 30 seconds between avatar uploads

// ─── Magic Bytes (File Signatures) ─────────────────────────────
// These are the first bytes of each valid format — used to verify
// that the actual file content matches the claimed MIME type.
// This prevents attackers from renaming malicious files.
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
    minLength: 12, // RIFF + size + "WEBP"
  },
}

// ─── Helpers ───────────────────────────────────────────────────

function getExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }
  return map[mimeType] || "png"
}

/**
 * Verify that the file's magic bytes match the claimed MIME type.
 * This is a defense-in-depth measure — even if an attacker spoofs
 * the MIME type in the request, the actual file content is checked.
 */
function verifyMagicBytes(buffer: ArrayBuffer, claimedMimeType: string): boolean {
  const spec = MAGIC_BYTES[claimedMimeType]
  if (!spec) return false

  if (buffer.byteLength < spec.minLength) return false

  const view = new Uint8Array(buffer)
  for (let i = 0; i < spec.bytes.length; i++) {
    if (view[i] !== spec.bytes[i]) return false
  }

  // Additional WebP check: bytes 8-11 must be "WEBP"
  if (claimedMimeType === "image/webp") {
    const webpMarker = [0x57, 0x45, 0x42, 0x50] // "W","E","B","P"
    for (let i = 0; i < webpMarker.length; i++) {
      if (view[8 + i] !== webpMarker[i]) return false
    }
  }

  return true
}

/**
 * Check if the user has uploaded an avatar recently (rate limiting).
 * Uses the audit_log table to find the last avatar upload timestamp.
 */
async function checkUploadCooldown(userId: string): Promise<boolean> {
  try {
    const supabase = await getServerClient()
    const { data } = await supabase
      .from("audit_log")
      .select("created_at")
      .eq("actor_id", userId)
      .eq("action", "profile.avatar_updated")
      .order("created_at", { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      const lastUpload = new Date(data[0].created_at).getTime()
      if (Date.now() - lastUpload < UPLOAD_COOLDOWN_MS) {
        return false // still in cooldown
      }
    }
    return true
  } catch {
    // If audit_log check fails, allow the upload (fail open for UX)
    return true
  }
}

// ─── Main Server Action ────────────────────────────────────────

export async function uploadAvatarAction(
  _prevState: { success: boolean; error?: string; avatarUrl?: string } | null,
  formData: FormData
): Promise<{ success: boolean; error?: string; avatarUrl?: string }> {
  try {
    const supabase = await getServerClient()

    // ── 1. Authentication Check ──────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Authentication required. Please log in again." }
    }

    // ── 2. Rate Limiting (Cooldown Check) ────────────────────
    const canUpload = await checkUploadCooldown(user.id)
    if (!canUpload) {
      return {
        success: false,
        error: "Please wait 30 seconds before uploading another avatar.",
      }
    }

    // ── 3. File Extraction & Existence Check ─────────────────
    const file = formData.get("avatar") as File | null
    if (!file || file.size === 0) {
      return { success: false, error: "No file provided." }
    }

    // ── 4. Server-Side MIME Type Validation ──────────────────
    //    We validate on the server even though the client also checks,
    //    because client-side validation can be bypassed.
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `Invalid file type: ${file.type || "unknown"}. Only PNG, JPEG, and WebP images are allowed.`,
      }
    }

    // ── 5. Server-Side Size Validation ───────────────────────
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 2MB.`,
      }
    }

    // ── 6. Magic Bytes Verification (Content-Based) ──────────
    //    Read the file as ArrayBuffer and verify the actual bytes
    //    match the claimed MIME type. This catches:
    //    - Renamed files (e.g., shell.php → avatar.png)
    //    - Polyglot files
    //    - Corrupted files
    const arrayBuffer = await file.arrayBuffer()
    if (!verifyMagicBytes(arrayBuffer, file.type)) {
      return {
        success: false,
        error: "File content does not match its claimed type. Only valid PNG, JPEG, and WebP images are accepted.",
      }
    }

    // ── 7. Sanitized Filename Generation ─────────────────────
    //    Use MIME-type-derived extension (NOT user-provided extension)
    //    to prevent extension-based attacks.
    const ext = getExtensionFromMimeType(file.type)
    const filename = `${user.id}.${ext}`

    // ── 8. Upload to Supabase Storage ────────────────────────
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filename, file, {
        upsert: true,
        contentType: file.type, // Explicitly set content-type
        cacheControl: "public, max-age=86400, immutable", // 24h cache
      })

    if (uploadError) {
      console.error("[uploadAvatarAction] Storage upload failed:", uploadError)
      return { success: false, error: "Failed to upload avatar. Please try again." }
    }

    // ── 9. Get Public URL ────────────────────────────────────
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(filename)

    // Append a version timestamp to bypass browser caching globally
    const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

    // ── 10. Update Profile ───────────────────────────────────
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id)

    if (updateError) {
      console.error("[uploadAvatarAction] Profile update failed:", updateError)
      return { success: false, error: "Avatar uploaded but profile update failed. Please try again." }
    }

    // ── 11. Audit Log ────────────────────────────────────────
    try {
      const headersList = await headers()
      await logAudit({
        org_id: null, // avatar change is user-level, not org-level
        actor_id: user.id,
        action: "profile.avatar_updated",
        resource_type: "profile",
        resource_id: user.id,
        new_value: {
          avatar_url: publicUrl,
          mime_type: file.type,
          file_size_bytes: file.size,
        },
        ip_address: headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || null,
        user_agent: headersList.get("user-agent") || null,
      })
    } catch (auditErr) {
      // Non-critical — log but don't fail the upload
      console.warn("[uploadAvatarAction] Audit log write failed:", auditErr)
    }

    // ── 12. Revalidate & Return ──────────────────────────────
    revalidatePath("/", "layout")
    return { success: true, avatarUrl: publicUrl }
  } catch (err) {
    console.error("[uploadAvatarAction] Unexpected error:", err)
    return { success: false, error: "An unexpected error occurred. Please try again." }
  }
}