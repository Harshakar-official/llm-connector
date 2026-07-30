// ============================================================
// VAPTShield — Report Finalization API
// POST /api/reports/generate
// Takes a saved draft (JSON) and renders both DOCX and PDF.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { logAudit } from "@/lib/utils/audit-server"
import { createNotification } from '@/lib/supabase/notification-actions'
import { hasPermission } from '@/lib/utils/permissions'
import {
  fetchPoCBuffers,
  fetchLogoBuffer,
  updateReportUrls,
  uploadToStorage,
  appendVersion,
  ReportContent
} from '@/lib/reports/engine'
import { generateModernReport } from '@/lib/reports/modern-generator'
import { GenerateRequestSchema, formatZodError } from '@/lib/reports/schema'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'


export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await getServerClient()
    
    // 1. Auth & Authz Validation
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('org_id, role, full_name, avatar_url').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    // Explicit Permission Check for report generation
    if (!hasPermission(profile.role, 'reports:generate')) {
        return NextResponse.json({ error: 'Forbidden: Missing reports generation permission' }, { status: 403 })
    }

    const reqBody = await req.json().catch(() => ({}))
    const { projectId } = reqBody
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

    // 2. Concurrency & Rate Limiting Check
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString()
    const { count: recentAttempts } = await supabase
      .from("audit_log")
      .select("id", { count: 'exact', head: true })
      .eq("action", "report.generation_started")
      .eq("new_value->>project_id", projectId)
      .gte("created_at", oneMinuteAgo)

    if (recentAttempts !== null && recentAttempts > 0) {
      return NextResponse.json(
        { error: "Generation is currently locked or in progress. Please try again in a minute." },
        { status: 429 }
      )
    }

    // Log the generation attempt to act as a pseudo-lock
    await logAudit({
        org_id: profile.org_id,
        actor_id: user.id,
        action: 'report.generation_started',
        resource_type: 'report',
        resource_id: projectId, // Use projectId as resource for lock
        new_value: { status: 'started', project_id: projectId }
    })

    // 3. Fetch Latest Content via Engine (which synthesizes fresh data if needed)
    const { getOrCreateReportDraft } = await import('@/lib/reports/engine')
    const draftData = await getOrCreateReportDraft(projectId, profile.org_id, user.id)
    
    if (!draftData || !draftData.content) {
        return NextResponse.json({ error: 'Failed to synthesize report data' }, { status: 500 })
    }

    const content = draftData.content
    const projectName = draftData.project?.name || "Project"
    const orgName = draftData.orgName || "Organization"

    // 4. Input Bounds & Sanity Checks
    if (content.findings && content.findings.length > 500) {
        return NextResponse.json({ error: "Report payload exceeds maximum allowed findings (500 limit)." }, { status: 413 })
    }

    // 5. Fetch Assets (Logo + PoCs)
    let logoBuffer = null;
    let pocBuffers = {};
    
    try {
        [logoBuffer, pocBuffers] = await Promise.all([
            fetchLogoBuffer(content.org_logo_url || null),
            fetchPoCBuffers(content)
        ])
    } catch (assetErr) {
        console.warn("[ReportGenerate] Warning: Failed to fetch some report assets (PoC/Logo). Proceeding with text only.", assetErr)
    }

    let docxBuffer: Buffer
    let pdfBuffer: Buffer

    try {
        const reportDate = new Date(Date.now()).toLocaleDateString("en-US", {
            year: "numeric", month: "long", day: "numeric"
        })
        const result = await generateModernReport(orgName, projectName, content, {
            date: reportDate,
            logoBuffer,
            pocBuffers: pocBuffers as any
        })
        docxBuffer = result.docxBuffer
        pdfBuffer = result.pdfBuffer
    } catch (modernErr: any) {
        console.error('[ReportGenerate] Generation Error:', modernErr)
        return NextResponse.json({ error: 'Report rendering failed', details: modernErr.message }, { status: 500 })
    }

    // 8. Upload both files to Storage
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const docxFilename = `vapt-report-${projectId}-${timestamp}.docx`
    const pdfFilename = `vapt-report-${projectId}-${timestamp}.pdf`
    let docxUrl = ''
    let pdfUrl = ''

    try {
        [docxUrl, pdfUrl] = await Promise.all([
            uploadToStorage(
                docxBuffer,
                docxFilename,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                projectId
            ),
            uploadToStorage(
                pdfBuffer,
                pdfFilename,
                'application/pdf',
                projectId
            )
        ])
    } catch (uploadErr: any) {
        console.error('[ReportGenerate] Upload Error:', uploadErr)
        return NextResponse.json({ error: `Failed to upload generated reports: ${uploadErr.message}`, details: uploadErr.message }, { status: 502 })
    }

    // 9. Finalize Record (Insert NEW row)
    const { data: newReport, error: insertError } = await supabase.from('reports').insert({
        project_id: projectId,
        org_id: profile.org_id,
        created_by: user.id,
        title: `VAPT Report — ${projectName}`,
        status: 'final',
        template_type: 'standard_vapt',
        report_content: content as any,
        docx_url: docxUrl,
        pdf_url: pdfUrl,
        version: 1
    }).select('id, title, status, docx_url, pdf_url, created_at, version, report_content, profiles:created_by(full_name, avatar_url)').single()

    if (insertError || !newReport) {
        console.error('[ReportGenerate] Failed to insert new report row:', insertError)
        return NextResponse.json({ error: 'Report generated but failed to save to database.' }, { status: 500 })
    }

    const newReportId = newReport.id

    // 10. Notify & Audit
    await createNotification({
      user_id: user.id,
      org_id: profile.org_id,
      title: 'Report Ready',
      message: `Your final VAPT report for "${projectName}" is ready for download in both PDF and DOCX formats.`,
      type: 'report_ready',
    })

    await logAudit({
      org_id: profile.org_id,
      actor_id: user.id,
      action: 'report.finalized',
      resource_type: 'report',
      resource_id: newReportId,
      new_value: {
        project_id: projectId,
        docx_url: docxUrl,
        pdf_url: pdfUrl,
        generation_time_ms: Date.now() - startTime,
      },
    })

    return NextResponse.json({
      success: true,
      report: newReport,
      generation_time_ms: Date.now() - startTime,
    })

  } catch (error: any) {
    console.error('[ReportGenerate] Fatal Error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
