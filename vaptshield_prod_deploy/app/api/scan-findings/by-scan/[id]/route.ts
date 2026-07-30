import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { hasPermission } from "@/lib/utils/permissions"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: scanId } = await params

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

    // 1. CI/CD findings live in scan_findings (scan_id = scan_history.id)
    const { data, error } = await supabase
      .from("scan_findings")
      .select("*")
      .eq("scan_id", scanId)
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })

    if (error) throw error

    const findings: any[] = (data || []).map((f: any) => ({ ...f, source: "cicd" }))
    const seen = new Set(findings.map(f => f.id))

    // 2. Kali/ZAP findings live in pending_alerts (task_id = scan_history.id,
    //    since kali/zap flows insert zap_tasks + scan_history with the SAME id).
    //    For cicd scans this query simply returns 0 rows — fully backward compatible.
    const pool = getPool()

    const { rows: scanRows } = await pool.query(
      `SELECT id, scan_type, scan_target, created_at FROM scan_history WHERE id = $1 AND org_id = $2`,
      [scanId, profile.org_id]
    )
    const scan = scanRows[0] || null
    const alertSource = scan?.scan_type === "kali" ? "kali" : scan?.scan_type === "zap" ? "zap" : "alert"

    // ─── F2: Regression Detection ───
    let prevFindings = new Set<string>()
    let prevScanId = null
    if (scan?.scan_type === "cicd" && scan?.scan_target) {
      const { rows: prevScans } = await pool.query(
        `SELECT id FROM scan_history 
         WHERE org_id = $1 AND scan_target = $2 AND scan_type = 'cicd' AND created_at < $3 AND status = 'completed'
         ORDER BY created_at DESC LIMIT 1`,
        [profile.org_id, scan.scan_target, scan.created_at || new Date().toISOString()]
      )
      if (prevScans.length > 0) {
        prevScanId = prevScans[0].id
        const { rows: pFindings } = await pool.query(
          `SELECT tool, title FROM scan_findings WHERE scan_id = $1 AND org_id = $2`,
          [prevScanId, profile.org_id]
        )
        for (const f of pFindings) {
          prevFindings.add(`${f.tool}:${f.title}`)
        }
      }
    }

    const { rows: alerts } = await pool.query(
      `SELECT id, alert_name, severity, url, description, raw_data, status,
              evidence, solution, reference, cweid, attack, param, other, riskcode,
              project_id, created_at
       FROM pending_alerts
       WHERE task_id = $1 AND org_id = $2
       ORDER BY created_at DESC`,
      [scanId, profile.org_id]
    )
    for (const a of alerts) {
      if (seen.has(a.id)) continue
      seen.add(a.id)
      findings.push({
        id: a.id,
        scan_id: scanId,
        project_id: a.project_id,
        title: a.alert_name,
        severity: a.severity,
        description: a.description,
        url: a.url,
        status: a.status,
        created_at: a.created_at,
        raw_data: a.raw_data,
        evidence: a.evidence,
        solution: a.solution,
        reference: a.reference,
        cweid: a.cweid,
        attack: a.attack,
        param: a.param,
        other: a.other,
        riskcode: a.riskcode,
        source: alertSource,
      })
    }

    // 3. Kali "auto-create" mode writes straight to vulnerabilities with
    //    raw_scanner_data->>'session_id' = docker session id (= scan_target).
    if (scan?.scan_type === "kali" && scan.scan_target) {
      const { rows: vulns } = await pool.query(
        `SELECT id, project_id, title, severity, description, endpoint_url, status,
                raw_scanner_data, created_at
         FROM vulnerabilities
         WHERE org_id = $1 AND raw_scanner_data->>'session_id' = $2
         ORDER BY created_at DESC`,
        [profile.org_id, scan.scan_target]
      )
      for (const v of vulns) {
        if (seen.has(v.id)) continue
        seen.add(v.id)
        findings.push({
          id: v.id,
          scan_id: scanId,
          project_id: v.project_id,
          title: v.title,
          severity: v.severity,
          description: v.description,
          url: v.endpoint_url,
          // vulnerabilities have their own lifecycle (open/…) — never "pending",
          // so the history UI won't offer Approve/Reject on them
          status: v.status,
          created_at: v.created_at,
          raw_data: v.raw_scanner_data,
          source: "vulnerability",
          is_auto_created: true,
          vuln_id: v.id,
        })
      }
    }

    // Apply is_new flag for CI/CD findings
    if (scan?.scan_type === "cicd" && prevScanId) {
      for (const f of findings) {
        if (f.source === "cicd") {
          f.is_new = !prevFindings.has(`${f.tool}:${f.title}`)
        }
      }
    }

    return NextResponse.json({ findings })
  } catch (e: any) {
    console.error("[scan-findings/by-scan GET] Error:", e.message)
    return NextResponse.json({ error: "Failed to fetch scan findings" }, { status: 500 })
  }
}