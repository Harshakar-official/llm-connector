import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { checkCiScanQuota, rollbackCiScanQuota } from "@/lib/docker/quota"
import { spawnCicdSession, triggerCicdScan } from "@/lib/docker/manager"
import { encrypt, decrypt } from "@/lib/utils/encryption"
import { hasPermission } from "@/lib/utils/permissions"
import { logAudit } from "@/lib/utils/audit-server"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import crypto from "crypto"

// ─── Rate Limiter: 5 scan triggers per minute per user ────────────────
const cicdScanRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  analytics: true,
  prefix: "ratelimit:cicd:scan:",
})

// ─── SEC-3: Validate repo_url is a legitimate GitHub/GitLab/Bitbucket URL ──
const VALID_REPO_URL_REGEX = /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[\w\-.]+\/[\w\-.]+(\.git)?\/?$/

function isValidRepoUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false
  const trimmed = url.trim().replace(/\/$/, "")
  return VALID_REPO_URL_REGEX.test(trimmed)
}

export async function GET() {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 400 })

    const { data: configs, error } = await supabase
      .from("cicd_configs")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })

    if (error) throw error

    // ─── Reconciliation: Sync stuck 'running'/'queued' configs with actual scan_history status ──
    // If last_scan_status is 'running' or 'queued' but the latest scan_history is 'failed' or 'completed',
    // update cicd_configs to reflect the true state. This prevents UI from showing stale "In Progress".
    const stuckConfigs = configs.filter(c => c.last_scan_status === "running" || c.last_scan_status === "queued")
    if (stuckConfigs.length > 0) {
      const pool = getPool()
      for (const cfg of stuckConfigs) {
        try {
          const { rows: latestScans } = await pool.query(
            `SELECT status FROM scan_history
             WHERE scan_type = 'cicd' AND scan_target = $1 AND org_id = $2
             ORDER BY started_at DESC LIMIT 1`,
            [cfg.repo_url, profile.org_id]
          )
          if (latestScans.length > 0) {
            const dbStatus = latestScans[0].status
            if (dbStatus === "failed" || dbStatus === "completed" || dbStatus === "cancelled") {
              const newStatus = dbStatus === "completed"
                ? "Good"  // will be corrected below if findings exist
                : dbStatus === "cancelled" ? "cancelled" : "failed"
              await pool.query(
                `UPDATE cicd_configs SET last_scan_status = $1 WHERE id = $2`,
                [newStatus, cfg.id]
              ).catch(() => {})
              cfg.last_scan_status = newStatus
              // If completed, check if there were findings → "Warning" instead of "Good"
              if (dbStatus === "completed") {
                const { rows: findingCount } = await pool.query(
                  `SELECT COUNT(*)::int as cnt FROM scan_findings sf
                   JOIN scan_history sh ON sf.scan_id = sh.id
                   WHERE sh.scan_target = $1 AND sh.org_id = $2 AND sh.status = 'completed'
                   ORDER BY sh.started_at DESC LIMIT 1`,
                  [cfg.repo_url, profile.org_id]
                )
                if (findingCount.length > 0 && findingCount[0].cnt > 0) {
                  await pool.query(
                    `UPDATE cicd_configs SET last_scan_status = 'Warning' WHERE id = $1`,
                    [cfg.id]
                  ).catch(() => {})
                  cfg.last_scan_status = "Warning"
                }
              }
            }
          }
        } catch { /* silent — reconciliation is best-effort */ }
      }
    }

    const repoTargets = configs.map(c => c.repo_url)
    const statsMap: Record<string, { critical: number; high: number; medium: number; low: number; info: number; lastScanId: string | null; activeScanId: string | null }> = {}

    if (repoTargets.length > 0) {
      const pool = getPool()
      const { rows } = await pool.query(
        `WITH latest_scans AS (
           SELECT DISTINCT ON (scan_target) id, scan_target, status
           FROM scan_history
           WHERE scan_type = 'cicd' AND scan_target = ANY($1) AND org_id = $2
           ORDER BY scan_target, started_at DESC
         ),
         latest_completed AS (
           SELECT DISTINCT ON (scan_target) id, scan_target
           FROM scan_history
           WHERE scan_type = 'cicd' AND scan_target = ANY($1) AND status = 'completed' AND org_id = $2
           ORDER BY scan_target, started_at DESC
         )
         SELECT ls.scan_target,
                sf.severity,
                COUNT(sf.id)::int as cnt,
                lc.id as last_scan_id,
                ls.id as active_scan_id
         FROM latest_scans ls
         LEFT JOIN latest_completed lc ON lc.scan_target = ls.scan_target
         LEFT JOIN scan_findings sf ON lc.id = sf.scan_id
         GROUP BY ls.scan_target, ls.id, lc.id, sf.severity`,
        [repoTargets, profile.org_id]
      )
      for (const row of rows) {
        if (!statsMap[row.scan_target]) {
          statsMap[row.scan_target] = { critical: 0, high: 0, medium: 0, low: 0, info: 0, lastScanId: null, activeScanId: null }
        }
        const sev = (row.severity || "").toLowerCase()
        if (sev === "critical") statsMap[row.scan_target].critical = row.cnt
        else if (sev === "high") statsMap[row.scan_target].high = row.cnt
        else if (sev === "medium") statsMap[row.scan_target].medium = row.cnt
        else if (sev === "low") statsMap[row.scan_target].low = row.cnt
        else if (sev) statsMap[row.scan_target].info = row.cnt
        
        if (row.last_scan_id) statsMap[row.scan_target].lastScanId = row.last_scan_id
        if (row.active_scan_id) statsMap[row.scan_target].activeScanId = row.active_scan_id
      }
    }

    const configsWithStats = configs.map(c => ({
      ...c,
      stats: statsMap[c.repo_url] || { critical: 0, high: 0, medium: 0, low: 0, info: 0, lastScanId: null, activeScanId: null },
    }))

    return NextResponse.json({ configs: configsWithStats })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch configs" }, { status: 500 })
  }
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

    const { repo_url, pat, repo_owner, project_id, post_pr_comment } = await req.json()
    if (!repo_url) {
      return NextResponse.json({ error: "repo_url is required" }, { status: 400 })
    }

    // ─── SEC-3: Validate repo_url is a legitimate GitHub/GitLab/Bitbucket URL ──
    if (!isValidRepoUrl(repo_url)) {
      return NextResponse.json({
        error: "Invalid repo_url. Must be a valid https://github.com, https://gitlab.com, or https://bitbucket.org repository URL."
      }, { status: 400 })
    }

    // Must require a project ID to tie the scan to a project in VAPTShield
    let finalProjectId = project_id
    if (!finalProjectId) {
      const { data: proj } = await supabase.from("projects").select("id").eq("org_id", profile.org_id).limit(1).single()
      if (!proj) return NextResponse.json({ error: "No project found in org. Create a project first." }, { status: 400 })
      finalProjectId = proj.id
    }

    const repoName = repo_url.replace(/\.git$/, "").replace(/\/$/, "").split("/").pop() || repo_url
    const owner = repo_owner || repo_url.replace(/\.git$/, "").replace(/\/$/, "").split("/").slice(-2, -1)[0]
    const webhookSecret = crypto.randomBytes(32).toString("hex")

    // ─── F4: Validate PAT proactively ───
    if (pat && typeof pat === "string" && pat.trim()) {
      const githubRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `token ${pat.trim()}`, "User-Agent": "VAPTShield" }
      })
      if (!githubRes.ok) {
        return NextResponse.json({ error: "Invalid or expired Personal Access Token" }, { status: 400 })
      }
    }

    // AES-256-GCM encrypted storage (ENCRYPTION_KEY required in env)
    let encryptedPat = null
    if (pat && typeof pat === "string" && pat.trim()) {
      encryptedPat = encrypt(pat)
    }

    const { data: newConfig, error } = await supabase
      .from("cicd_configs")
      .insert({
        org_id: profile.org_id,
        project_id: finalProjectId,
        repo_url,
        repo_name: repoName,
        repo_owner: owner,
        encrypted_pat: encryptedPat,
        webhook_secret: webhookSecret,
        created_by: user.id,
        post_pr_comment: post_pr_comment ?? false,
      })
      .select("*")
      .single()

    if (error) throw error

    await logAudit({
      action: "cicd_config.created" as any,
      org_id: profile.org_id,
      resource_type: "cicd_configs",
      resource_id: newConfig.id,
      new_value: { 
        repo_url: newConfig.repo_url, 
        repo_name: newConfig.repo_name, 
        webhook_secret_viewed: true 
      }
    })

    return NextResponse.json({ config: newConfig })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to create config" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 400 })

    const body = await req.json()

    // ─── Branch: Scan Trigger (action === "scan") ───────────────────
    if (body.action === "scan") {
      return handleScanTrigger(supabase, profile, body, user.id)
    }

    // ─── F1: Branch: Rotate Webhook Secret ──────────────────────────
    if (body.action === "rotate_secret") {
      if (profile.role !== "admin" && profile.role !== "security_engineer") {
        return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 })
      }
      if (!body.id) return NextResponse.json({ error: "Config ID is required" }, { status: 400 })

      const newSecret = crypto.randomBytes(32).toString("hex")
      const { data: updated, error } = await supabase
        .from("cicd_configs")
        .update({ webhook_secret: newSecret, updated_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("org_id", profile.org_id)
        .select("*")
        .single()

      if (error) throw error
      if (!updated) return NextResponse.json({ error: "Config not found" }, { status: 404 })

      await logAudit({
        action: "cicd_config.secret_rotated" as any,
        org_id: profile.org_id,
        resource_type: "cicd_configs",
        resource_id: updated.id,
        new_value: { webhook_secret_viewed: true }
      })

      return NextResponse.json({ config: updated })
    }

    // ─── Branch: Config Update ──────────────────────────────────────
    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 })
    }

    const { id, repo_url, repo_owner, post_pr_comment } = body
    if (!id) {
      return NextResponse.json({ error: "Config ID is required" }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (repo_url !== undefined) {
      if (repo_url && !isValidRepoUrl(repo_url)) {
        return NextResponse.json({
          error: "Invalid repo_url. Must be a valid https://github.com, https://gitlab.com, or https://bitbucket.org repository URL."
        }, { status: 400 })
      }
      updates.repo_url = repo_url
      if (repo_url) {
        updates.repo_name = repo_url.replace(/\.git$/, "").replace(/\/$/, "").split("/").pop() || repo_url
      }
    }
    if (repo_owner !== undefined) updates.repo_owner = repo_owner
    if (post_pr_comment !== undefined) updates.post_pr_comment = post_pr_comment

    const { data: updated, error } = await supabase
      .from("cicd_configs")
      .update(updates)
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .select("*")
      .single()

    if (error) throw error
    if (!updated) return NextResponse.json({ error: "Config not found" }, { status: 404 })

    return NextResponse.json({ config: updated })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 400 })

    if (!hasPermission(profile.role, "scanners:cicd_configure")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Config ID is required" }, { status: 400 })

    const { error } = await supabase
      .from("cicd_configs")
      .delete()
      .eq("id", id)
      .eq("org_id", profile.org_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to delete config" }, { status: 500 })
  }
}

