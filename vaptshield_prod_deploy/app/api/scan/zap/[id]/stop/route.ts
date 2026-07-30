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
    const rateResult = await slidingWindowRateLimit(`zap-stop:${user.id}`, 10, 3600)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { id } = await params
    const pool = getPool()

    console.log(`[stop] Looking up scan id=${id}`)

    const { rows: scans } = await pool.query(
      `SELECT status, started_by FROM scan_history WHERE id = $1 AND org_id = $2`,
      [id, profile.org_id]
    )
    if (scans.length === 0) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 })
    }
    const scan = scans[0]
    if (profile.role !== "admin" && scan.started_by !== user.id) {
      return NextResponse.json({ error: "Forbidden: You can only stop your own scans" }, { status: 403 })
    }
    if (scan.status !== "running" && scan.status !== "queued") {
      return NextResponse.json({ error: "Scan is not running" }, { status: 400 })
    }

    // Update scan_history first (so processZapBackground's error handler sees 'cancelled')
    await pool.query(
      `UPDATE scan_history
       SET status = 'cancelled', completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
       WHERE id = $1 AND org_id = $2`,
      [id, profile.org_id]
    )
    await pool.query(
      `UPDATE zap_tasks SET status = 'cancelled', completed_at = NOW() WHERE id = $1 AND org_id = $2`,
      [id, profile.org_id]
    )

    // Kill container (after DB update, so daemon loop's error handler won't overwrite cancelled)
    // Looks up the real container_id from zap_tasks.container_id (actual Docker hash)
    await killZapContainerByScanId(pool, id)

    await logAudit({
      action: "scan.stopped",
      resource_type: "scan_history",
      resource_id: id,
    })

    return NextResponse.json({ ok: true, status: "cancelled" })
  } catch (e) {
    console.error("[stop] Error:", e)
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
