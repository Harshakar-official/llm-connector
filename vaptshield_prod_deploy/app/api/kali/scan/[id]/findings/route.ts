import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { hasPermission } from "@/lib/utils/permissions"

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

    // Find the zap_tasks entry for this kali session (scan_config stores { source: "kali", session_id })
    const { rows: tasks } = await pool.query(
      `SELECT id, status, created_at FROM zap_tasks
       WHERE org_id = $1 AND scan_config->>'session_id' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [profile.org_id, id]
    )

    let findings: any[] = []

    if (tasks.length > 0) {
      const taskId = tasks[0].id

      // Fetch pending alerts for this task (legacy flow)
      const { rows: alerts } = await pool.query(
        `SELECT id, alert_name, severity, url, description, raw_data,
                evidence, solution, reference, cweid, attack, param, other, riskcode
         FROM pending_alerts WHERE task_id = $1 AND org_id = $2 AND status = 'pending'
         ORDER BY
           CASE severity
             WHEN 'critical' THEN 0 WHEN 'high' THEN 1
             WHEN 'medium' THEN 2 WHEN 'low' THEN 3
             ELSE 4
           END, created_at ASC`,
        [taskId, profile.org_id]
      )

      findings = alerts.map(a => ({
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
        source: "pending_alert",
      }))
    }

    // Also check vulnerabilities table for auto-created findings
    const { rows: vulns } = await pool.query(
      `SELECT id, title, severity, description, endpoint_url, raw_scanner_data
       FROM vulnerabilities
       WHERE org_id = $1 AND raw_scanner_data->>'session_id' = $2
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 0 WHEN 'high' THEN 1
           WHEN 'medium' THEN 2 WHEN 'low' THEN 3
           ELSE 4
         END, created_at ASC`,
      [profile.org_id, id]
    )

    const vulnFindings = vulns.map(v => ({
      id: v.id,
      title: v.title,
      severity: v.severity,
      description: v.description,
      url: v.endpoint_url,
      raw_data: v.raw_scanner_data,
      source: "vulnerability",
      is_auto_created: true,
      vuln_id: v.id,
    }))

    // Merge both sources, dedup by id
    const seen = new Set(findings.map(f => f.id))
    for (const vf of vulnFindings) {
      if (!seen.has(vf.id)) {
        findings.push(vf)
        seen.add(vf.id)
      }
    }

    return NextResponse.json({ findings, taskStatus: tasks[0]?.status || "completed" })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
