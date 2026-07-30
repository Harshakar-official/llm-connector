import { NextRequest, NextResponse } from "next/server"
import { getSafeSession, verifyProjectAccess } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { hasPermission } from "@/lib/utils/permissions"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Path validation: must be [project_id]/[filename].pdf, no path traversal
const ReportPathSchema = z.string()
  .min(5)
  .max(200)
  .regex(/^[a-f0-9\-]+\/vapt-report-[a-f0-9\-]+-\d{4}-\d{2}-\d{2}T[\w\-]+\.(pdf|docx)$/i, 
    "Invalid report path format. Expected: [project_id]/[filename].pdf or .docx")
  .refine(p => !p.includes('..') && !p.startsWith('/') && !p.includes('\\'), 
    "Path traversal characters are not allowed")

/**
 * Z+ SECURITY: Secure Report Downloader
 * 1. Validates path format (no traversal attacks)
 * 2. Verifies the user's session and organization.
 * 3. Verifies if the user has access to the project associated with the report.
 * 4. Verifies the report belongs to the user's organization (RLS bypass protection)
 * 5. Generates a signed URL for the report artifact.
 * 6. Logs the download for audit trail.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const rawPath = searchParams.get('path')

        if (!rawPath) {
            return NextResponse.json({ error: "Report path is required" }, { status: 400 })
        }

        // Decode URL components if any (e.g. %2F -> /) first to handle URL-encoded queries correctly
        let relativePath = decodeURIComponent(rawPath)

        // Extract relative path if a full URL is passed
        if (relativePath.includes('/reports/')) {
            const index = relativePath.indexOf('/reports/')
            relativePath = relativePath.substring(index + '/reports/'.length)
        }
        if (relativePath.includes('?')) {
            relativePath = relativePath.split('?')[0]
        }

        // 0. Path validation: prevent traversal attacks and malformed paths
        const pathValidation = ReportPathSchema.safeParse(relativePath)
        if (!pathValidation.success) {
            console.error("[ReportDownloadAPI] Validation error for path:", relativePath, pathValidation.error)
            return NextResponse.json({ error: "Invalid report path format" }, { status: 400 })
        }

        // 1. Get Session
        const { orgId, user, error: authError } = await getSafeSession()
        if (authError || !orgId || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // 2. Extract Project ID from path (Format: [project_id]/[filename])
        const projectId = relativePath.split('/')[0]
        if (!projectId) {
            return NextResponse.json({ error: "Invalid report path format" }, { status: 400 })
        }

        // 3. Verify Project Access (SE, PM, and Admin can all download)
        const { allowed, role, error: accessError } = await verifyProjectAccess(projectId)
        if (!allowed) {
            return NextResponse.json({ error: accessError || "Access denied" }, { status: 403 })
        }
        if (role && !hasPermission(role, "reports:export")) {
            return NextResponse.json({ error: "Permission denied" }, { status: 403 })
        }

        // 3a. Verify the report belongs to the user's org (prevent cross-org access)
        const supabase = await getServerClient()
        const { data: reportRecord } = await supabase
            .from('reports')
            .select('id, org_id')
            .eq('project_id', projectId)
            .eq('org_id', orgId)
            .limit(1)
            .maybeSingle()

        if (!reportRecord) {
            return NextResponse.json({ error: "Report not found in your organization" }, { status: 404 })
        }

        // 4. Generate Signed URL
        const { data, error: signedUrlError } = await supabase.storage
            .from('reports')
            .createSignedUrl(relativePath, 60) // 60 seconds validity

        if (signedUrlError || !data?.signedUrl) {
            console.error("[ReportDownloadAPI] Signed URL error:", signedUrlError)
            return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 })
        }

        // 5. Audit log the download
        await logAudit({
            org_id: orgId,
            actor_id: user.id,
            action: 'report.downloaded',
            resource_type: 'report',
            resource_id: reportRecord.id,
            new_value: { path: relativePath, project_id: projectId }
        })

        // 6. Redirect to the secure link
        return NextResponse.redirect(data.signedUrl)

    } catch (err) {
        console.error("[ReportDownloadAPI] Global error:", err)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
