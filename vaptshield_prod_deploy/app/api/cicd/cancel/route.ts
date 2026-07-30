import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { releaseCicdSession, killContainer } from "@/lib/docker/manager"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

/**
 * POST /api/cicd/cancel
 *
 * Cancels a running CI/CD scan: marks scan_history as 'cancelled',
 * updates cicd_configs status, and kills the Docker worker container.
 */
export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = await slidingWindowRateLimit(`cicd-cancel:${user.id}`, 10, 60)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: "No org found" }, { status: 400 })
    }

    const { scanId } = await req.json()
    if (!scanId || typeof scanId !== "string") {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 })
    }

    const pool = getPool()

    // ─── 1. Verify the scan exists and belongs to this org ───────────
    const { rows: scanRows } = await pool.query(
      `SELECT id, status, org_id, scan_target, started_by
       FROM scan_history
       WHERE id = $1 AND org_id = $2`,
      [scanId, profile.org_id],
    )

    if (scanRows.length === 0) {
      return NextResponse.json(
        { error: "Scan not found" },
        { status: 404 },
      )
    }

    const scan = scanRows[0]

    // ─── L4: Cancel Permission Check ───
    const canCancel = profile.role === "admin" || profile.role === "security_engineer" || scan.started_by === user.id
    if (!canCancel) {
      return NextResponse.json({ error: "Forbidden: You did not start this scan" }, { status: 403 })
    }

    // Only cancel running or queued scans
    if (scan.status !== "running" && scan.status !== "queued") {
      return NextResponse.json(
        { error: `Scan is already ${scan.status}` },
        { status: 409 },
      )
    }

    // ─── 2. Kill the Docker worker container ────────────────────────
    const containerId = `cicd-${scanId}`
    await killContainer(containerId, { id: user.id, org_id: profile.org_id, role: profile.role })

    // ─── 3. Release the CI/CD Docker slot ────────────────────────────
    await releaseCicdSession(scanId, profile.org_id)

    // ─── 4. Mark scan_history as cancelled ──────────────────────────
    await pool.query(
      `UPDATE scan_history
       SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1`,
      [scanId],
    )

    // ─── 5. Update cicd_configs status ──────────────────────────────
    // Find the matching config by repo_url in this org
    await pool.query(
      `UPDATE cicd_configs
       SET last_scan_status = 'cancelled'
       WHERE repo_url = $1 AND org_id = $2`,
      [scan.scan_target, profile.org_id],
    )

    return NextResponse.json({
      ok: true,
      scanId,
      previousStatus: scan.status,
      newStatus: "cancelled",
    })
  } catch (e: any) {
    console.error("[API_CICD_CANCEL] Error:", e)
    return NextResponse.json(
      { error: "Failed to cancel scan" },
      { status: 500 },
    )
  }
}