import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { killZapContainerByScanId } from "@/lib/scan-helpers"
import { logAudit } from "@/lib/utils/audit-server"
import { sanitizeError } from "@/lib/utils/api-error"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 })
    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const ip = req.headers.get("x-forwarded-for") || "anonymous"
    const rateResult = await slidingWindowRateLimit(`zap-complete:${user.id}`, 10, 3600)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    let newStatus = body.status || "completed"
    if (!["completed", "failed", "cancelled"].includes(newStatus)) {
      newStatus = "completed"
    }
    const pool = getPool()

    // Fetch the scan
    const { rows: scans } = await pool.query(
      `SELECT status, findings_found FROM scan_history WHERE id = $1 AND org_id = $2`,
      [id, profile.org_id]
    )
    if (scans.length === 0) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 })
    }

    const scan = scans[0]
    if (scan.status === "completed" || scan.status === "failed" || scan.status === "cancelled") {
      return NextResponse.json({ error: "Scan already finalized" }, { status: 400 })
    }

    // Kill the Docker container and free slot (if one exists)
    // Look up the real container_id from zap_tasks (docker_sessions.container_id
    // is overwritten with the real Docker hash on spawn, so the old `zap-${id}`
    // pattern never matches). Ownership already verified above (org_id filter).
    await killZapContainerByScanId(pool, id).catch(() => {})

    // Count pending alerts
    const { rows: alertCount } = await pool.query(
      `SELECT COUNT(*) as count FROM pending_alerts WHERE task_id = $1 AND org_id = $2`,
      [id, profile.org_id]
    )
    const totalFindings = scan.findings_found || Number(alertCount[0]?.count || 0)

    // Update scan_history
    await pool.query(
      `UPDATE scan_history
       SET status = $1, findings_found = $3, completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
       WHERE id = $2 AND org_id = $4`,
      [newStatus, id, totalFindings, profile.org_id]
    )

    await logAudit({
      action: "scan.completed",
      resource_type: "scan_history",
      resource_id: id,
      new_value: { status: newStatus, findings: totalFindings },
    })

    // Also update zap_tasks if row exists
    await pool.query(
      `UPDATE zap_tasks SET status = $1, completed_at = NOW()
       WHERE id = $2 AND org_id = $3 AND status IN ('queued', 'running')`,
      [newStatus === "cancelled" ? "failed" : newStatus, id, profile.org_id]
    ).catch(() => {})

    return NextResponse.json({ ok: true, status: newStatus, findings: totalFindings })
  } catch (e) {
    console.error("[complete] Error:", e)
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
