import { NextRequest, NextResponse } from "next/server"
import { getSafeSession, verifyProjectAccess } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { hasPermission } from "@/lib/utils/permissions"
import crypto from "crypto"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export const dynamic = 'force-dynamic'

// Allowed PoC mime types (mirror Section 16 allowlist, scoped to images + pdf)
const ALLOWED_MIME = new Set([
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'application/json',
])
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.json']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * POST /api/poc/upload
 * Upload a PoC screenshot/evidence file for a project's vulnerability.
 * Body: multipart/form-data with `file` and `projectId` fields.
 * Returns: { storagePath, viewUrl }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSafeSession()
        if (session.error || !session.orgId || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const orgId = session.orgId
        const userId = session.user.id

        const rateResult = await slidingWindowRateLimit(`poc-upload:${userId}`, 20, 3600)
        if (!rateResult.success) {
            return NextResponse.json({ error: "Too many uploads. Max 20 per hour." }, { status: 429 })
        }

        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const projectId = formData.get('projectId') as string | null

        if (!file || !projectId) {
            return NextResponse.json({ error: "Missing file or projectId" }, { status: 400 })
        }

        // Verify project access
        const { allowed, role, error: accessError } = await verifyProjectAccess(projectId)
        if (!allowed) {
            return NextResponse.json({ error: accessError || "Access denied" }, { status: 403 })
        }
        if (role && !hasPermission(role, "findings:upload_poc")) {
            return NextResponse.json({ error: "Permission denied" }, { status: 403 })
        }

        // Validate file
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: `File too large. Max ${MAX_SIZE / 1024 / 1024}MB.` }, { status: 413 })
        }
        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
        if (!ALLOWED_EXT.some(e => e === ext)) {
            return NextResponse.json({ error: `File type not allowed: ${ext}` }, { status: 415 })
        }
        if (!file.type || !ALLOWED_MIME.has(file.type)) {
            return NextResponse.json({ error: `MIME type not allowed: ${file.type || "unknown"}` }, { status: 415 })
        }

        // Rename to UUID (never use original filename in storage path)
        const safeFilename = `${crypto.randomUUID()}${ext}`
        const storagePath = `${projectId}/poc/${safeFilename}`

        // Upload
        const supabase = await getServerClient()
        const buffer = Buffer.from(await file.arrayBuffer())
        const { error: uploadError } = await supabase.storage
            .from('poc-files')
            .upload(storagePath, buffer, {
                contentType: file.type || 'application/octet-stream',
                upsert: false,
            })
        if (uploadError) {
            console.error("[PoCUpload] Storage error:", uploadError)
            return NextResponse.json({ error: "Upload failed" }, { status: 500 })
        }

        // Audit log
        await logAudit({
            org_id: orgId,
            actor_id: userId,
            action: 'poc.uploaded',
            resource_type: 'project',
            resource_id: projectId,
            new_value: {
                storagePath,
                originalFilename: file.name,
                sizeBytes: file.size,
                mimeType: file.type,
            },
        }).catch(() => { /* non-fatal */ })

        return NextResponse.json({
            success: true,
            storagePath,
            // The view URL goes through our secure /api/poc/view?path=... proxy
            viewUrl: `/api/poc/view?path=${encodeURIComponent(storagePath)}`,
            originalFilename: file.name,
            sizeBytes: file.size,
        })
    } catch (err: any) {
        console.error("[PoCUpload] Global error:", err)
        return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
    }
}
