import crypto from "crypto"
import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { logAudit } from "@/lib/utils/audit-server"
import { dedupFindings, type FindingInput } from "@/lib/utils/dedup-findings"
import { sanitizeError } from "@/lib/utils/api-error"
import { hasPermission } from "@/lib/utils/permissions"

const SEVERITY_MAP: Record<string, string> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "informational",
  informational: "informational",
  unknown: "informational",
}

function normalizeSeverity(sev: string | undefined): string {
  return SEVERITY_MAP[(sev || "info").toLowerCase().trim()] || "informational"
}

function tryParseJson(raw: string): any[] {
  const trimmed = raw.trim()
  // Try as JSON array first
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed)
      if (Array.isArray(arr)) return arr
    } catch { /* fall through */ }
  }
  // Try as NDJSON (newline-delimited JSON)
  const lines = trimmed.split("\n").filter(l => l.trim())
  if (lines.length > 0 && lines.every(l => l.trim().startsWith("{"))) {
    const results: any[] = []
    for (const line of lines) {
      try {
        results.push(JSON.parse(line))
      } catch { /* skip malformed lines */ }
    }
    if (results.length > 0) return results
  }
  // Try as single JSON object
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed)
      return [obj]
    } catch { /* fall through */ }
  }
  return []
}

function extractNucleiFields(item: any): {
  name: string
  severity: string
  description: string
  target: string
  extra: Record<string, unknown>
  raw_evidence: string | null
} {
  const info = item.info || {}
  const name = item["template-id"] || item.template || info.name || "Scanner finding"
  const severity = normalizeSeverity(item.severity || info.severity)
  const description = info.description || item.description || ""
  const target = item["matched-at"] || item.matched_at || item.host || item.url || item.target || ""
  const raw_evidence = item.raw_evidence || item.raw || null
  const extra: Record<string, unknown> = {
    ...(item.extra || {}),
    tags: info.tags || undefined,
    remediation: info.remediation || item.remediation || undefined,
    reference: info.reference || item.reference || undefined,
    template_url: item["template-url"] || undefined,
    type: item.type || undefined,
    cwe: info.cwe || item.cwe || undefined,
    template_id: item["template-id"] || undefined,
  }
  Object.keys(extra).forEach(k => { if (extra[k] === undefined) delete extra[k] })
  return { name, severity, description, target, extra, raw_evidence }
}

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (!hasPermission(profile.role, "scanners:kali_terminal")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const { project_id, json_content } = body
    if (!project_id || !json_content) {
      return NextResponse.json({ error: "project_id and json_content are required" }, { status: 400 })
    }

    const pool = getPool()

    // Verify project belongs to org
    const { rows: projects } = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [project_id, profile.org_id]
    )
    if (projects.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Parse the JSON
    const items = tryParseJson(json_content)
    if (items.length === 0) {
      return NextResponse.json({ error: "Could not parse any findings from the provided content. Paste nuclei -json output or a JSON array." }, { status: 400 })
    }

    // Use the SAME UUID for both zap_tasks and scan_history so that
    // the scan-history page can find pending_alerts by scan_history.id
    const scanId = crypto.randomUUID()
    const taskId = scanId

    await pool.query(
      `INSERT INTO zap_tasks (id, org_id, project_id, target_url, status, scan_config, started_by, started_at)
       VALUES ($1, $2, $3, 'clipboard-import', 'completed', $4::jsonb, $5, NOW())`,
      [taskId, profile.org_id, project_id, JSON.stringify({ source: "clipboard", count: items.length }), user.id]
    )

    // Create a scan_history row
    await pool.query(
      `INSERT INTO scan_history (id, org_id, project_id, scan_type, scan_target, status, started_by, started_at, completed_at, findings_found)
       VALUES ($1, $2, $3, 'manual', 'clipboard-import', 'completed', $4, NOW(), NOW(), $5)`,
      [scanId, profile.org_id, project_id, user.id, items.length]
    )

    // Normalise raw items & dedup identical findings
    const rawFindings = items.map(extractNucleiFields)
    const rawInputs: FindingInput[] = rawFindings.map(r => ({
      id: crypto.randomUUID(),
      finding_name: r.name,
      title: r.name,
      severity: r.severity,
      description: r.description,
      target: r.target,
      url: r.target,
      endpoint_url: r.target,
      raw_evidence: r.raw_evidence ?? undefined,
      extra: r.extra,
    }))
    const deduped = dedupFindings(rawInputs)

    // Map findings to pending_alerts
    const findings: any[] = []
    for (const dedupedItem of deduped) {
      const alertId = crypto.randomUUID()
      const item = dedupedItem as typeof dedupedItem & { name?: string }
      const name = item.finding_name || item.title || item.name || "Scanner finding"
      const severity = item.severity || "informational"
      const targetUrl = (item.targets?.length ?? 0) > 1
        ? item.targets!.join(", ")
        : (item.target || item.url || null)
      const impParams = (item.params as string[] | undefined) || []
      const impAttacks = (item.attacks as string[] | undefined) || []
      const targetsLen = item.targets?.length ?? 0
      const paramValue = impParams.length > 0
        ? impParams.join(", ")
        : (targetsLen > 1 ? item.targets!.join(", ") : (item.target || item.url || null))
      const attackValue = impAttacks.length > 0
        ? impAttacks.join(", ")
        : null
      const instCount = item.instance_count || 1
      const mergedTitle = instCount > 1 && targetsLen > 1
        ? `${name} [${instCount} instances on ${targetsLen} targets]`
        : name
      const rawEvidence = item.raw_evidence || null
      const extra = (item.extra || {}) as Record<string, unknown>

      await pool.query(
        `INSERT INTO pending_alerts
           (id, task_id, org_id, project_id, alert_name, severity, url, description, raw_data, evidence, solution, reference, cweid, param, attack)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15)`,
        [
          alertId,
          taskId,
          profile.org_id,
          project_id,
          mergedTitle,
          severity,
          targetUrl,
          item.description || null,
          JSON.stringify({
            ...extra,
            tool: "clipboard",
            instance_count: instCount,
            targets: item.targets,
            ...(impParams.length > 0 && { params: impParams }),
            ...(impAttacks.length > 0 && { attacks: impAttacks }),
          }),
          rawEvidence,
          (extra.remediation as string) || null,
          (extra.reference as string) || null,
          extra.cwe ? Number(extra.cwe) : null,
          paramValue,
          attackValue,
        ]
      )
      findings.push({ id: alertId, title: mergedTitle, severity, description: item.description, url: targetUrl })
    }

    await logAudit({
      action: "clipboard.import",
      resource_type: "scan_history",
      resource_id: scanId,
      new_value: { project_id, findings_count: findings.length, task_id: taskId },
    })

    return NextResponse.json({
      taskId,
      scanId,
      findingsCount: findings.length,
      findings,
    })
  } catch (e) {
    console.error("[kali/scan/import] Error:", e)
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
