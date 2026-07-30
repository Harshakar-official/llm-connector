import crypto from "crypto"
import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { logAudit } from "@/lib/utils/audit-server"
import { ensureWorkerRunning } from "@/lib/docker/worker-launcher"
import { dedupFindings, filterFalsePositives } from "@/lib/utils/dedup-findings"
import { sanitizeError } from "@/lib/utils/api-error"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

import { signWorkerToken } from "@/lib/docker/manager"

const WORKER_URL = process.env.DOCKER_HOST_API_URL || ""

const GENERIC_TITLES = new Set([
  "nuclei finding", "kali terminal finding", "ai-extracted finding",
  "untitled finding", "untitled", "finding",
])

function isGenericTitle(title: string): boolean {
  const lower = title?.toLowerCase().trim() || ""
  return GENERIC_TITLES.has(lower) || lower.length < 3
}

// Reuse heuristic title gen from existing scan route logic
function generateHeuristicTitle(finding: any): string {
  const tool = finding.tool || "unknown"
  const target = finding.target || ""
  const extra = finding.extra || {}
  const evidence = (finding.raw_evidence || "").slice(0, 150)
  const description = finding.description || ""

  if (tool === "nuclei" && extra.template_id) return extra.template_id
  if (description && description.length > 5) return description.slice(0, 80).replace(/\n/g, " ")
  if (evidence) {
    const m = evidence.match(/(?:vulnerable to|detected|found)\s+(.+?)(?:\.|,|$)/i)
      || evidence.match(/(?:CVE-\d{4}-\d+)/)
      || evidence.match(/(?:error|warning|critical):\s*(.+)/i)
    if (m) {
      const extracted = m[1] || m[0]
      if (extracted.length > 3) return extracted.slice(0, 80)
    }
  }
  return `${tool} finding${target ? ` on ${target}` : ""}`
}

