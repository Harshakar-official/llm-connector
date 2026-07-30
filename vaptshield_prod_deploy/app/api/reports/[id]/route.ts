// ============================================================
// VAPTShield — Report Builder API
// GET  /api/reports/[id]         — Fetch report with lock check
// PUT  /api/reports/[id]         — Auto-save report content
// POST /api/reports/[id]/lock    — Acquire edit lock
// POST /api/reports/[id]/unlock  — Release edit lock
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/utils/permissions'
import type { Role } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

// ─── LOCK TIMEOUT (15 minutes) ────────────────────────────────

const LOCK_TIMEOUT_MS = 15 * 60 * 1000

// ─── GET: Fetch Report ────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

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

    if (!hasPermission(profile.role, "reports:view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id: reportId } = await params

    const { data: report, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .eq('org_id', profile.org_id)
      .single()

    if (error || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Check if report is locked by someone else
    let lockStatus: { locked: boolean; locked_by_you: boolean; locked_by_name?: string } = {
      locked: false,
      locked_by_you: false,
    }

    if (report.locked_by && report.locked_at) {
      const lockAge = Date.now() - new Date(report.locked_at).getTime()
      if (lockAge < LOCK_TIMEOUT_MS) {
        lockStatus.locked = true
        lockStatus.locked_by_you = report.locked_by === user.id

        if (!lockStatus.locked_by_you) {
          const { data: locker } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', report.locked_by)
            .single()
          lockStatus.locked_by_name = locker?.full_name || 'Unknown'
        }
      }
    }

    return NextResponse.json({
      ...report,
      lock_status: lockStatus,
    })
  } catch (error) {
    console.error('[ReportBuilder GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch report' },
      { status: 500 }
    )
  }
}

// ─── PUT: Auto-Save Report Content ────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

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

    // ── Verify report exists and belongs to org ───────────────
    const { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('id, locked_by, locked_at, version')
      .eq('id', reportId)
      .eq('org_id', profile.org_id)
      .single()

    if (fetchError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // ── Check lock ────────────────────────────────────────────
    if (report.locked_by && report.locked_by !== user.id && report.locked_at) {
      const lockAge = Date.now() - new Date(report.locked_at).getTime()
      if (lockAge < LOCK_TIMEOUT_MS) {
        return NextResponse.json(
          { error: 'Report is currently being edited by another user' },
          { status: 423 }
        )
      }
    }

    // ── Build update payload ──────────────────────────────────
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      locked_by: user.id,
      locked_at: new Date().toISOString(),
      version: (report.version || 0) + 1,
    }

    // Only update fields that are provided
    if (body.title !== undefined) updateData.title = body.title
    if (body.executive_summary !== undefined) updateData.executive_summary = body.executive_summary
    if (body.methodology !== undefined) updateData.methodology = body.methodology
    if (body.scope !== undefined) updateData.scope = body.scope
    if (body.status !== undefined) updateData.status = body.status

    const { error: updateError } = await supabase
      .from('reports')
      .update(updateData)
      .eq('id', reportId)
      .eq('org_id', profile.org_id)
      .eq('version', report.version)

    if (updateError) {
      console.error('[ReportBuilder PUT] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to save report' },
        { status: 500 }
      )
    }

    // Optimistic locking check: if 0 rows updated, version conflict
    const { count } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('id', reportId)
      .eq('version', report.version + 1)

    if (!count || count === 0) {
      return NextResponse.json(
        { error: 'Report was edited by someone else. Refresh to see latest version.' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      version: updateData.version,
      saved_at: updateData.updated_at,
    })
  } catch (error) {
    console.error('[ReportBuilder PUT] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save report' },
      { status: 500 }
    )
  }
}

// ─── PATCH: Lock / Unlock ─────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

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
    const action = body.action as 'lock' | 'unlock' | undefined

    if (!action || !['lock', 'unlock'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "lock" or "unlock"' },
        { status: 400 }
      )
    }

    // ── Verify report exists ──────────────────────────────────
    const { data: report, error: fetchError } = await supabase
      .from('reports')
      .select('id, locked_by, locked_at')
      .eq('id', reportId)
      .eq('org_id', profile.org_id)
      .single()

    if (fetchError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (action === 'lock') {
      // Check if already locked by someone else
      if (report.locked_by && report.locked_by !== user.id && report.locked_at) {
        const lockAge = Date.now() - new Date(report.locked_at).getTime()
        if (lockAge < LOCK_TIMEOUT_MS) {
          return NextResponse.json(
            { error: 'Report is currently being edited by another user' },
            { status: 423 }
          )
        }
      }

      const { error: lockError } = await supabase
        .from('reports')
        .update({
          locked_by: user.id,
          locked_at: new Date().toISOString(),
        })
        .eq('id', reportId)
        .eq('org_id', profile.org_id)

      if (lockError) {
        return NextResponse.json({ error: 'Failed to acquire lock' }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'locked' })
    }

    // action === 'unlock'
    if (report.locked_by !== user.id) {
      return NextResponse.json(
        { error: 'Cannot release lock held by another user' },
        { status: 403 }
      )
    }

    const { error: unlockError } = await supabase
      .from('reports')
      .update({
        locked_by: null,
        locked_at: null,
      })
      .eq('id', reportId)
      .eq('org_id', profile.org_id)

    if (unlockError) {
      return NextResponse.json({ error: 'Failed to release lock' }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'unlocked' })
  } catch (error) {
    console.error('[ReportBuilder PATCH] Error:', error)
    return NextResponse.json(
      { error: 'Lock operation failed' },
      { status: 500 }
    )
  }
}