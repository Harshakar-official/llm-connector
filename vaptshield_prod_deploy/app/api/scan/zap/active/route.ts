import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { hasPermission } from "@/lib/utils/permissions"
import { releaseDockerSlot } from "@/lib/docker/quota"

const WORKER_URL = process.env.DOCKER_HOST_API_URL || ""
const WORKER_KEY = process.env.DOCKER_HOST_API_KEY || ""

async function isContainerAlive(containerId: string): Promise<boolean | null> {
  if (!WORKER_URL || !WORKER_KEY) return null // can't verify — assume alive
  try {
    const res = await fetch(`${WORKER_URL}/check-container`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WORKER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ containerId }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null // worker error — assume alive
    const data = await res.json()
    return data.running === true
  } catch {
    return null // network error — assume alive
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    if (!hasPermission(profile.role, "scanners:view_history")) {
      return NextResponse.json({ scanId: null, activeScans: [] })
    }

    const pool = getPool()
    const url = new URL(req.url)
    const queryScanId = url.searchParams.get("scanId")

    const { rows } = await pool.query(
      `SELECT sh.id, sh.status, sh.scan_target, sh.scan_type, sh.project_id,
              zt.progress, zt.progress_detail
       FROM scan_history sh
       LEFT JOIN zap_tasks zt ON zt.id = sh.id
       WHERE sh.org_id = $1
         AND sh.scan_type = 'zap'
         AND sh.status IN ('running', 'queued')
       ORDER BY sh.created_at DESC`,
      [profile.org_id]
    )

    if (rows.length === 0) {
      return NextResponse.json({ scanId: null, activeScans: [] })
    }

    // Find the specific scan if requested, otherwise default to the most recent one
    let scan = queryScanId ? rows.find(r => r.id === queryScanId) : rows[0]
    if (!scan) {
      scan = rows[0]
    }

    // ── Container liveness check for "running" scans ──────────────
    // Prevents phantom scans: if the Docker container is dead or the
    // docker_sessions row is missing, auto-fail the scan and return null.
    if (scan.status === "running") {
      const { rows: sessions } = await pool.query(
        `SELECT container_id, id FROM docker_sessions
         WHERE (container_id = $1 OR container_id LIKE $2)
           AND status IN ('starting', 'running', 'idle')
         LIMIT 1`,
        [`zap-${scan.id}`, `zap-${scan.id}-%`]
      )

      if (sessions.length === 0) {
        // No docker_session row at all — container was never started
        // or the DB row was cleaned up. Auto-fail to prevent phantom scan.
        console.log(`[active] Scan ${scan.id} is 'running' but no docker_session found. Auto-failing...`)
        await pool.query(
          `UPDATE scan_history
           SET status = 'failed', error_message = 'Container was terminated unexpectedly',
               completed_at = NOW()
           WHERE id = $1 AND status = 'running'`,
          [scan.id]
        )
        await pool.query(
          `UPDATE zap_tasks SET status = 'failed', error_message = 'Container terminated unexpectedly',
           completed_at = NOW()
           WHERE id = $1 AND status = 'running'`,
          [scan.id]
        ).catch(() => {})
        return NextResponse.json({ scanId: null })
      }

      // Docker session row exists — verify container is actually alive on Docker
      const containerId = sessions[0].container_id
      const sessionDbId = sessions[0].id
      const alive = await isContainerAlive(containerId)

      if (alive === false) {
        // Container is dead on Docker side — auto-fail the scan and clean up
        console.log(`[active] Scan ${scan.id} container ${containerId} is dead on Docker. Auto-failing...`)
        await pool.query(
          `UPDATE scan_history
           SET status = 'failed', error_message = 'Container crashed unexpectedly',
               completed_at = NOW()
           WHERE id = $1 AND status = 'running'`,
          [scan.id]
        )
        await pool.query(
          `UPDATE zap_tasks SET status = 'failed', error_message = 'Container crashed unexpectedly',
           completed_at = NOW()
           WHERE id = $1 AND status = 'running'`,
          [scan.id]
        ).catch(() => {})
        // Release the Docker slot properly via manager
        await releaseDockerSlot(profile.org_id, sessionDbId).catch(() => {})
        return NextResponse.json({ scanId: null })
      }
    }

    const projectName = scan.project_id
      ? (await supabase.from("projects").select("name").eq("id", scan.project_id).single()).data?.name || null
      : null

    return NextResponse.json({
      scanId: scan.id,
      status: scan.status,
      targetUrl: scan.scan_target,
      scanType: scan.scan_type,
      selectedProject: scan.project_id,
      projectName,
      progress: scan.progress,
      activeScans: rows,
    })
  } catch {
    return NextResponse.json({ scanId: null, activeScans: [] })
  }
}