function mapSeverity(severity: string | undefined): string {
  const sev = (severity || "medium").toLowerCase()
  if (["critical", "high", "medium", "low", "informational"].includes(sev)) return sev
  if (sev === "info") return "informational"
  return "medium"
}

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const ip = req.headers.get("x-forwarded-for") || "anonymous"
    const rateResult = await slidingWindowRateLimit(`parse-text:${user.id}`, 10, 3600)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const body = await req.json()
    const { project_id, raw_output } = body
    if (!project_id || !raw_output || typeof raw_output !== "string" || !raw_output.trim()) {
      return NextResponse.json({ error: "project_id and raw_output are required" }, { status: 400 })
    }

    const pool = getPool()
    const scanId = crypto.randomUUID()
    const taskId = scanId

    // Create zap_tasks row
    await pool.query(
      `INSERT INTO zap_tasks (id, org_id, project_id, target_url, status, scan_config, started_by, started_at)
       VALUES ($1, $2, $3, 'pasted-text', 'running', $4::jsonb, $5, NOW())`,
      [taskId, profile.org_id, project_id, JSON.stringify({ source: "kali-paste", preview: raw_output.slice(0, 100) }), user.id]
    )

    // Create scan_history row
    await pool.query(
      `INSERT INTO scan_history (id, org_id, project_id, scan_type, scan_target, status, started_by, started_at)
       VALUES ($1, $2, $3, 'kali', 'pasted-text', 'running', $4, NOW())`,
      [scanId, profile.org_id, project_id, user.id]
    )

    await ensureWorkerRunning()

    // Call worker's parse-text endpoint
    let findings: any[] = []
    try {
      const jwtToken = await signWorkerToken(user.id, profile.org_id, profile.role, scanId)
      const workerRes = await fetch(`${WORKER_URL}/parse-text`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw_output: raw_output.trim() }),
        signal: AbortSignal.timeout(60000),
      })
      if (!workerRes.ok) {
        const errText = await workerRes.text()
        throw new Error(`Worker returned ${workerRes.status}: ${errText}`)
      }
      const workerData = await workerRes.json()
      findings = workerData.findings || []

      // Filter false positives
      if (findings.length > 0) {
        const beforeFp = findings.length
        findings = filterFalsePositives(findings)
        console.log(`[kali/parse-text] FP filter: ${beforeFp} -> ${findings.length}`)
      }

      // Dedup identical findings
      if (findings.length > 1) {
        const before = findings.length
        findings = dedupFindings(findings)
        console.log(`[kali/parse-text] Dedup: ${before} -> ${findings.length}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Worker call failed"
      await pool.query(
        `UPDATE zap_tasks SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
        [msg, taskId]
      )
      await pool.query(
        `UPDATE scan_history SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
        [msg, scanId]
      )
      await logAudit({
        action: "scanner.parse_error",
        resource_type: "scan_history",
        resource_id: scanId,
        new_value: { project_id, error: msg, source: "paste" },
      })
      return NextResponse.json({ error: msg, findings: [] }, { status: 502 })
    }

    // Generate titles
    const findingTitles: string[] = findings.map((f: any) => {
      const existing = (f.finding_name || "").trim()
      return !isGenericTitle(existing) ? existing : generateHeuristicTitle(f)
    })

    // Create pending_alerts
    const alertIds: string[] = []
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i]
      const alertId = crypto.randomUUID()
      const severity = mapSeverity(f.severity)
      const rawParams = (f.params as string[] | undefined) || []
      const rawAttacks = (f.attacks as string[] | undefined) || []
      const rawData: Record<string, unknown> = {
        ...(f.extra || {}),
        tool: f.tool,
        target: f.target,
        raw_evidence: f.raw_evidence,
        instance_count: f.instance_count || 1,
        targets: f.targets || [],
        ...(rawParams.length > 0 && { params: rawParams }),
        ...(rawAttacks.length > 0 && { attacks: rawAttacks }),
        source: "kali-paste",
      }

      const targetUrl = f.targets?.length > 1
        ? f.targets.join(", ")
        : (f.target || null)
      const paramValue = rawParams.length > 0 ? rawParams.join(", ") : null
      const attackValue = rawAttacks.length > 0 ? rawAttacks.join(", ") : null

      await pool.query(
        `INSERT INTO pending_alerts
           (id, task_id, org_id, project_id, alert_name, severity, url, description, raw_data, evidence, solution, reference, cweid, param, attack)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15)`,
        [
          alertId, taskId, profile.org_id, project_id,
          findingTitles[i],
          severity,
          targetUrl,
          f.description || null,
          JSON.stringify(rawData),
          f.raw_evidence || null,
          (f.extra?.remediation as string) || null,
          (f.extra?.reference as string) || null,
          f.extra?.cwe ? Number(f.extra.cwe) : null,
          paramValue,
          attackValue,
        ]
      )
      alertIds.push(alertId)
    }

    // Mark task + scan_history completed
    await pool.query(
      `UPDATE zap_tasks SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [taskId]
    )
    await pool.query(
      `UPDATE scan_history SET status = 'completed', findings_found = $1, completed_at = NOW() WHERE id = $2`,
      [findings.length, scanId]
    )

    await logAudit({
      action: "scanner.parse",
      resource_type: "scan_history",
      resource_id: scanId,
      new_value: { project_id, findings_count: findings.length, task_id: taskId, source: "paste" },
    })

    return NextResponse.json({
      taskId,
      scanId,
      findingsCount: findings.length,
      findings: findings.map((f: any, idx: number) => ({
        id: alertIds[idx] || crypto.randomUUID(),
        title: findingTitles[idx],
        severity: mapSeverity(f.severity),
        description: f.description || null,
        url: f.target || null,
        tool: f.tool,
        raw_evidence: f.raw_evidence || null,
      })),
    })
  } catch (e) {
    console.error("[kali/parse-text] Error:", e)
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
