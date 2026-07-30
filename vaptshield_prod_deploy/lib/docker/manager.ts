"use server"

import crypto from "crypto"
import { getPool } from "@/lib/supabase/local-adapter"
import { acquireDockerSlot, releaseDockerSlot } from "./quota"

const getWorkerUrl = () => {
  const url = process.env.DOCKER_HOST_API_URL || ""
  if (!url) return process.env.FALLBACK_WORKER_URL || ""
  return url
}
const getWorkerKey = () => process.env.DOCKER_HOST_API_KEY || ""

function resolveWorkerUrl(endpoint: string, containerType?: string): string {
  const base = getWorkerUrl()
  if (containerType === "zap" || (!containerType && endpoint.includes("zap"))) {
    return process.env.ZAP_WORKER_URL || base
  }
  if (containerType === "cicd" || (!containerType && endpoint.includes("cicd"))) {
    return process.env.CICD_WORKER_URL || base
  }
  return base
}

interface SpawnResult {
  success: boolean
  wsUrl?: string
  containerId?: string
  sessionId?: string
  error?: string
  inUseBy?: { id: string; full_name: string } | null
}

interface DockerSession {
  id: string
  org_id: string
  user_id: string
  container_id: string
  container_name: string
  container_type: "kali" | "zap" | "cicd"
  port: number
  ws_url: string
  status: string
  last_heartbeat: string
  max_lifetime_at: string
  created_at: string
}

const JWT_SECRET = process.env.JWT_SECRET as string

export async function signWorkerToken(userId: string, orgId: string, role: string, sessionId?: string): Promise<string> {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured in the environment")
  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: userId,
    org_id: orgId,
    role,
    session_id: sessionId || "",
    iat: now,
    exp: now + 300,
  }

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url")
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = crypto.createHmac("sha256", JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url")

  return `${headerB64}.${payloadB64}.${signature}`
}

interface WorkerUser {
  id: string
  org_id: string
  role: string
}

