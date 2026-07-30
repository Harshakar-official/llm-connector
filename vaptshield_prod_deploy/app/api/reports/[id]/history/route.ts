// ============================================================
// VAPTShield — Report Version History
// GET  /api/reports/[id]/history?v=N   — Fetch a specific version's snapshot
// Used by V2 Master Editor's "Restore" button in the History side panel.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/utils/permissions'
import { logAudit } from '@/lib/utils/audit-server'
import type { Role } from '@/lib/supabase/types'
import type { ReportContent, VersionHistoryEntry } from '@/lib/reports/engine'

export const dynamic = 'force-dynamic'

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await getServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id, role')
            .eq('id', user.id)
            .single()
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
        }

        const role = profile.role as Role
        if (!hasPermission(role, 'reports:edit')) {
            return NextResponse.json(
                { error: 'Forbidden: insufficient permissions' },
                { status: 403 }
            )
        }

        const { id: reportId } = await params
        const { searchParams } = new URL(req.url)
        const vParam = searchParams.get('v')
        const targetVersion = vParam ? parseInt(vParam, 10) : null

        // Fetch report (with org isolation)
        const { data: report, error: fetchError } = await supabase
            .from('reports')
            .select('id, report_content, version, project_id, org_id')
            .eq('id', reportId)
            .eq('org_id', profile.org_id)
            .single()
        if (fetchError || !report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 })
        }

        const content = report.report_content as unknown as ReportContent
        const history = content._version_history || []

        // If no version requested, return the full history list
        if (targetVersion === null) {
            return NextResponse.json({
                success: true,
                history,
                current_version: report.version,
            })
        }

        // Find the specific version entry
        const entry = history.find(h => h.v === targetVersion)
        if (!entry) {
            return NextResponse.json({
                error: `Version ${targetVersion} not found in history (have ${history.length} versions)`
            }, { status: 404 })
        }

        // True Rollback (Task 1): if the entry has a snapshot, return it.
        // Otherwise, gracefully degrade to current content (legacy behavior).
        if (!entry.snapshot) {
            return NextResponse.json({
                error: `Snapshot data for version ${targetVersion} is no longer available.`
            }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            version: report.version,
            data: entry.snapshot,
            entry,
        })
    } catch (error) {
        console.error('[ReportHistory] error:', error)
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
    }
}
