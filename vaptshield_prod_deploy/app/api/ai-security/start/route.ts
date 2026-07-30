import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { hasPermission } from "@/lib/utils/permissions"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"
import { logAudit } from "@/lib/utils/audit-server"

const WORKER_URL = process.env.AI_SECURITY_WORKER_URL || process.env.DOCKER_HOST_API_URL || ""
const WORKER_KEY = process.env.DOCKER_HOST_API_KEY || ""

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = await slidingWindowRateLimit(`ai-security-start:${user.id}`, 5, 3600)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (!hasPermission(profile.role, "scanners:kali_terminal")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const { project_id, target_url, target_api_key, scan_mode } = body
    if (!project_id || !target_url) return NextResponse.json({ error: "project_id and target_url required" }, { status: 400 })

    try { new URL(target_url) } catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }) }

    const pool = getPool()
    const { rows } = await pool.query(
      `INSERT INTO ai_security_scans (org_id, project_id, target_url, target_api_key, target_type, scan_mode, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'queued',$7) RETURNING id`,
      [profile.org_id, project_id, target_url, target_api_key || null, "llm_api", scan_mode || "full", user.id]
    )
    const scanId = rows[0].id

    const workerRes = await fetch(`${WORKER_URL}/scan/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WORKER_KEY}` },
      body: JSON.stringify({ scan_id: scanId, target_url, target_api_key: target_api_key || "", scan_mode: scan_mode || "full" }),
      signal: AbortSignal.timeout(10000),
    })

    if (!workerRes.ok) {
      await pool.query(`UPDATE ai_security_scans SET status='failed', error_message='Worker unavailable' WHERE id=$1`, [scanId])
      return NextResponse.json({ error: "Worker not reachable" }, { status: 503 })
    }

    await pool.query(`UPDATE ai_security_scans SET status='running', started_at=NOW() WHERE id=$1`, [scanId])

    await logAudit({ action: "ai_security.scan_started", resource_type: "ai_security_scan", resource_id: scanId, new_value: { target_url, scan_mode, project_id } })
    return NextResponse.json({ success: true, scan_id: scanId })
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }) }
}
