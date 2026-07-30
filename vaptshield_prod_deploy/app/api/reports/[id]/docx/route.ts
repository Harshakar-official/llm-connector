import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getSupabaseWithToken } from '@/lib/supabase/token-client'
import { hasPermission } from '@/lib/utils/permissions'
import fs from 'fs'
import path from 'path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import jwt from 'jsonwebtoken'

/**
 * SERVE DYNAMIC DOCX
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: reportId } = await params
        const url = new URL(req.url)
        const token = url.searchParams.get('token')
        const accessToken = url.searchParams.get('access_token')
        const secret = process.env.ONLYOFFICE_JWT_SECRET

        let authenticated = false
        let isServerToServer = false

        // 1. Check for valid internal JWT token (Server-to-Server context, e.g. ONLYOFFICE)
        if (token && secret) {
            try {
                jwt.verify(token, secret)
                authenticated = true
                isServerToServer = true
            } catch (e) {
                console.error("[DocxAPI] JWT Verification Failed")
            }
        } else if (token && !secret) {
            console.error("[DocxAPI] ONLYOFFICE_JWT_SECRET not configured, rejecting JWT auth")
        }

        // 2. Initialize Supabase client
        let supabase
        if (accessToken) {
            supabase = getSupabaseWithToken(accessToken)
        } else {
            supabase = await getServerClient()
        }

        // 3. Fetch Report Data
        const { data: report, error: rError } = await supabase
            .from('reports')
            .select('*, projects(name, org_id)')
            .eq('id', reportId)
            .single()

        if (rError || !report) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 })
        }

        // 4. AUTHORIZATION: for anything that is NOT a trusted server-to-server call,
        // require an authenticated user whose org owns this report. Previously the
        // `authenticated` flag was computed but never enforced, leaving this route
        // relying solely on RLS (potential cross-org report disclosure).
        if (!isServerToServer) {
            const { data: { user }, error: authError } = await supabase.auth.getUser()
            if (authError || !user) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id, role')
                .eq('id', user.id)
                .single()

            const reportOrgId = (report.projects as { org_id?: string } | null)?.org_id
            if (!profile?.org_id || !reportOrgId || profile.org_id !== reportOrgId) {
                return NextResponse.json({ error: "Access denied" }, { status: 403 })
            }
            if (!hasPermission(profile.role, "reports:export")) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 })
            }
            authenticated = true
        }

        if (!authenticated) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // 2. Load the Base Template
        const templatePath = path.join(process.cwd(), 'public/templates/base_report.docx')
        const content = fs.readFileSync(templatePath, 'binary')
        const zip = new PizZip(content)
        
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        })

        // Utility to strip HTML tags
        const stripHtml = (html: string) => {
            if (!html) return "";
            return html.replace(/<[^>]*>?/gm, '');
        };

        // 3. Prepare Data for Merge
        const mergeData = {
            project_name: report.projects.name,
            client_name: report.report_content?.project_details?.client_name || "Valued Client",
            generated_at: new Date(report.created_at).toLocaleDateString(),
            executive_summary: stripHtml(report.report_content?.executive_summary) || "No summary provided.",
            technical_summary: stripHtml(report.report_content?.technical_summary) || "No technical details.",
            methodology: stripHtml(report.report_content?.methodology) || "Standard VAPT Methodology.",
            recommendations: stripHtml(report.report_content?.recommendations) || "No recommendations.",
            // Findings table data
            findings: (report.report_content?.findings || []).map((f: any, i: number) => ({
                idx: i + 1,
                title: f.title,
                severity: f.severity.toUpperCase(),
                cvss: f.cvss_score || "N/A",
                description: stripHtml(f.description) || "N/A"
            }))
        }

        // Render the document (replace placeholders)
        doc.render(mergeData)

        const buf = doc.getZip().generate({ type: 'nodebuffer' })

        // 4. Return as File Stream
        return new NextResponse(new Uint8Array(buf), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="report_${reportId}.docx"`
            }
        })

    } catch (err) {
        console.error("[DocxAPI] Crash:", err)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
