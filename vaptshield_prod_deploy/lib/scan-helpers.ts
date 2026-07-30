import { getPool } from "./supabase/local-adapter"
import type { Pool } from "pg"

export interface ScanDockerSession {
  id: string
  org_id: string
  user_id: string
  container_id: string
  container_name: string
  container_type: string
  status: string
}

/**
 * Get the real Docker container_id for a ZAP scan from zap_tasks.
 * The worker stores the actual Docker hash (e.g. "abc123def456") in
 * zap_tasks.container_id (index.ts:2040 + dequeue path:2273). The app also
 * writes it defense-in-depth in spawnZapContainer (manager.ts).
 * This is the reliable way to find the real container ID — searching
 * docker_sessions by the old `zap-{scanId}` pattern fails because
 * container_id gets overwritten with the real hash on successful spawn.
 */
export async function getZapContainerId(scanId: string): Promise<string | null> {
  const pool = getPool()
  const { rows } = await pool.query(
    `SELECT container_id FROM zap_tasks WHERE id = $1 AND container_id IS NOT NULL`,
    [scanId]
  )
  return rows.length > 0 ? rows[0].container_id : null
}

/**
 * Find Docker sessions for a ZAP scan by its real container_id (from zap_tasks).
 * Returns sessions in 'starting' or 'running' status.
 */
export async function findZapSessionsByScanId(
  scanId: string,
  statusFilter: string[] = ["starting", "running"],
): Promise<ScanDockerSession[]> {
  const pool = getPool()
  const containerId = await getZapContainerId(scanId)
  if (!containerId) return []

  const statusList = statusFilter.map((_, i) => `$${i + 2}`).join(", ")
  const params: unknown[] = [containerId, ...statusFilter]
  const { rows } = await pool.query(
    `SELECT id, org_id, user_id, container_id, container_name, container_type, status
     FROM docker_sessions
     WHERE container_id = $1
       AND status IN (${statusList})`,
    params
  )
  return rows
}

/**
 * Find and kill Docker containers associated with a ZAP scan via the shared manager.
 * Gets the real container_id from zap_tasks → looks up docker_session → kills container.
 * Returns the number of sessions that were killed.
 */
export async function killZapSessionsByScanId(scanId: string): Promise<number> {
  const { killContainer } = await import("./docker/manager")
  const containerId = await getZapContainerId(scanId)
  if (!containerId) {
    console.warn(`[scan-helpers] No container_id found in zap_tasks for scan ${scanId} — nothing to kill`)
    return 0
  }

  try {
    await killContainer(containerId)
    return 1
  } catch (err) {
    console.error(`[scan-helpers] Failed to kill container ${containerId}:`, err instanceof Error ? err.message : err)
    return 0
  }
}

/**
 * Directly kill a ZAP scan's container by looking up the real container_id from zap_tasks,
 * without depending on docker_sessions container_id pattern matching.
 * Uses raw pool for use inside catch blocks where imports may fail.
 */
export async function killZapContainerByScanId(
  pool: Pool,
  scanId: string,
): Promise<void> {
  const { killContainer } = await import("./docker/manager")

  // Get real container_id from zap_tasks (this is the actual Docker hash)
  const { rows: tasks } = await pool.query(
    `SELECT container_id FROM zap_tasks WHERE id = $1 AND container_id IS NOT NULL`,
    [scanId]
  )

  if (tasks.length === 0 || !tasks[0].container_id) {
    console.warn(`[scan-helpers] No container_id in zap_tasks for scan ${scanId}`)
    return
  }

  const realContainerId: string = tasks[0].container_id
  console.log(`[scan-helpers] Killing ZAP container ${realContainerId} for scan ${scanId}`)

  // killContainer handles: worker kill (with retry), session status update, quota release
  await killContainer(realContainerId)
}
