import { NextResponse } from "next/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { killZapContainerByScanId } from "@/lib/scan-helpers"
import crypto from "crypto"
import { sanitizeError } from "@/lib/utils/api-error"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = req.headers.get("authorization") || ""
    const workerKey = process.env.DOCKER_HOST_API_KEY
    // Fail-closed: if the worker key is not configured, reject ALL webhook
    // calls instead of silently allowing unauthenticated access.
    if (!workerKey) {
      console.error("[zap-webhook] DOCKER_HOST_API_KEY is not configured — rejecting webhook call (fail-closed)")
      return NextResponse.json({ error: "Webhook authentication not configured" }, { status: 503 })
    }
    const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
    const tokenOk =
      providedToken.length > 0 &&
      providedToken.length === workerKey.length &&
      crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(workerKey))
    if (!tokenOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { alerts, status, error_message, org_id: bodyOrgId } = body

    const pool = getPool()

    // Verify scan exists
    const { rows: scans } = await pool.query(
      `SELECT id, org_id, project_id, status FROM scan_history WHERE id = $1`,
      [id]
    )
    if (scans.length === 0) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 })
    }

    const scan = scans[0]

    // Defense-in-depth: if the caller supplied an org_id, it must match the
    // scan's owning org. Prevents a compromised key from acting on a
    // different org's scan by knowing a scan id.
    if (bodyOrgId && bodyOrgId !== scan.org_id) {
      return NextResponse.json({ error: "org_id does not match scan" }, { status: 403 })
    }

    // Insert alerts into pending_alerts (batch insert — single transaction per chunk)
    if (alerts && Array.isArray(alerts) && alerts.length > 0) {
      if (alerts.length > 10000) {
        return NextResponse.json({ error: "Too many alerts (max 10000)" }, { status: 400 })
      }
      
      const chunkSize = 1000
      for (let i = 0; i < alerts.length; i += chunkSize) {
        const chunk = alerts.slice(i, i + chunkSize)
        const rows: unknown[][] = chunk.map((alert: any) => [
          generateAlertId(id, alert),
          id,
          scan.org_id,
          scan.project_id,
          alert.name || alert.alert || alert.alert_name || "Unknown Alert",
          mapSeverity(alert.risk || alert.severity || "informational"),
          alert.url || null,
          alert.payload || null,
          alert.description || alert.desc || null,
          JSON.stringify(alert),
        ])

        const placeholders = rows
          .map((_, j) => `($${j * 10 + 1}, $${j * 10 + 2}, $${j * 10 + 3}, $${j * 10 + 4}, $${j * 10 + 5}, $${j * 10 + 6}, $${j * 10 + 7}, $${j * 10 + 8}, $${j * 10 + 9}, $${j * 10 + 10}::jsonb, 'pending')`)
          .join(", ")
        const params = rows.flat()

        await pool.query(
          `INSERT INTO pending_alerts (id, task_id, org_id, project_id, alert_name, severity, url, payload, description, raw_data, status)
           VALUES ${placeholders}
           ON CONFLICT (id) DO NOTHING`,
          params
        )
      }
    }

    // Update scan_history
    const newStatus = status === "failed" ? "failed" : "completed"
    const { rows: alertCount } = await pool.query(
      `SELECT COUNT(*) as count FROM pending_alerts WHERE task_id = $1`,
      [id]
    )

    await pool.query(
      `UPDATE scan_history
       SET status = $1, findings_found = $3, error_message = $4,
           completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
       WHERE id = $2`,
      [newStatus, id, Number(alertCount[0]?.count || 0), error_message || null]
    )

    // Kill the container — look up the real container_id from zap_tasks
    // (docker_sessions.container_id is overwritten with the real Docker hash
    // on spawn, so the old `zap-${id}` pattern never matches).
    await killZapContainerByScanId(pool, id).catch(() => {})

    return NextResponse.json({ ok: true, alerts_inserted: alerts?.length || 0, status: newStatus })
  } catch (e) {
    console.error("[webhook] Error:", e)
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}

function mapSeverity(risk: string): string {
  const r = (risk || "").toLowerCase()
  // Explicit critical (not a ZAP riskcode — ZAP's highest is High/riskcode 3)
  if (r === "critical" || r === "highly critical") return "critical"
  // ZAP riskcode mapping: 0=info, 1=low, 2=medium, 3=high
  if (r === "high" || r === "3") return "high"
  if (r === "medium" || r === "2") return "medium"
  if (r === "low" || r === "1") return "low"
  if (r === "0" || r === "info" || r === "informational") return "informational"
  return "informational"
}

function generateAlertId(taskId: string, alert: any): string {
  if (alert.id) return alert.id
  const name = alert.name || alert.alert || alert.alert_name || ""
  const url = alert.url || ""
  const method = alert.method || ""
  const param = alert.param || ""
  const str = `${taskId}:${name}:${url}:${method}:${param}`
  const hash = crypto.createHash("md5").update(str).digest("hex")
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}
