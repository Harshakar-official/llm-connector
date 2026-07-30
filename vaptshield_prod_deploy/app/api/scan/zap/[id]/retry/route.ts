import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { spawnZapContainer } from "@/lib/docker/manager"
import { validateTargetUrl } from "@/lib/utils/ssrf-check"
import { decryptJson } from "@/lib/utils/encryption"
import { checkDockerQuota } from "@/lib/docker/quota"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 400 })

    const { id: scanId } = await params
    const pool = getPool()
    
    // Fetch scan history and zap_tasks to get config
    const { rows: scanRows } = await pool.query(
      `SELECT h.status, h.scan_target, h.project_id, t.scan_config
       FROM scan_history h
       JOIN zap_tasks t ON t.id = h.id
       WHERE h.id = $1 AND h.org_id = $2`,
      [scanId, profile.org_id]
    )

    if (scanRows.length === 0) {
      return NextResponse.json({ error: "Scan not found, unauthorized, or config unavailable" }, { status: 404 })
    }

    const scan = scanRows[0]
    if (scan.status !== "failed" && scan.status !== "cancelled") {
      return NextResponse.json({ error: "Can only retry failed or cancelled scans" }, { status: 400 })
    }

    const targetUrl = scan.scan_target
    const ssrfResult = await validateTargetUrl(targetUrl)
    if (!ssrfResult.safe) {
      return NextResponse.json({ error: ssrfResult.error }, { status: 403 })
    }

    const scanConfig = scan.scan_config || {}
    const authConfig = (scanConfig.auth_config ? decryptJson(scanConfig.auth_config) : null) as Record<string, unknown> | null
    const authMethods = (scanConfig.auth_methods ? decryptJson(scanConfig.auth_methods) : null) as Record<string, unknown> | null
    
    // Clear old findings
    await pool.query(`DELETE FROM pending_alerts WHERE task_id = $1 AND org_id = $2`, [scanId, profile.org_id])
    
    // Check quota
    const quota = await checkDockerQuota(profile.org_id)
    if (!quota.available) {
      await pool.query(`UPDATE scan_history SET status = 'queued', completed_at = NULL, error_message = NULL, findings_found = 0 WHERE id = $1`, [scanId])
      await pool.query(`UPDATE zap_tasks SET status = 'queued', completed_at = NULL, error_message = NULL, progress = 0 WHERE id = $1`, [scanId])
      return NextResponse.json({
        queued: true, scanId, position: quota.queueLength + 1,
        message: `Scan queued. Position: ${quota.queueLength + 1}.`,
      })
    }

    // Set to queued before spawn
    await pool.query(`UPDATE scan_history SET status = 'queued', completed_at = NULL, error_message = NULL, findings_found = 0 WHERE id = $1`, [scanId])
    await pool.query(`UPDATE zap_tasks SET status = 'queued', completed_at = NULL, error_message = NULL, progress = 0 WHERE id = $1`, [scanId])

    try {
      const container = await spawnZapContainer(
        scanId, profile.org_id, user.id, targetUrl,
        scanConfig.scan_type || "full",
        authConfig,
        scanConfig.enable_js_crawl || false,
        authMethods,
        scanConfig.enable_ajax_spider || false,
        profile.role,
        ssrfResult.resolvedIp
      )
      
      if (!container.success) {
        if (container.error?.includes("slot") || container.error?.includes("busy")) {
          return NextResponse.json({ queued: true, scanId, position: 0, message: "Queued" })
        }
        await pool.query(`UPDATE scan_history SET status = 'failed', error_message = $1 WHERE id = $2`, [container.error, scanId])
        return NextResponse.json({ error: container.error }, { status: 503 })
      }
      
      await pool.query(`UPDATE scan_history SET status = 'running' WHERE id = $1`, [scanId])
      return NextResponse.json({ ok: true, scanId, containerId: container.containerId })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to restart ZAP container"
      await pool.query(`UPDATE scan_history SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`, [errorMsg, scanId])
      return NextResponse.json({ error: errorMsg }, { status: 503 })
    }
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
