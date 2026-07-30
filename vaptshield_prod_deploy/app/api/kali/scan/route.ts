import crypto from "crypto"
import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { logAudit } from "@/lib/utils/audit-server"
import { ensureWorkerRunning } from "@/lib/docker/worker-launcher"
import { signWorkerToken } from "@/lib/docker/manager"
import { getGroqRaw, DEFAULT_MODEL } from "@/lib/ai/groq"
import { dedupFindings, filterFalsePositives } from "@/lib/utils/dedup-findings"
import { sanitizeError } from "@/lib/utils/api-error"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

const WORKER_URL = process.env.DOCKER_HOST_API_URL || ""
const WORKER_KEY = process.env.DOCKER_HOST_API_KEY || ""

// ─── Generic fallback titles that should be replaced ──────────
const GENERIC_TITLES = new Set([
  "nuclei finding",
  "kali terminal finding",
  "ai-extracted finding",
  "untitled finding",
  "untitled",
  "finding",
])

function isGenericTitle(title: string): boolean {
  const lower = title?.toLowerCase().trim() || ""
  return GENERIC_TITLES.has(lower) || lower.length < 3
}

// ─── AI title generation ──────────────────────────────────────
async function generateAiTitle(finding: any): Promise<string | null> {
  const groq = getGroqRaw()
  const evidence = (finding.raw_evidence || "").slice(0, 300)
  const description = (finding.description || "").slice(0, 200)
  const tool = finding.tool || "unknown"
  const target = finding.target || ""
  const extra = finding.extra || {}

  // Build context from available info
  const context = [
    tool ? `Tool: ${tool}` : null,
    target ? `Target: ${target}` : null,
    extra.template_id ? `Template: ${extra.template_id}` : null,
    extra.protocol ? `Protocol: ${extra.protocol}` : null,
    description ? `Description: ${description}` : null,
    evidence ? `Evidence: ${evidence}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  if (!context || context.length < 20) return null

  try {
    const completion = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Generate a short, precise finding title (max 80 chars). Use the template-id if available (keep original format like 'ttp-missing-security-headers:strict-transport-security'). Respond with ONLY the title text, no quotes, no explanation.",
        },
        { role: "user", content: context },
      ],
      temperature: 0.1,
      max_tokens: 100,
    })

    const title = completion.choices?.[0]?.message?.content?.trim() || null
    if (title && title.length > 3 && title.length < 200) return title
    return null
  } catch {
    return null
  }
}

// ─── Heuristic title generation (AI fallback) ─────────────────
function generateHeuristicTitle(finding: any): string {
  const tool = finding.tool || "unknown"
  const target = finding.target || ""
  const extra = finding.extra || {}
  const evidence = (finding.raw_evidence || "").slice(0, 150)
  const description = finding.description || ""

  // 1. For Nuclei findings, use template_id if available (preserves original format)
  if (tool === "nuclei" && extra.template_id) {
    return extra.template_id
  }

  // 2. Use description first 80 chars if available
  if (description && description.length > 5) {
    return description.slice(0, 80).replace(/\n/g, " ")
  }

  // 3. Try to extract a pattern from raw_evidence
  if (evidence) {
    // Look for common patterns in evidence
    const patterns = [
      /(?:vulnerable to|detected|found)\s+(.+?)(?:\.|,|$)/i,
      /(?:CVE-\d{4}-\d+)/,
      /(?:error|warning|critical):\s*(.+)/i,
    ]
    for (const pattern of patterns) {
      const m = evidence.match(pattern)
      if (m) {
        const extracted = m[1] || m[0]
        if (extracted.length > 3) return extracted.slice(0, 80)
      }
    }
  }

  // 4. Fallback: tool + target
  const targetPart = target ? ` on ${target}` : ""
  return `${tool} finding${targetPart}`
}

// ─── Generate the best possible title for a finding ───────────
async function generateFindingTitle(finding: any): Promise<string> {
  const existing = (finding.finding_name || "").trim()

  // If it's already a good title, use it
  if (!isGenericTitle(existing)) return existing

  // Check heuristic first (fast) — if it's good enough, skip AI call
  const heuristic = generateHeuristicTitle(finding)
  if (!isGenericTitle(heuristic)) return heuristic

  // Try AI for better title (only if heuristic is still generic)
  const aiTitle = await generateAiTitle(finding)
  if (aiTitle) return aiTitle

  // Final fallback: use whatever heuristic produced
  return heuristic
}

// ─── Query ALL accumulated findings for a session (both vulns + pending_alerts) ──
async function getAccumulatedFindings(pool: any, orgId: string, sessionId: string) {
  // 1. Auto-created vulnerabilities
  const { rows: vulns } = await pool.query(
    `SELECT id, title, severity, description, endpoint_url, raw_scanner_data, created_at
     FROM vulnerabilities
     WHERE org_id = $1 AND raw_scanner_data->>'session_id' = $2
     ORDER BY created_at ASC`,
    [orgId, sessionId]
  )
  const allFindings = vulns.map((v: any) => ({
    id: v.id,
    title: v.title,
    severity: v.severity,
    description: v.description,
    url: v.endpoint_url,
    tool: v.raw_scanner_data?.tool || null,
    raw_evidence: v.raw_scanner_data?.raw_evidence || null,
    vuln_id: v.id,
    source: 'auto_created',
    is_auto_created: true,
  }))

  // 2. Pending alerts across ALL tasks for this session
  const { rows: alerts } = await pool.query(
    `SELECT pa.id, pa.alert_name, pa.severity, pa.url, pa.description,
            pa.raw_data, pa.evidence, pa.solution, pa.reference,
            pa.cweid, pa.attack, pa.param, pa.other, pa.riskcode
     FROM pending_alerts pa
     JOIN zap_tasks zt ON zt.id = pa.task_id
     WHERE pa.org_id = $1 AND zt.scan_config->>'session_id' = $2 AND pa.status = 'pending'
     ORDER BY pa.created_at ASC`,
    [orgId, sessionId]
  )
  const alertFindings = alerts.map((a: any) => ({
    id: a.id,
    title: a.alert_name,
    severity: a.severity,
    description: a.description,
    url: a.url,
    raw_data: a.raw_data,
    tool: a.raw_data?.tool || null,
    evidence: a.evidence,
    solution: a.solution,
    reference: a.reference,
    cweid: a.cweid,
    attack: a.attack,
    param: a.param,
    other: a.other,
    riskcode: a.riskcode,
    source: 'pending_alert',
    is_auto_created: false,
  }))

  // Merge both sources, dedup by id
  const seen = new Set(allFindings.map((f: any) => f.id))
  for (const af of alertFindings) {
    if (!seen.has(af.id)) {
      allFindings.push(af)
      seen.add(af.id)
    }
  }

  return allFindings
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

    const body = await req.json()
    const { session_id, project_id, auto_create_vulnerabilities = false } = body
    if (!session_id || !project_id) {
      return NextResponse.json({ error: "session_id and project_id are required" }, { status: 400 })
    }

    const ip = req.headers.get("x-forwarded-for") || "anonymous"
    const rateResult = await slidingWindowRateLimit(`kali-scan:${user.id}`, 5, 3600)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests. Max 5 Kali scans per hour." }, { status: 429 })
    }

    const pool = getPool()

    // Verify the Docker session belongs to this user's org
    const { rows: sessions } = await pool.query(
      `SELECT id, container_id, status FROM docker_sessions
       WHERE id = $1 AND org_id = $2 AND container_type = 'kali'`,
      [session_id, profile.org_id]
    )
    if (sessions.length === 0) {
      return NextResponse.json({ error: "Docker session not found" }, { status: 404 })
    }

    // Check if session has already been parsed
    const { rows: existing } = await pool.query(
      `SELECT id FROM zap_tasks WHERE org_id = $1 AND scan_config->>'session_id' = $2 LIMIT 1`,
      [profile.org_id, session_id]
    )
    if (existing.length > 0) {
      return NextResponse.json({ error: "This session has already been parsed." }, { status: 409 })
    }

    const session = sessions[0]

    // Use the SAME UUID for both zap_tasks and scan_history so that
    // the scan-history page can find pending_alerts by scan_history.id
    const scanId = crypto.randomUUID()
    const taskId = scanId

    await pool.query(
      `INSERT INTO zap_tasks (id, org_id, project_id, target_url, status, scan_config, started_by, started_at)
       VALUES ($1, $2, $3, $4, 'running', $5::jsonb, $6, NOW())`,
      [
        taskId, profile.org_id, project_id, "terminal-session",
        JSON.stringify({ source: "kali", session_id }),
        user.id,
      ]
    )

    // Create a scan_history row
    await pool.query(
      `INSERT INTO scan_history (id, org_id, project_id, scan_type, scan_target, docker_session_id, status, started_by, started_at)
       VALUES ($1, $2, $3, 'kali', $4, $5, 'running', $6, NOW())`,
      [scanId, profile.org_id, project_id, session_id, session.id, user.id]
    )

    // Ensure the worker is running before trying to parse
    await ensureWorkerRunning()

    // Call the worker to parse session output
    let findings: any[] = []
    try {
      const jwtToken = await signWorkerToken(user.id, profile.org_id, profile.role, session_id)
      const workerRes = await fetch(`${WORKER_URL}/parse-session-output/${session_id}`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
        signal: AbortSignal.timeout(30000),
      })
      if (!workerRes.ok) {
        console.error("[kali/scan] Worker request failed", { status: workerRes.status })
        throw new Error("Worker request failed")
      }
      const workerData = await workerRes.json()
      findings = workerData.findings || []
      console.log(`[kali/scan] Worker returned ${findings.length} raw findings, tools=${workerData.tools_detected?.length || 0}`)


      // ─── Filter false positives ─────────────────────────────────
      if (findings.length > 0) {
        const beforeFp = findings.length
        findings = filterFalsePositives(findings)
        console.log(`[kali/scan] After FP filter: ${beforeFp} → ${findings.length}`)
      }

      // ─── Dedup identical findings ────────────────────────────────
      // NOTE: Dedup is intentionally DISABLED in the scan parse pipeline.
      // When Nuclei (or other tools) run against multiple targets with the
      // same template, each target produces a SEPARATE finding instance.
      // Dedup would merge all of them into 1 entry (same normalized title +
      // same severity), which means 44 real findings appear as 1 in the UI.
      //
      // The user needs EVERY instance visible so they can review, approve,
      // and manage findings at the granularity of each target+template pair.
      //
      // Dedup is still available at the REPORT generation stage — the
      // dedupFindings() function is imported below in case the report engine
      // needs it. This is the correct architectural boundary:
      //   SCAN layer → preserve all individual findings (instance granularity)
      //   REPORT layer → merge instances for summary pages (optional)
      //
      // if (findings.length > 1) {
      //   const before = findings.length
      //   findings = dedupFindings(findings)
      //   console.log(`[kali/scan] After dedup: ${before} → ${findings.length}`)
      // }

      console.log(`[kali/scan] Final findings to process: ${findings.length}`)
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
        action: "kali.parse_failed",
        resource_type: "scan_history",
        resource_id: scanId,
        new_value: { session_id, project_id, error: msg },
      })
      return NextResponse.json({ error: msg, findings: [] }, { status: 502 })
    }

    // ─── Generate meaningful titles for ALL findings ──────────────
    const findingTitles: string[] = await Promise.all(
      findings.map((f: any) => generateFindingTitle(f))
    )

    if (auto_create_vulnerabilities) {
      // Auto-create vulnerabilities directly — skip pending_alerts
      const vulnIds: string[] = []
      for (let i = 0; i < findings.length; i++) {
        const f = findings[i]
        const vulnId = crypto.randomUUID()
        const severity = mapSeverity(f.severity)
        const svParams = (f.params as string[] | undefined) || []
        const svAttacks = (f.attacks as string[] | undefined) || []
        const rawData: Record<string, unknown> = {
          ...(f.extra || {}),
          tool: f.tool,
          target: f.target,
          raw_evidence: f.raw_evidence,
          session_id,
          instance_count: f.instance_count || 1,
          targets: f.targets || [],
          ...(svParams.length > 0 && { params: svParams }),
          ...(svAttacks.length > 0 && { attacks: svAttacks }),
        }
        let cvssScore = 0
        if (severity === "critical") cvssScore = 9.5
        else if (severity === "high") cvssScore = 7.5
        else if (severity === "medium") cvssScore = 5.0
        else if (severity === "low") cvssScore = 2.5

        const description = f.description || null
        const remediation = (f.extra?.remediation as string) || null
        const referenceLinks = (f.extra?.reference as string) || null

        // Merge endpoint URLs for deduped findings
        const endpointUrl = f.targets?.length > 1
          ? f.targets.join(", ")
          : (f.target || null)
        const affectedComponent = svParams.length > 0
          ? svParams.join(", ")
          : null

        await pool.query(
          `INSERT INTO vulnerabilities
             (id, org_id, project_id, title, description, severity, cvss_score,
              endpoint_url, affected_component, proof_of_concept, remediation, reference_links,
              raw_scanner_data, found_by, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'open', NOW())`,
          [
            vulnId, profile.org_id, project_id,
            findingTitles[i],
            description, severity, cvssScore,
            endpointUrl, affectedComponent, f.raw_evidence || null,
            remediation, referenceLinks,
            JSON.stringify(rawData), user.id,
          ]
        )
        vulnIds.push(vulnId)
      }

      // Mark task and scan_history as completed
      await pool.query(
        `UPDATE zap_tasks SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [taskId]
      )
      await pool.query(
        `UPDATE scan_history SET status = 'completed', findings_found = $1, findings_approved = $1, completed_at = NOW() WHERE id = $2`,
        [findings.length, scanId]
      )

      await logAudit({
        action: "kali.vulns_auto_created",
        resource_type: "scan_history",
        resource_id: scanId,
        new_value: { session_id, project_id, findings_count: findings.length, vuln_count: vulnIds.length },
      })

      // Re-query ALL accumulated vulns for this session (in case multiple parses happened)
      const accumulatedFindings = await getAccumulatedFindings(pool, profile.org_id, session_id)
      console.log(`[kali/scan] auto-create path: getAccumulatedFindings returned ${accumulatedFindings.length} items`)

      return NextResponse.json({
        taskId,
        scanId,
        findingsCount: accumulatedFindings.length,
        vulnIds,
        autoCreated: true,
        findings: accumulatedFindings,
      })
    }

    // Legacy: Map findings to pending_alerts
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
      }

      // If this is a merged finding with multiple targets, join them into the url field
      const targetUrl = f.targets?.length > 1
        ? f.targets.join(", ")
        : (f.target || null)
      // param/attack column: use actual collected params (not targets) or fallback to targets
      const paramValue = rawParams.length > 0
        ? rawParams.join(", ")
        : null
      const attackValue = rawAttacks.length > 0
        ? rawAttacks.join(", ")
        : null

      await pool.query(
        `INSERT INTO pending_alerts
           (id, task_id, org_id, project_id, alert_name, severity, url, description, raw_data, evidence, solution, reference, cweid, param, attack)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15)`,
        [
          alertId,
          taskId,
          profile.org_id,
          project_id,
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

    // Mark task and scan_history as completed
    await pool.query(
      `UPDATE zap_tasks SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [taskId]
    )
    await pool.query(
      `UPDATE scan_history SET status = 'completed', findings_found = $1, completed_at = NOW() WHERE id = $2`,
      [findings.length, scanId]
    )

    await logAudit({
      action: "kali.parse_complete",
      resource_type: "scan_history",
      resource_id: scanId,
      new_value: { session_id, project_id, findings_count: findings.length, task_id: taskId },
    })

    // Re-query ALL accumulated findings for this session
    const accumulatedFindings = await getAccumulatedFindings(pool, profile.org_id, session_id)
    console.log(`[kali/scan] getAccumulatedFindings returned ${accumulatedFindings.length} items`)

    return NextResponse.json({
      taskId,
      scanId,
      findingsCount: accumulatedFindings.length,
      findings: accumulatedFindings,
    })
  } catch (e) {
    console.error("[kali/scan] Error:", e)
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}

function mapSeverity(severity: string | undefined): string {
  const sev = (severity || "medium").toLowerCase()
  if (["critical", "high", "medium", "low", "informational"].includes(sev)) return sev
  if (sev === "info") return "informational"
  return "medium"
}
