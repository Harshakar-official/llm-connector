import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    const rateResult = await slidingWindowRateLimit(`kali-stream:${user.id}`, 20, 60)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many active streams" }, { status: 429 })
    }

    const { id } = await params
    const pool = getPool()

    // Verify the task exists and belongs to this org
    const { rows: tasks } = await pool.query(
      `SELECT status, error_message FROM zap_tasks WHERE id = $1 AND org_id = $2`,
      [id, profile.org_id]
    )
    if (tasks.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
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
        let finalEventSent = false
        let pollInterval: ReturnType<typeof setInterval> | undefined

        // Define cleanup early so it can be called before pollInterval is assigned
        const cleanup = () => {
          if (pollInterval) clearInterval(pollInterval)
          try { controller.close() } catch { }
        }

        async function fetchPendingAlerts() {
          const { rows: alerts } = await pool.query(
            `SELECT id, alert_name, severity, description, url, raw_data,
                    evidence, solution, reference, cweid, attack, param, other, riskcode
             FROM pending_alerts WHERE task_id = $1 AND status = 'pending'
             ORDER BY
               CASE severity
                 WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                 WHEN 'medium' THEN 2 WHEN 'low' THEN 3
                 ELSE 4
               END`,
            [id]
          )
          return alerts
        }

        // Send initial status
        const task = tasks[0]
        if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
          const findings = await fetchPendingAlerts()
          if (task.status === "failed") {
            sendEvent("failed", {
              status: "failed",
              error: task.error_message || "Parse failed",
              findings_found: findings.length,
              findings,
            })
          } else {
            sendEvent("complete", {
              status: task.status,
              findings_found: findings.length,
              findings,
            })
          }
          finalEventSent = true
          cleanup() // safe: pollInterval is undefined, clearInterval is a no-op
          return
        }

        sendEvent("progress", { status: task.status, findings_found: 0 })

        pollInterval = setInterval(async () => {
          try {
            const { rows: taskRows } = await pool.query(
              `SELECT status, error_message FROM zap_tasks WHERE id = $1 AND org_id = $2`,
              [id, profile.org_id]
            )
            if (taskRows.length === 0) {
              sendEvent("error", { message: "Task not found" })
              cleanup()
              return
            }

            const currentTask = taskRows[0]

            if (currentTask.status === "running" || currentTask.status === "queued") {
              const { rows: newAlerts } = await pool.query(
                `SELECT id, alert_name, severity, description, url, raw_data,
                        evidence, solution, reference, cweid, attack, param, other, riskcode
                 FROM pending_alerts
                 WHERE task_id = $1 AND status = 'pending'
                   AND id != ALL($2::uuid[])
                 ORDER BY created_at ASC`,
                [id, [...sentAlertIds]]
              )
              for (const alert of newAlerts) {
                sentAlertIds.add(alert.id)
                sendEvent("new_finding", {
                  id: alert.id,
                  title: alert.alert_name,
                  severity: alert.severity,
                  description: alert.description,
                  url: alert.url,
                  raw_data: alert.raw_data,
                  evidence: alert.evidence,
                  solution: alert.solution,
                  reference: alert.reference,
                  cweid: alert.cweid,
                  attack: alert.attack,
                  param: alert.param,
                  other: alert.other,
                  riskcode: alert.riskcode,
                })
              }
              sendEvent("progress", {
                status: "running",
                findings_found: sentAlertIds.size,
              })
            } else if (currentTask.status === "completed") {
              const findings = await fetchPendingAlerts()
              sendEvent("complete", {
                status: "completed",
                findings_found: findings.length,
                findings,
              })
              finalEventSent = true
              cleanup()
            } else if (currentTask.status === "failed") {
              sendEvent("failed", {
                status: "failed",
                error: currentTask.error_message || "Parse failed",
                findings_found: sentAlertIds.size,
                findings: [],
              })
              finalEventSent = true
              cleanup()
            } else if (currentTask.status === "cancelled") {
              const findings = await fetchPendingAlerts()
              sendEvent("complete", {
                status: "cancelled",
                findings_found: findings.length,
                findings,
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
        }, 3000)

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
