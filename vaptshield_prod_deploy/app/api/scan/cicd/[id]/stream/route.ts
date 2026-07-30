import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { Redis } from "@upstash/redis"
import { hasPermission } from "@/lib/utils/permissions"
import { Ratelimit } from "@upstash/ratelimit"

const CICD_PHASES = ["semgrep", "trivy", "gitleaks"]

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN!,
})

const streamRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: true,
  prefix: "ratelimit:cicd:stream:",
})

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

    const rlRes = await streamRatelimit.limit(profile.org_id)
    if (!rlRes.success) {
      return NextResponse.json({ error: "Organization stream rate limit exceeded. Too many concurrent watchers." }, { status: 429 })
    }

    const { id } = await params

    const { data: scan, error: scanError } = await supabase
      .from("scan_history")
      .select("status, findings_found, error_message, completed_at")
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .eq("scan_type", "cicd")
      .single()

    if (scanError || !scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const logKey = `cicd:logs:${id}`
        let lastLogIndex = 0
        let terminalStateSent = false

        const sendEvent = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch { /* stream closed */ }
        }

        const completedTools = new Set<string>()
        let pollCount = 0
        let lastReportedFindingsCount = 0
        const reportedFindingIds = new Set<string>()

        async function getToolBreakdown() {
          try {
            const { data: findings } = await supabase
              .from("scan_findings")
              .select("raw_data, title")
              .eq("scan_id", id)
              .eq("status", "pending")
            
            const breakdown: Record<string, number> = { semgrep: 0, trivy: 0, gitleaks: 0 }
            if (findings) {
              for (const f of findings) {
                let tool = "trivy"
                const raw = f.raw_data as any || {}
                if (raw.tool) {
                  tool = raw.tool
                } else if (f.title?.toLowerCase().includes("semgrep") || raw.check_id) {
                  tool = "semgrep"
                } else if (f.title?.toLowerCase().includes("gitleaks") || raw.SecretHash || raw.Match) {
                  tool = "gitleaks"
                }
                breakdown[tool] = (breakdown[tool] || 0) + 1
              }
            }
            return breakdown
          } catch { return { semgrep: 0, trivy: 0, gitleaks: 0 } }
        }

        async function pollRedisLogs() {
          try {
            const len = await redis.llen(logKey)
            if (len > lastLogIndex) {
              const newLines = await redis.lrange(logKey, lastLogIndex, len - 1)
              for (const line of newLines) {
                sendEvent("log", { line, index: lastLogIndex++ })
                
                const phaseMatch = line.match(/^__PHASE__:(\w+)/)
                if (phaseMatch && phaseMatch[1] !== "complete" && phaseMatch[1] !== "passed" && phaseMatch[1] !== "warning") {
                  completedTools.add(phaseMatch[1])
                  sendEvent("phase", { phase: phaseMatch[1] })
                }
              }
            }
          } catch (e) {
            console.error("[pollRedisLogs error]", e)
          }
        }

        async function fetchFindings() {
          const { data: findings } = await supabase
            .from("scan_findings")
            .select("id, title, severity, description") // Omit raw_data to prevent massive payload crashing SSE
            .eq("scan_id", id)
            .eq("status", "pending")
          
          return findings || []
        }

        let pollInterval: ReturnType<typeof setInterval> | null = null

        function clearIntervalOnly() {
          if (pollInterval) clearInterval(pollInterval)
        }

        async function sendTerminalState(scanStatus: string) {
          if (terminalStateSent) return false

          const { data: latestScan } = await supabase
            .from("scan_history")
            .select("status, findings_found, error_message, completed_at, raw_output")
            .eq("id", id)
            .single()
            
          const currentScan = latestScan || scan
          if (!currentScan) {
            terminalStateSent = true
            sendEvent("error", { message: "Scan not found during polling" })
            clearIntervalOnly()
            try { controller.close() } catch {}
            return false
          }

          if (currentScan.status === "completed" || currentScan.status === "cancelled") {
            terminalStateSent = true
            const findings = await fetchFindings()
            const toolBreakdown = await getToolBreakdown()
            const hasVulns = findings.length > 0
            
            // Send historical logs if available
            if ((currentScan as any).raw_output) {
              const lines = (currentScan as any).raw_output.split('\n')
              const recentLines = lines.slice(-200)
              for (let i = 0; i < recentLines.length; i++) {
                if (recentLines[i].trim()) sendEvent("log", { line: recentLines[i], index: i })
              }
            }
            
            // Send any remaining individual findings
            for (const f of findings) {
              if (!reportedFindingIds.has(f.id)) {
                reportedFindingIds.add(f.id)
                sendEvent("new_finding", f)
              }
            }
            
            sendEvent("complete", {
              status: currentScan.status,
              scan_result: hasVulns ? "failed" : "passed",
              findings_found: currentScan.findings_found || findings.length,
              tool_breakdown: toolBreakdown,
              completed_phases: CICD_PHASES.length,
              total_phases: CICD_PHASES.length,
              completed_at: currentScan.completed_at,
            })
            clearIntervalOnly() // Client will close the connection upon receiving complete
            return true
          } else if (currentScan.status === "failed") {
            terminalStateSent = true
            sendEvent("failed", { error: currentScan.error_message || "Scan failed unexpectedly" })
            clearIntervalOnly() // Client will close the connection upon receiving failed
            return true
          }
          return false
        }

        // Check if scan is already complete
        const isComplete = await sendTerminalState(scan.status)
        if (isComplete) return

        // Polling loop
        pollInterval = setInterval(async () => {
          await pollRedisLogs()
          
          pollCount++
          
          // Periodically check DB for scan completion and findings (every ~3 seconds = 2 * 1500ms)
          if (pollCount % 2 === 0) {
            const { data: currentScan } = await supabase
              .from("scan_history")
              .select("status, findings_found")
              .eq("id", id)
              .single()
            
            if (currentScan && (currentScan.status === "completed" || currentScan.status === "failed" || currentScan.status === "cancelled")) {
              await pollRedisLogs() // one last pull
              await sendTerminalState(currentScan.status)
              return
            }
            
            // Fetch intermediate findings
            const findings = await fetchFindings()
            if (findings.length > lastReportedFindingsCount) {
              lastReportedFindingsCount = findings.length
              
              for (const f of findings) {
                if (!reportedFindingIds.has(f.id)) {
                  reportedFindingIds.add(f.id)
                  sendEvent("new_finding", f)
                }
              }
              
              const breakdown = await getToolBreakdown()
              sendEvent("progress", {
                findings_found: findings.length,
                completed_phases: completedTools.size,
                total_phases: 4, // clone + 3 tools
                tool_breakdown: breakdown
              })
            } else {
               sendEvent("progress", {
                completed_phases: completedTools.size,
                total_phases: 4,
              })
            }
          }
        }, 1500)

        // Add a timeout to prevent infinite streams
        setTimeout(() => {
          sendEvent("error", { message: "Stream timeout" })
          clearIntervalOnly()
          try { controller.close() } catch {}
        }, 15 * 60 * 1000) // 15 mins
      },
      cancel() {
        // Stream cancelled by client
      }
    })

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: "Stream setup failed" }, { status: 500 })
  }
}
