// ============================================================
// VAPTShield — Report Status Update
// PUT /api/reports/[id]/status   — Update workflow status
// Allowed: 'draft' | 'in_review' | 'final'
// Permission: reports:edit (admin, program_manager)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/utils/permissions'
import { logAudit } from '@/lib/utils/audit-server'
import type { Role } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = ['draft', 'in_review', 'final'] as const
type ReportStatus = (typeof ALLOWED_STATUSES)[number]

export async function PUT(
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
        const body = await req.json().catch(() => ({}))
        const newStatus = body.status as ReportStatus | undefined

        if (!newStatus || !ALLOWED_STATUSES.includes(newStatus)) {
            return NextResponse.json(
                { error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` },
                { status: 400 }
            )
        }

        // Verify report exists and belongs to org
        const { data: report, error: fetchError } = await supabase
            .from('reports')
            .select('id, status, project_id')
            .eq('id', reportId)
            .eq('org_id', profile.org_id)
            .single()
        if (fetchError || !report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 })
        }

        const previousStatus = report.status

        const { error: updateError } = await supabase
            .from('reports')
            .update({
                status: newStatus,
                updated_at: new Date().toISOString(),
            })
            .eq('id', reportId)
        if (updateError) {
            console.error('[ReportStatus] update error:', updateError)
            return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
        }

        await logAudit({
            org_id: profile.org_id,
            actor_id: user.id,
            action: 'report.status_changed',
            resource_type: 'report',
            resource_id: reportId,
            old_value: { status: previousStatus },
            new_value: { status: newStatus },
        })

        return NextResponse.json({
            success: true,
            status: newStatus,
            previous_status: previousStatus,
        })
    } catch (error) {
        console.error('[ReportStatus] error:', error)
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }
}