// ─── Scan Trigger Handler (called from PUT when action === "scan") ──
async function handleScanTrigger(
  supabase: any,
  profile: { org_id: string; role: string },
  body: { id: string; action: string; branch?: string },
  userId: string,
) {
  const { id, branch: requestBranch } = body

  // Rate limiting
  const rateLimitResult = await cicdScanRatelimit.limit(userId)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many scan triggers. Please wait 1 minute." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": "5",
          "X-RateLimit-Remaining": String(rateLimitResult.remaining),
          "X-RateLimit-Reset": String(rateLimitResult.reset),
        },
      },
    )
  }

  // Fetch the config
  const { data: config, error: cfgError } = await supabase
    .from("cicd_configs")
    .select("*")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .single()

  if (cfgError || !config) return NextResponse.json({ error: "Config not found" }, { status: 404 })

  const pool = getPool()

  // ─── L2: Prevent duplicate running scans ───
  const { rows: existingScans } = await pool.query(
    `SELECT id FROM scan_history WHERE scan_target = $1 AND status IN ('running', 'queued') AND org_id = $2 AND scan_type = 'cicd' LIMIT 1`,
    [config.repo_url, profile.org_id]
  )
  if (existingScans.length > 0) {
    return NextResponse.json({ error: "A scan is already running for this repository" }, { status: 409 })
  }

  // ─── QUOTA CHECK: Enforce daily CI scan limit (3/day for free tier) ──
  const quotaOk = await checkCiScanQuota(profile.org_id)
  if (!quotaOk) {
    return NextResponse.json({
      error: "Daily CI scan limit reached (3/day). Upgrade plan or wait until tomorrow."
    }, { status: 429 })
  }

  const scanId = crypto.randomUUID()

  // ─── DOCKER SLOT: Acquire container slot via Docker Manager ──────────
  const cicdSession = await spawnCicdSession(scanId, profile.org_id, userId, config.repo_url)
  if (!cicdSession.success) {
    await rollbackCiScanQuota(profile.org_id)
    return NextResponse.json({ error: cicdSession.error }, { status: 429 })
  }

  // Create scan_history record via direct SQL (bypasses Supabase RLS for reliability)
  const { rowCount } = await pool.query(
    `INSERT INTO scan_history (id, org_id, project_id, scan_type, scan_target, repo_name, status, started_at, branch_name, started_by)
     VALUES ($1, $2, $3, 'cicd', $4, $5, 'running', NOW(), $6, $7)`,
    [scanId, profile.org_id, config.project_id, config.repo_url, config.repo_name, config.branch || "HEAD", userId]
  )

  if (rowCount === 0) {
    // Rollback: release slot if scan_history insert failed
    await pool.query(`UPDATE docker_sessions SET status = 'stopped' WHERE id = $1`, [cicdSession.sessionId!]).catch(() => {})
    await rollbackCiScanQuota(profile.org_id)
    return NextResponse.json({ error: "Failed to create scan record" }, { status: 500 })
  }

  // Update config status
  await supabase
    .from("cicd_configs")
    .update({ last_scan_status: "running", last_scan_at: new Date().toISOString() })
    .eq("id", config.id)

  // Decrypt PAT for private repos (AES-256-GCM)
  const decryptedPat = config.encrypted_pat
    ? decrypt(config.encrypted_pat)
    : null
  const branch = requestBranch || config.branch || "HEAD"

  // ─── FIRE-AND-FORGET: Trigger worker via Docker Manager ────────────
  // manager.ts handles async error recovery (marks scan as failed on error)
  // SEC-4: PAT is passed via Bearer token auth to worker, not logged.
  // PAT is only used ephemerally for git clone inside the worker container.
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

  return NextResponse.json({ scanId, repoName: config.repo_name })
}