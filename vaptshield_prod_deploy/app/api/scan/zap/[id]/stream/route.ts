import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { killZapContainerByScanId } from "@/lib/scan-helpers"
import { hasPermission } from "@/lib/utils/permissions"
import { signWorkerToken } from "@/lib/docker/manager"

const WORKER_URL = process.env.DOCKER_HOST_API_URL || ""
const ZAP_WORKER_URL = process.env.ZAP_WORKER_URL || WORKER_URL
const WORKER_KEY = process.env.DOCKER_HOST_API_KEY || ""
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error("JWT_SECRET is required")

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    if (!hasPermission(profile.role, "scanners:view_history")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const pool = getPool()
    const orgId = profile.org_id
    const userId = user.id
    const userRole = profile.role

    const { rows: scans } = await pool.query(
      `SELECT status FROM scan_history WHERE id = $1 AND org_id = $2`,
      [id, orgId]
    )
    if (scans.length === 0) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch { /* stream closed */ }
        }

        const sentAlertIds = new Set<string>()
        let sentAuthVerified: boolean | null = null
        let sentAuthTokens: Record<string, unknown> | null = null
        let workerUnreachableCount = 0
        let finalEventSent = false

        async function fetchAuthData() {
          try {
            const { rows: tasks } = await pool.query(
              `SELECT progress_detail FROM zap_tasks WHERE id = $1`,
              [id]
            )
            if (tasks.length > 0 && tasks[0].progress_detail) {
              const detail = typeof tasks[0].progress_detail === "string"
                ? JSON.parse(tasks[0].progress_detail)
                : tasks[0].progress_detail
              return {
                auth_verified: detail.auth_verified ?? null,
                auth_tokens: detail.auth_tokens ?? null,
              }
            }
          } catch { /* ignore */ }
          return { auth_verified: null, auth_tokens: null }
        }

        async function fetchPendingAlerts() {
          const { rows: findings } = await pool.query(
            `SELECT id, alert_name as title, severity, description, url, raw_data,
                    confidence, cweid, attack, param, riskcode,
                    evidence, solution, reference, other, wascid
             FROM pending_alerts WHERE task_id = $1 AND status = 'pending'
             ORDER BY
               CASE severity
                 WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                 WHEN 'medium' THEN 2 WHEN 'low' THEN 3
                 ELSE 4
               END`,
            [id]
          )
          return findings
        }

        async function sendInitialStatus() {
          try {
            const { rows: scanRows } = await pool.query(
              `SELECT status, findings_found, error_message, completed_at
               FROM scan_history WHERE id = $1 AND org_id = $2`,
              [id, orgId]
            )
            if (scanRows.length === 0) {
              sendEvent("error", { message: "Scan not found" })
              cleanup()
              return
            }
            const scan = scanRows[0]
            const authData = await fetchAuthData()

            if (scan.status === "completed" || scan.status === "cancelled") {
              const findings = await fetchPendingAlerts()
              sendEvent("complete", {
                status: scan.status,
                findings_found: scan.findings_found || findings.length,
                findings,
                completed_at: scan.completed_at,
                ...authData,
              })
              finalEventSent = true
              return
            }
            if (scan.status === "failed") {
              const findings = await fetchPendingAlerts()
              sendEvent("failed", {
                status: "failed",
                error: scan.error_message || "Scan failed",
                findings_found: findings.length,
                findings,
                ...authData,
              })
              finalEventSent = true
              cleanup()
              return
            }
            if (scan.status === "running" || scan.status === "queued") {
              sendEvent("progress", {
                status: scan.status,
                findings_found: scan.findings_found || 0,
                findings_count: 0,
                ...authData,
              })
            }
          } catch { }
        }

        await sendInitialStatus()

        async function fetchWorkerStatus() {
          try {
            const token = JWT_SECRET ? await signWorkerToken(userId, orgId, userRole, id) : WORKER_KEY
            const res = await fetch(`${ZAP_WORKER_URL}/zap-status/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(5000),
            })
            if (!res.ok) return null
            return await res.json()
          } catch {
            return null
          }
        }

        async function autoFailStaleScan(pool: any, scanId: string) {
          console.log(`[stream] Auto-failing stale scan ${scanId} -- container unreachable`)
          await pool.query(
            `UPDATE scan_history
             SET status = 'failed', error_message = 'Container became unreachable during scan',
                 completed_at = NOW()
             WHERE id = $1 AND status = 'running'`,
            [scanId]
          )
          await pool.query(
            `UPDATE zap_tasks SET status = 'failed', error_message = 'Container unreachable',
             completed_at = NOW()
             WHERE id = $1 AND status = 'running'`,
            [scanId]
          ).catch(() => {})
          // Kill container via zap_tasks.container_id (real Docker hash)
          await killZapContainerByScanId(pool, scanId).catch((err: Error) =>
            console.error(`[stream] Failed to kill container for scan ${scanId}:`, err.message)
          )
        }

        const pollInterval = setInterval(async () => {
          try {
            const { rows: scanRows } = await pool.query(
              `SELECT status, findings_found, error_message, completed_at
               FROM scan_history WHERE id = $1 AND org_id = $2`,
              [id, orgId]
            )
            if (scanRows.length === 0) {
              sendEvent("error", { message: "Scan not found" })
              cleanup()
              return
            }

            const scan = scanRows[0]

            if (scan.status === "queued") {
              const { rows: queueRows } = await pool.query(
                `SELECT COUNT(*)::int AS ahead FROM zap_tasks
                 WHERE org_id = $1 AND status = 'queued' AND created_at < (SELECT created_at FROM zap_tasks WHERE id = $2)`,
                [orgId, id]
              )
              const ahead = queueRows[0]?.ahead ?? 0
              sendEvent("progress", { status: "queued", position: ahead + 1 })
            } else if (scan.status === "running") {
              const { rows: newAlerts } = await pool.query(
                `SELECT id, alert_name, severity, description, url, raw_data,
                        confidence, cweid, attack, param, riskcode,
                        evidence, solution, reference, other, wascid
                 FROM pending_alerts
                 WHERE task_id = $1 AND status = 'pending'
                   AND id != ALL($2::uuid[])
                 ORDER BY created_at ASC`,
                [id, [...sentAlertIds]]
              )
              for (const alert of newAlerts) {
                sentAlertIds.add(alert.id)
                sendEvent("new_finding", {
                  id: alert.id, title: alert.alert_name, severity: alert.severity,
                  description: alert.description, url: alert.url, raw_data: alert.raw_data,
                  confidence: alert.confidence, cweid: alert.cweid, riskcode: alert.riskcode,
                  attack: alert.attack, param: alert.param, evidence: alert.evidence,
                  solution: alert.solution, reference: alert.reference,
                  other: alert.other, wascid: alert.wascid,
                })
              }

              const workerStatus = await fetchWorkerStatus()
              const progressData: Record<string, unknown> = {
                status: "running",
                findings_found: scan.findings_found || 0,
                findings_count: sentAlertIds.size,
              }

              let workerAuthVerified: boolean | null = null
              let workerAuthTokens: Record<string, unknown> | null = null

              if (workerStatus) {
                workerUnreachableCount = 0
                if (workerStatus.containerRunning) progressData.containerRunning = true
                progressData.percentage = workerStatus.progress ?? workerStatus.percentage ?? null
                progressData.phase = workerStatus.phase ?? null
                progressData.uptimeSeconds = workerStatus.uptimeSeconds ?? null
                progressData.lastLogLine = workerStatus.lastLogLine ?? null
                if (workerStatus.alertsFound != null) progressData.alertsFound = workerStatus.alertsFound
                if (workerStatus.auth_verified != null && workerStatus.auth_verified !== sentAuthVerified) {
                  sentAuthVerified = workerStatus.auth_verified
                  workerAuthVerified = sentAuthVerified
                  progressData.auth_verified = sentAuthVerified
                }
                if (workerStatus.auth_tokens != null && JSON.stringify(workerStatus.auth_tokens) !== JSON.stringify(sentAuthTokens)) {
                  sentAuthTokens = workerStatus.auth_tokens
                  workerAuthTokens = sentAuthTokens
                  progressData.auth_tokens = sentAuthTokens
                }
                if (workerStatus.auth_warning != null) progressData.auth_warning = workerStatus.auth_warning
              } else {
                workerUnreachableCount++
                progressData.containerRunning = false
                if (workerUnreachableCount >= 3) {
                  await autoFailStaleScan(pool, id)
                  sendEvent("failed", {
                    status: "failed",
                    error: "Container became unreachable (worker unresponsive)",
                    findings_found: sentAlertIds.size,
                    findings: [],
                  })
                  finalEventSent = true
                  cleanup()
                  return
                }
              }

              if (workerAuthVerified === null || workerAuthTokens === null) {
                const dbAuth = await fetchAuthData()
                if (dbAuth.auth_verified != null && dbAuth.auth_verified !== sentAuthVerified) {
                  sentAuthVerified = dbAuth.auth_verified
                  progressData.auth_verified = sentAuthVerified
                }
                if (dbAuth.auth_tokens != null && JSON.stringify(dbAuth.auth_tokens) !== JSON.stringify(sentAuthTokens)) {
                  sentAuthTokens = dbAuth.auth_tokens
                  progressData.auth_tokens = sentAuthTokens
                }
              }

              sendEvent("progress", progressData)
            } else if (scan.status === "completed") {
              const findings = await fetchPendingAlerts()
              const completeAuthData = await fetchAuthData()
              sendEvent("complete", {
                status: "completed",
                findings_found: scan.findings_found || findings.length,
                findings,
                completed_at: scan.completed_at,
                ...completeAuthData,
              })
              finalEventSent = true
              cleanup()
            } else if (scan.status === "failed") {
              const failedAuthData = await fetchAuthData()
              sendEvent("failed", {
                status: "failed",
                error: scan.error_message || "Scan failed",
                findings_found: sentAlertIds.size,
                findings: [],
                ...failedAuthData,
              })
              finalEventSent = true
              cleanup()
            } else if (scan.status === "cancelled") {
              const findings = await fetchPendingAlerts()
              const cancelledAuthData = await fetchAuthData()
              sendEvent("complete", {
                status: "cancelled",
                findings_found: scan.findings_found || findings.length,
                findings,
                completed_at: scan.completed_at,
                ...cancelledAuthData,
              })
              finalEventSent = true
              cleanup()
            }
          } catch {
            if (!finalEventSent) {
              sendEvent("error", { message: "Stream error" })
            }
            cleanup()
          }
        }, 5000)

        function cleanup() {
          clearInterval(pollInterval)
          try { controller.close() } catch { }
        }

        req.signal.addEventListener("abort", cleanup)
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
