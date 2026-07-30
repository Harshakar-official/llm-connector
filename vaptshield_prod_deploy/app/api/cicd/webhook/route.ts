import { NextResponse } from "next/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { decrypt } from "@/lib/utils/encryption"
import { spawnCicdSession, triggerCicdScan, releaseCicdSession } from "@/lib/docker/manager"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"
import { logAudit } from "@/lib/utils/audit-server"
import crypto from "crypto"

interface RepoConfig {
  id: string
  webhook_secret: string
  repo_url: string
  org_id: string
  project_id: string | null
  encrypted_pat: string | null
  repo_name: string
  repo_owner: string | null
  created_by: string | null
  post_pr_comment: boolean
  branch_name: string | null
}

/**
 * POST /api/cicd/webhook
 *
 * GitHub webhook receiver. Validates HMAC-SHA256 signature,
 * matches a cicd_configs row by repository URL, extracts branch/commit/PR
 * metadata, and triggers an automated CI/CD scan through the Docker manager.
 *
 * Supported events: ping, push, pull_request (opened, synchronize)
 */
export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get("x-hub-signature-256") || ""
  const event = req.headers.get("x-github-event") || ""

  // ─── Rate limit per IP ─────────────────────────────────────────
  const forwardedFor = req.headers.get("x-forwarded-for")
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.headers.get("x-real-ip") || "anonymous")
  const ipLimit = await slidingWindowRateLimit(`webhook:ip:${ip}`, 20, 60)
  if (!ipLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  // ─── GitHub ping (webhook setup verification) ──────────────────────
  if (event === "ping") {
    return NextResponse.json({ msg: "pong" })
  }

  // Only trigger scans for push and PR events
  if (event !== "push" && event !== "pull_request") {
    return NextResponse.json({ ok: true })
  }

  // ─── 1. Parse payload ──────────────────────────────────────────────
  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const deliveryId = req.headers.get("x-github-delivery")
  if (!deliveryId) {
    return NextResponse.json({ error: "Missing x-github-delivery header" }, { status: 400 })
  }

  const pool = getPool()
  // Replay protection moved down (after config match) for per-org dedup.

  // ─── 2. Identify repository from payload ──────────────────────────
  const repoFullName: string | null = payload.repository?.full_name || null
  const cloneUrl: string | null = payload.repository?.clone_url || null
  const htmlUrl: string | null = payload.repository?.html_url || null

  const repoUrlsToMatch: string[] = [
    cloneUrl,
    htmlUrl,
    repoFullName ? `https://github.com/${repoFullName}` : null,
  ].filter((u): u is string => !!u)

  if (repoUrlsToMatch.length === 0) {
    return NextResponse.json(
      { error: "Cannot identify repository from payload" },
      { status: 400 },
    )
  }

  // ─── 3. Match config + verify HMAC ─────────────────────────────────
  let matchedConfig: RepoConfig | null = null

  // Strategy A: query configs matching repo URL, then verify HMAC
  for (const candidateUrl of repoUrlsToMatch) {
    const { rows } = await pool.query<RepoConfig>(
      `SELECT id, webhook_secret, repo_url, org_id, project_id,
              encrypted_pat, repo_name, repo_owner, created_by, post_pr_comment, branch
       FROM cicd_configs
       WHERE is_active = true
         AND (repo_url = $1 OR repo_url LIKE $2 OR repo_url LIKE $3)`,
      [candidateUrl, `${candidateUrl}.git`, `${candidateUrl.replace(/\.git$/, "")}%`],
    )
    for (const config of rows) {
      const expectedSig =
        `sha256=${crypto.createHmac("sha256", config.webhook_secret).update(body).digest("hex")}`
      const expectedBuf = Buffer.from(expectedSig)
      const sigBuf = Buffer.from(signature)
      if (
        expectedBuf.length === sigBuf.length &&
        crypto.timingSafeEqual(expectedBuf, sigBuf)
      ) {
        matchedConfig = config
        break
      }
    }
    if (matchedConfig) break
  }

  // Strategy B: iterate active configs matching repo URLs (fallback for URL format mismatch)
  if (!matchedConfig) {
    const { rows: allConfigs } = await pool.query<RepoConfig>(
      `SELECT id, webhook_secret, repo_url, org_id, project_id,
              encrypted_pat, repo_name, repo_owner, created_by, post_pr_comment, branch_name
       FROM cicd_configs WHERE is_active = true
         AND (repo_url = ANY($1) OR repo_url LIKE ANY($1))`,
      [repoUrlsToMatch.map(u => `${u}.git`)],
    )
    for (const config of allConfigs) {
      const expectedSig =
        `sha256=${crypto.createHmac("sha256", config.webhook_secret).update(body).digest("hex")}`
      const expectedBuf = Buffer.from(expectedSig)
      const sigBuf = Buffer.from(signature)
      if (
        expectedBuf.length === sigBuf.length &&
        crypto.timingSafeEqual(expectedBuf, sigBuf)
      ) {
        matchedConfig = config
        break
      }
    }
  }

  if (!matchedConfig) {
    console.warn(`[Webhook] No matching config for repo: ${repoFullName} — webhook delivery ignored`)
    return NextResponse.json(
      { error: "Invalid signature — no matching webhook secret found" },
      { status: 401 },
    )
  }

  // ─── Per-org rate limit ────────────────────────────────────────────
  const orgLimit = await slidingWindowRateLimit(`webhook:org:${matchedConfig.org_id}`, 10, 60)
  if (!orgLimit.success) {
    return NextResponse.json({ error: "Org webhook rate limit exceeded" }, { status: 429 })
  }

  // ─── 4. Extract branch + commit + PR metadata ─────────────────────
  let branchName: string | null = null
  let commitHash: string | null = null
  let prNumber: number | null = null
  let prUrl: string | null = null

  if (event === "push") {
    branchName =
      payload.ref?.startsWith("refs/heads/")
        ? payload.ref.slice("refs/heads/".length)
        : payload.ref || null
    commitHash = payload.head_commit?.id || payload.after || null
  } else if (event === "pull_request") {
    const action = payload.action
    if (action !== "opened" && action !== "synchronize") {
      return NextResponse.json({
        ok: true,
        msg: `PR action '${action}' ignored — only 'opened' and 'synchronize' trigger scans`,
      })
    }
    branchName = payload.pull_request?.head?.ref || null
    commitHash = payload.pull_request?.head?.sha || null
    prNumber = payload.pull_request?.number || null
    prUrl = payload.pull_request?.html_url || null
  }

  if (!branchName) {
    return NextResponse.json(
      { error: "Could not determine branch from payload" },
      { status: 400 },
    )
  }

  // ─── L6: Branch Filtering ───
  if (matchedConfig.branch_name && branchName !== matchedConfig.branch_name) {
    return NextResponse.json({
      ok: true,
      msg: `Ignored push to branch '${branchName}', config restricts scans to '${matchedConfig.branch_name}'`,
    })
  }

  // ─── 4.5. Webhook Replay Protection (per org) ────────────────────
  try {
    const { rowCount } = await pool.query(
      "INSERT INTO processed_webhooks (delivery_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [deliveryId, matchedConfig.org_id]
    )
    if (rowCount === 0) {
      console.warn(`[Webhook] Rejected replayed delivery for org ${matchedConfig.org_id}: ${deliveryId}`)
      return NextResponse.json({ ok: true, msg: "Already processed" }, { status: 200 })
    }
  } catch (err: any) {
    console.error("Error checking webhook replay:", err.message)
    return NextResponse.json({ error: "Internal server error during replay check" }, { status: 500 })
  }

  // ─── 5. Create scan_history record ─────────────────────────────────
  const scanId = crypto.randomUUID()
  const { rowCount } = await pool.query(
    `INSERT INTO scan_history
       (id, org_id, project_id, scan_type, scan_target, repo_name, status, started_at,
        branch_name, commit_hash, pr_number, pr_url, started_by)
     VALUES ($1, $2, $3, 'cicd', $4, $5, 'queued', NOW(), $6, $7, $8, $9, $10)`,
    [
      scanId,
      matchedConfig.org_id,
      matchedConfig.project_id,
      matchedConfig.repo_url,
      matchedConfig.repo_name,
      branchName,
      commitHash,
      prNumber,
      prUrl,
      matchedConfig.created_by,
    ],
  )

  if (rowCount === 0) {
    return NextResponse.json(
      { error: "Failed to create scan history record" },
      { status: 500 },
    )
  }

  // Update cicd_configs last scan status
  await pool
    .query(
      `UPDATE cicd_configs
       SET last_scan_status = 'queued', last_scan_at = NOW()
       WHERE id = $1 AND org_id = $2`,
      [matchedConfig.id, matchedConfig.org_id],
    )
    .catch(() => {})

  // ─── 6. Decrypt PAT (if any) ───────────────────────────────────────
  let decryptedPat: string | null = null
  if (matchedConfig.encrypted_pat) {
    try {
      decryptedPat = decrypt(matchedConfig.encrypted_pat)
    } catch {
      console.warn(
        "[webhook] Failed to decrypt PAT for repo:",
        matchedConfig.repo_name,
      )
    }
  }

  // ─── 7. Acquire Docker slot + trigger scan ─────────────────────────
  try {
    const userId = matchedConfig.created_by || matchedConfig.org_id
    const session = await spawnCicdSession(
      scanId,
      matchedConfig.org_id,
      userId,
      matchedConfig.repo_url,
    )

    if (!session.success) {
      await pool.query(
        `UPDATE scan_history SET status = 'failed', error_message = $1 WHERE id = $2`,
        [session.error || "No Docker slots available", scanId],
      )
      await pool.query(
        `UPDATE cicd_configs SET last_scan_status = 'failed' WHERE id = $1`,
        [matchedConfig.id],
      )
      return NextResponse.json(
        { error: session.error || "No Docker slots available" },
        { status: 429 },
      )
    }

    // Fire-and-forget: manager.ts handles async error recovery
    await triggerCicdScan(
      scanId,
      session.sessionId!,
      matchedConfig.org_id,
      matchedConfig.project_id || null,
      matchedConfig.repo_url,
      decryptedPat,
      branchName,
      matchedConfig.post_pr_comment ?? false,
      prNumber,
      commitHash
    )

    // ─── F6: Audit Log Webhook Delivery ───
    await logAudit({
      action: "scan.started" as any,
      org_id: matchedConfig.org_id,
      resource_type: "scan_history",
      resource_id: scanId,
      new_value: { delivery_id: deliveryId, repo_url: matchedConfig.repo_url, branch: branchName, commit_hash: commitHash }
    })

    return NextResponse.json(
      { ok: true, scanId, branch: branchName, commit: commitHash },
      { status: 202 },
    )
  } catch (e: any) {
    console.error("[webhook] Scan trigger failed:", e.message)
    // Release Docker slot if it was acquired but scan failed
    try {
      await releaseCicdSession(scanId, matchedConfig.org_id)
    } catch (releaseErr: any) {
      console.warn("[webhook] Failed to release Docker slot:", releaseErr.message)
    }
    await pool.query(
      `UPDATE scan_history SET status = 'failed', error_message = $1 WHERE id = $2`,
      [e.message, scanId],
    )
    await pool.query(
      `UPDATE cicd_configs SET last_scan_status = 'failed' WHERE id = $1`,
      [matchedConfig.id],
    )
    return NextResponse.json(
      { error: "Scan trigger failed" },
      { status: 500 },
    )
  }
}