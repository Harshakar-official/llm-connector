import { NextRequest, NextResponse } from "next/server"
import { getSafeSession, verifyProjectAccess } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/utils/permissions"

export const dynamic = 'force-dynamic'

const STORAGE_PATH_RE = /^[a-f0-9-]+\/poc\/[a-f0-9-]+\.[a-z]+$/i

/**
 * Z+ SECURITY: Secure Image Viewer
 * Instead of serving images from a public bucket, this API:
 * 1. Verifies the user's session and organization.
 * 2. Extracts the Project ID from the storage path.
 * 3. Verifies if the user has access to that specific project.
 * 4. Generates a short-lived (60s) signed URL for the image.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const path = searchParams.get('path')

        if (!path) {
            return NextResponse.json({ error: "Storage path is required" }, { status: 400 })
        }

        if (!STORAGE_PATH_RE.test(path)) {
            return NextResponse.json({ error: "Invalid storage path format" }, { status: 400 })
        }

        if (path.includes("..") || path.includes("~")) {
            return NextResponse.json({ error: "Invalid storage path" }, { status: 400 })
        }

        // 1. Get Session & Org
        const { orgId, error: authError } = await getSafeSession()
        if (authError || !orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // 2. Extract Project ID from path (Format: [project_id]/poc/[uuid].[ext])
        const pathParts = path.split('/')
        const projectId = pathParts[0]

        // 3. Verify Project Access
        const { allowed, role, error: accessError } = await verifyProjectAccess(projectId)
        if (!allowed) {
            return NextResponse.json({ error: accessError || "Access denied to this project's artifacts" }, { status: 403 })
        }
        if (role && !hasPermission(role, "findings:upload_poc")) {
            return NextResponse.json({ error: "Permission denied" }, { status: 403 })
        }

        // 4. Look up the attachment in vuln_attachments to confirm it belongs to this org
        const supabase = await getServerClient()
        const filename = pathParts[pathParts.length - 1]
        const { data: attachment } = await supabase
            .from("vuln_attachments")
            .select("id, vuln_id")
            .eq("stored_filename", filename)
            .maybeSingle()

        if (!attachment) {
            return NextResponse.json({ error: "File not found" }, { status: 404 })
        }

        // 5. Generate Signed URL via Standard Client
        const { data, error: signedUrlError } = await supabase.storage
            .from('poc-files')
            .createSignedUrl(path, 60)

        if (signedUrlError || !data?.signedUrl) {
            console.error("[PoCViewerAPI] Signed URL error:", signedUrlError)
            return NextResponse.json({ error: "Failed to generate secure access link" }, { status: 500 })
        }

        // 6. Redirect to the secure signed URL
        return NextResponse.redirect(data.signedUrl)

    } catch (err) {
        console.error("[PoCViewerAPI] Global error:", err)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