async function callWorker(endpoint: string, body: Record<string, unknown>, user?: WorkerUser, containerType?: string): Promise<Response> {
  let authToken: string

  if (user && JWT_SECRET) {
    try {
      authToken = await signWorkerToken(user.id, user.org_id, user.role, (body.sessionId as string) || "")
    } catch {
      throw new Error("Worker JWT signing failed")
    }
  } else if (JWT_SECRET) {
    // Internal call (no user context) — sign a system JWT with system_service
    // role so the worker can authenticate it and skip org-scope checks securely.
    try {
      authToken = await signWorkerToken("system", "", "system_service", "")
    } catch {
      throw new Error("System JWT signing failed")
    }
  } else if (getWorkerKey()) {
    // Legacy fallback: static key (only for endpoints that still accept it)
    authToken = getWorkerKey()
  } else {
    throw new Error("Worker authentication key is not configured")
  }

  const baseUrl = resolveWorkerUrl(endpoint, containerType)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    return await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function checkWorkerHealth(url?: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const targetUrl = url || getWorkerUrl()
    const res = await fetch(`${targetUrl}/health`, {
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    console.error(`[manager] Worker not reachable at ${url || getWorkerUrl()}`)
    return false
  }
}

export async function spawnKaliContainer(userId: string, orgId: string, projectId?: string, userRole?: string): Promise<SpawnResult> {
  const workerHealthy = await checkWorkerHealth(process.env.DOCKER_HOST_API_URL)
  if (!workerHealthy) {
    return { success: false, error: "Container worker is not reachable. Ensure the worker service is running." }
  }

  const slot = await acquireDockerSlot(orgId, "kali")
  if (!slot.success) {
    return { success: false, error: slot.error, inUseBy: slot.inUseBy }
  }

  const sessionId = slot.sessionId!
  const pool = getPool()
  const usedPorts = await pool.query(
    `SELECT port FROM docker_sessions WHERE org_id = $1 AND status IN ('starting', 'running', 'idle') AND container_type = 'kali'`,
    [orgId]
  ).then(r => new Set(r.rows.map((row: any) => row.port))).catch(() => new Set<number>())

  let port = 7681 + Math.floor(Math.random() * 100)
  let attempts = 0
  while (usedPorts.has(port) && attempts < 20) {
    port = 7681 + Math.floor(Math.random() * 100)
    attempts++
  }
  try {
    await pool.query(
      `INSERT INTO docker_sessions (id, org_id, user_id, container_id, container_name, container_type, port, ws_url, status, max_lifetime_at, project_id)
       VALUES ($1, $2, $3, $4, $5, 'kali', $6, $7, 'starting', NOW() + INTERVAL '2 hours', $8)`,
      [
        sessionId, orgId, userId,
        `kali-${sessionId}`,
        `kali-${userId}-${Date.now()}`,
        port,
        'pending',
        projectId || null,
      ]
    )

    const userInfo = userRole ? { id: userId, org_id: orgId, role: userRole } : undefined
    const res = await callWorker("/spawn-kali", { sessionId, orgId, userId, port, projectId, e2eeKey: '' }, userInfo)
    if (!res.ok) {
      console.error("[docker] Kali spawn worker failed:", res.status)
      throw new Error("Container operation failed")
    }

    const data = await res.json()
    
    if (data.queued) {
      // The gateway queued the request because resources are full.
      // Leave status as 'starting' (or set to 'queued') and let frontend poll.
      await pool.query(`UPDATE docker_sessions SET status = 'starting' WHERE id = $1`, [sessionId])
      return { success: true, sessionId }
    }

    await pool.query(
      `UPDATE docker_sessions SET container_id = $1, status = 'running' WHERE id = $2`,
      [data.containerId, sessionId]
    )

    // Use the proxy path returned by the worker if available
    const wsHost = process.env.DOCKER_WS_HOST || process.env.FALLBACK_WORKER_URL?.replace(/^https?:\/\//, '') || ""
    const wsUrl = data.wsUrl || (wsHost ? `wss://${wsHost}/ws/terminal/${sessionId}` : "")
    
    return { success: true, wsUrl, containerId: data.containerId, sessionId }
  } catch (e) {
    await pool.query(`UPDATE docker_sessions SET status = 'stopped' WHERE id = $1`, [sessionId])
    await releaseDockerSlot(orgId, sessionId)
    return { success: false, error: e instanceof Error ? e.message : "Failed to start Kali container" }
  }
}

export async function spawnZapContainer(
  scanId: string,
  orgId: string,
  userId: string,
  targetUrl?: string,
  scanType?: string,
  authConfig?: Record<string, unknown> | null,
  enableJsCrawl?: boolean,
  authMethods?: Record<string, unknown> | null,
  enableAjaxSpider?: boolean,
  userRole?: string,
  resolvedIp?: string
): Promise<SpawnResult> {
  const workerHealthy = await checkWorkerHealth(process.env.ZAP_WORKER_URL)
  if (!workerHealthy) {
    return { success: false, error: "Container worker is not reachable. Ensure the worker service is running." }
  }

  await fixOrgStaleRunningScans(orgId)

  const slot = await acquireDockerSlot(orgId, "zap")
  if (!slot.success) {
    return { success: false, error: slot.error }
  }

  const sessionId = slot.sessionId!
  const pool = getPool()
  const usedPorts = await pool.query(
    `SELECT port FROM docker_sessions WHERE org_id = $1 AND status IN ('starting', 'running', 'idle') AND container_type = 'zap'`,
    [orgId]
  ).then(r => new Set(r.rows.map((row: any) => row.port))).catch(() => new Set<number>())

  let port = 8080 + Math.floor(Math.random() * 100)
  let attempts = 0
  while (usedPorts.has(port) && attempts < 20) {
    port = 8080 + Math.floor(Math.random() * 100)
    attempts++
  }

  try {
    await pool.query(
      `INSERT INTO docker_sessions (id, org_id, user_id, container_id, container_name, container_type, port, ws_url, status, max_lifetime_at)
       VALUES ($1, $2, $3, $4, $5, 'zap', $6, $7, 'starting', NOW() + INTERVAL '12 hours')`,
      [
        sessionId, orgId, userId,
        `zap-${scanId}`,
        `zap-${scanId}-${Date.now()}`,
        port,
        `http://localhost:${port}`,
      ]
    )

    const userInfo = userRole ? { id: userId, org_id: orgId, role: userRole } : undefined
    const res = await callWorker("/spawn-zap", {
      scanId,
      orgId,
      projectId: null,
      targetUrl: targetUrl || null,
      scanType: scanType || "full",
      authConfig: authConfig || null,
      enableJsCrawl: enableJsCrawl || false,
      authMethods: authMethods || null,
      enableAjaxSpider: enableAjaxSpider || false,
      resolvedIp: resolvedIp || null,
    }, userInfo)

    if (!res.ok) {
      console.error("[docker] ZAP spawn worker failed:", res.status)
      throw new Error("Container operation failed")
    }

    const data = await res.json()
    await pool.query(
      `UPDATE docker_sessions SET container_id = $1, status = 'running' WHERE id = $2`,
      [data.containerId, sessionId]
    )
    // Defense-in-depth: also record the real container_id in zap_tasks so
    // killZapContainerByScanId can find it even if the worker's own UPDATE
    // failed or was delayed. The worker sets this too, but writing it here
    // guarantees it's set by the time the spawn response returns.
    await pool.query(
      `UPDATE zap_tasks SET container_id = $1 WHERE id = $2 AND (container_id IS NULL OR container_id != $1)`,
      [data.containerId, scanId]
    ).catch(() => {})
    return { success: true, containerId: data.containerId, sessionId }
  } catch (e) {
    await pool.query(`UPDATE docker_sessions SET status = 'stopped' WHERE id = $1`, [sessionId])
    await releaseDockerSlot(orgId, sessionId)
    return { success: false, error: e instanceof Error ? e.message : "Failed to start ZAP container" }
  }
}

export async function spawnCicdSession(
  scanId: string,
  orgId: string,
  userId: string | null,
  repoUrl: string,
): Promise<SpawnResult> {
  const workerHealthy = await checkWorkerHealth(process.env.CICD_WORKER_URL)
  if (!workerHealthy) {
    return { success: false, error: "Container worker is not reachable." }
  }

  // ─── F5: Clean up stale running CI/CD scans before spawning ───
  await fixOrgStaleRunningScans(orgId)

  const resolvedUserId = userId || "00000000-0000-0000-0000-000000000000"
  const slot = await acquireDockerSlot(orgId, "cicd")
  if (!slot.success) {
    return { success: false, error: slot.error }
  }

  const sessionId = slot.sessionId!
  const pool = getPool()

  try {
    await pool.query(
      `INSERT INTO docker_sessions (id, org_id, user_id, container_id, container_name, container_type, port, ws_url, status, max_lifetime_at)
       VALUES ($1, $2, $3, $4, $5, 'cicd', 0, $6, 'starting', NOW() + INTERVAL '2 hours')`,
      [
        sessionId, orgId, resolvedUserId,
        `cicd-${scanId}`,
        `cicd-${scanId}-${Date.now()}`,
        `cicd://${repoUrl}`,
      ]
    )
    return { success: true, sessionId }
  } catch (e) {
    await releaseDockerSlot(orgId, sessionId)
    return { success: false, error: e instanceof Error ? e.message : "Failed to start CI/CD session" }
  }
}

export async function triggerCicdScan(
  scanId: string,
  sessionId: string,
  orgId: string,
  projectId: string | null,
  repoUrl: string,
  pat?: string | null,
  branch?: string | null,
  postPrComment?: boolean,
  prNumber?: number | null,
  commitHash?: string | null,
): Promise<void> {
  const pool = getPool()

  await pool.query(
    `UPDATE docker_sessions SET status = 'running' WHERE id = $1`,
    [sessionId]
  ).catch(() => {})

  const workerPromise = callWorker("/run-cicd", {
    scanId,
    sessionId,
    orgId,
    projectId,
    repoUrl,
    pat: pat ?? null,
    branch: branch ?? null,
    pr: prNumber ? { pr_number: prNumber } : null,
    commitHash: commitHash ?? null,
    postPrComment: postPrComment ?? false,
  })

  workerPromise.then(async (res) => {
    if (!res.ok) {
      console.error("[docker] CI/CD worker call failed")
      throw new Error("Container operation failed")
    }
  }).catch(async (e) => {
    console.error("[manager] CI/CD worker call failed:", e.message)
    await pool.query(
      `UPDATE scan_history SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
      [e.message.slice(0, 500), scanId]
    ).catch(() => {})
    await pool.query(
      `UPDATE cicd_configs SET last_scan_status = 'failed', last_scan_at = NOW()
       WHERE (repo_url = $1 OR repo_url = $2 OR repo_url = $3) AND org_id = $4`,
      [repoUrl, `${repoUrl}.git`, repoUrl.replace(/\.git$/, ""), orgId]
    ).catch(() => {})
    const { rows } = await pool.query(
      `SELECT id FROM docker_sessions WHERE container_id = $1 AND org_id = $2`,
      [`cicd-${scanId}`, orgId]
    ).catch(() => ({ rows: [] }))
    if (rows.length > 0) {
      await releaseDockerSlot(orgId, rows[0].id).catch(() => {})
      await pool.query(`UPDATE docker_sessions SET status = 'stopped' WHERE id = $1`, [rows[0].id]).catch(() => {})
    }
  })
}

export async function releaseCicdSession(scanId: string, orgId: string): Promise<boolean> {
  const pool = getPool()
  try {
    const { rows } = await pool.query(
      `SELECT id FROM docker_sessions WHERE container_id = $1 AND org_id = $2`,
      [`cicd-${scanId}`, orgId]
    )
    if (rows.length > 0) {
      await pool.query(`UPDATE docker_sessions SET status = 'stopped' WHERE id = $1`, [rows[0].id])
      return await releaseDockerSlot(orgId, rows[0].id)
    }
    return false
  } catch {
    return false
  }
}

export async function heartbeatContainer(containerId: string): Promise<boolean> {
  const pool = getPool()
  try {
    const { rows } = await pool.query(
      `SELECT max_lifetime_at FROM docker_sessions WHERE container_id = $1`,
      [containerId]
    )
    if (rows.length === 0) return false
    
    if (new Date(rows[0].max_lifetime_at).getTime() < Date.now()) {
       await killContainer(containerId)
       throw new Error("Session expired")
    }

    await pool.query(
      `UPDATE docker_sessions SET last_heartbeat = NOW() WHERE container_id = $1`,
      [containerId]
    )
    return true
  } catch {
    return false
  }
}

export async function killContainer(containerId: string, user?: WorkerUser): Promise<boolean> {
  const pool = getPool()
  try {
    const { rows } = await pool.query(
      `SELECT org_id, id, container_type FROM docker_sessions WHERE container_id = $1`,
      [containerId]
    )

    await callWorker(`/kill/${containerId}`, {}, user, rows[0]?.container_type).catch(() => {})

    if (rows.length > 0) {
      await pool.query(
        `UPDATE docker_sessions SET status = 'stopped', last_heartbeat = NOW() WHERE id = $1`,
        [rows[0].id]
      )
      await releaseDockerSlot(rows[0].org_id, rows[0].id)
    }
    return true
  } catch {
    return false
  }
}

export async function getActiveSessions(orgId: string): Promise<DockerSession[]> {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT * FROM docker_sessions WHERE org_id = $1 AND status IN ('starting', 'running')`,
    [orgId]
  )
  return rows
}

export async function getSessionByContainerId(containerId: string): Promise<DockerSession | null> {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT * FROM docker_sessions WHERE container_id = $1`,
    [containerId]
  )
  return rows[0] || null
}

export async function cleanupOrphanedContainers(): Promise<number> {
  let cleaned = 0
  
  const callCleanup = async (baseUrl: string) => {
    if (!baseUrl) return;
    try {
      const res = await fetch(`${baseUrl}/cleanup-orphans`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getWorkerKey()}` }, cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        cleaned += data.cleaned || 0
      }
    } catch {}
  }

  await callCleanup(process.env.DOCKER_HOST_API_URL || "")
  await callCleanup(process.env.ZAP_WORKER_URL || "")
  await callCleanup(process.env.CICD_WORKER_URL || "")

  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT * FROM docker_sessions
     WHERE status IN ('starting', 'running')
       AND (
         (container_type IN ('kali', 'ai_parse') AND last_heartbeat < NOW() - INTERVAL '90 seconds')
         OR max_lifetime_at < NOW()
       )`
  )
  for (const session of rows) {
    await killContainer(session.container_id)
  }
  return rows.length
}

export async function fixOrgStaleRunningScans(orgId: string): Promise<number> {
  const pool = getPool()
  let fixed = 0

  const { rows: staleScans } = await pool.query(
    `UPDATE scan_history
     SET status = 'failed',
         error_message = 'Scan timed out — no activity for extended period',
         completed_at = NOW()
     WHERE org_id = $1
       AND status = 'running'
       AND started_at < NOW() - INTERVAL '30 minutes'
     RETURNING id`,
    [orgId]
  )
  fixed += staleScans.length

  if (staleScans.length > 0) {
    const scanIds = staleScans.map((r: { id: string }) => r.id)
    await pool.query(
      `UPDATE zap_tasks
       SET status = 'failed',
           error_message = 'Scan timed out — background process died',
           completed_at = NOW()
       WHERE id = ANY($1::uuid[]) AND status = 'running'`,
      [scanIds]
    )

    for (const scanId of scanIds) {
      // ZAP: docker_sessions.container_id is overwritten with the real Docker
      // hash on spawn, so the old `zap-${scanId}%` pattern never matches.
      // Look up the real container_id from zap_tasks and kill the actual
      // container via the worker (killContainer handles worker kill + DB
      // status update + quota release).
      const { rows: zapRows } = await pool.query(
        `SELECT container_id FROM zap_tasks WHERE id = $1 AND container_id IS NOT NULL`,
        [scanId]
      )
      for (const r of zapRows) {
        await killContainer(r.container_id).catch(() => {})
      }

      // CICD: container_id stays as `cicd-${scanId}` (not overwritten), so the
      // prefix match works. Kill via the worker so the container is actually
      // stopped, not just the DB row updated.
      const { rows: cicdSessions } = await pool.query(
        `SELECT container_id FROM docker_sessions
         WHERE container_id LIKE $1 AND status IN ('starting', 'running')`,
        [`cicd-${scanId}%`]
      )
      for (const session of cicdSessions) {
        await killContainer(session.container_id).catch(() => {})
      }
    }
  }

  return fixed
}

export async function fixStaleRunningScans(): Promise<number> {
  const pool = getPool()
  const { rows: orgs } = await pool.query(
    `SELECT DISTINCT org_id FROM scan_history
     WHERE status = 'running'
       AND started_at < NOW() - INTERVAL '30 minutes'`
  )
  let fixed = 0
  for (const row of orgs) {
    fixed += await fixOrgStaleRunningScans(row.org_id)
  }
  return fixed
}
