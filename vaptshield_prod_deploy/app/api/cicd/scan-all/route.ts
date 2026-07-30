import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { checkCiScanQuota, rollbackCiScanQuota } from "@/lib/docker/quota"
import { spawnCicdSession, triggerCicdScan } from "@/lib/docker/manager"
import { decrypt } from "@/lib/utils/encryption"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import crypto from "crypto"

const cicdScanRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  analytics: true,
  prefix: "ratelimit:cicd:scan:",
})

interface ScanAllResult {
  configId: string
  repoName: string
  scanId?: string
  error?: string
}

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 400 })

    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit check
    const rateLimitResult = await cicdScanRatelimit.limit(user.id)
    if (!rateLimitResult.success) {
      const retryAfter = Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
      return NextResponse.json(
        { error: `Rate limit exceeded. Retry after ${retryAfter}s.`, retryAfter },
        { status: 429 }
      )
    }

    // Fetch all active configs for the org
    const { data: configs, error: cfgError } = await supabase
      .from("cicd_configs")
      .select("*")
      .eq("org_id", profile.org_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (cfgError || !configs?.length) {
      return NextResponse.json({ error: "No configured repositories found" }, { status: 404 })
    }

    // Sort: public repos first (faster), private repos after
    // is_private is not a DB column — compute from repo_url pattern
    const orderedConfigs = [...configs].sort((a, b) => {
      const aPrivate = a.repo_url?.includes("@") || false
      const bPrivate = b.repo_url?.includes("@") || false
      if (aPrivate === bPrivate) return 0
      return aPrivate ? 1 : -1
    })

    const results: ScanAllResult[] = []
    const pool = getPool()

    for (const config of orderedConfigs) {
      // Check for duplicate running scan
      const { rows: existingScans } = await pool.query(
        `SELECT id FROM scan_history WHERE scan_target = $1 AND status IN ('running', 'queued') AND org_id = $2 AND scan_type = 'cicd' LIMIT 1`,
        [config.repo_url, profile.org_id]
      )
      if (existingScans.length > 0) {
        results.push({ configId: config.id, repoName: config.repo_name, error: "A scan is already running for this repository" })
        continue
      }

      // Check quota before each scan
      const quotaOk = await checkCiScanQuota(profile.org_id)
      if (!quotaOk) {
        results.push({
          configId: config.id,
          repoName: config.repo_name,
          error: "Daily CI scan limit reached. Remaining repos skipped.",
        })
        break // Stop processing further repos
      }

      try {
        const scanId = crypto.randomUUID()

        // Acquire Docker slot
        const cicdSession = await spawnCicdSession(scanId, profile.org_id, user.id, config.repo_url)
        if (!cicdSession.success) {
          await rollbackCiScanQuota(profile.org_id)
          results.push({ configId: config.id, repoName: config.repo_name, error: cicdSession.error || "No Docker slot available" })
          continue
        }

        // Create scan_history record
        const { rowCount } = await pool.query(
        `INSERT INTO scan_history (id, org_id, project_id, scan_type, scan_target, repo_name, status, started_at, branch_name, started_by)
         VALUES ($1, $2, $3, 'cicd', $4, $5, 'running', NOW(), $6, $7)`,
        [scanId, profile.org_id, config.project_id, config.repo_url, config.repo_name, config.branch || "HEAD", user.id]
        )
        if (rowCount === 0) {
          await pool.query(`UPDATE docker_sessions SET status = 'stopped' WHERE id = $1`, [cicdSession.sessionId!]).catch(() => {})
          await rollbackCiScanQuota(profile.org_id)
          results.push({ configId: config.id, repoName: config.repo_name, error: "Failed to create scan record" })
          continue
        }

        // Update config status
        await supabase
          .from("cicd_configs")
          .update({ last_scan_status: "running", last_scan_at: new Date().toISOString() })
          .eq("id", config.id)

        // Decrypt PAT for private repos
        const decryptedPat = config.encrypted_pat ? decrypt(config.encrypted_pat) : null
        const branch = config.branch || "HEAD"

        // Trigger scan
        await triggerCicdScan(
          scanId,
          cicdSession.sessionId!,
          profile.org_id,
          config.project_id || null,
          config.repo_url,
          decryptedPat,
          branch,
          config.post_pr_comment ?? false,
        )

        results.push({ configId: config.id, repoName: config.repo_name, scanId })
      } catch (e: any) {
        results.push({ configId: config.id, repoName: config.repo_name, error: e.message })
      }
    }

    const succeeded = results.filter(r => r.scanId).length
    const failed = results.filter(r => r.error).length

    return NextResponse.json({
      success: true,
      total: configs.length,
      succeeded,
      failed,
      results,
      message: `Triggered ${succeeded} scan(s)${failed > 0 ? `, ${failed} failed` : ""}`,
    })
  } catch (e: any) {
    console.error("[API_CICD_SCAN_ALL] Fatal Error:", e)
    return NextResponse.json({ error: "Batch scan trigger failed" }, { status: 500 })
  }
}