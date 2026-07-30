"use server"

import crypto from "crypto"
import { getPool } from "@/lib/supabase/local-adapter"
import { getPlanLimits, DEFAULT_PLAN } from "@/lib/config/plans"

type ContainerType = "kali" | "zap" | "cicd"

export interface QuotaInfo {
  available: boolean
  active: number
  maxSlots: number
  planTier: string
  queueLength: number
}

export interface SlotResult {
  success: boolean
  sessionId?: string
  error?: string
  inUseBy?: { id: string; full_name: string } | null
}

export async function acquireDockerSlot(
  orgId: string,
  containerType: ContainerType = "zap"
): Promise<SlotResult> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Lock quota row first — serializes all concurrent slot requests
    const { rows: quota } = await client.query(
      `SELECT active_docker_containers, max_docker_containers, paid_extra_docker, plan_tier
       FROM org_quotas WHERE org_id = $1 FOR UPDATE`,
      [orgId]
    )

    if (quota.length === 0) {
      await client.query("ROLLBACK")
      return { success: false, error: "Organization quota not found" }
    }

    if (containerType === "kali") {
      const { rows: existingKali } = await client.query(
        `SELECT ds.user_id, p.full_name
         FROM docker_sessions ds
         JOIN profiles p ON p.id = ds.user_id
         WHERE ds.org_id = $1
           AND ds.container_type = 'kali'
           AND ds.status IN ('starting', 'running', 'idle')
         LIMIT 1`,
        [orgId]
      )
      if (existingKali.length > 0) {
        await client.query("ROLLBACK")
        return {
          success: false,
          error: `Terminal is already in use by ${existingKali[0].full_name}`,
          inUseBy: { id: existingKali[0].user_id, full_name: existingKali[0].full_name },
        }
      }
    }

    const { active_docker_containers, max_docker_containers, paid_extra_docker, plan_tier } = quota[0]
    const planLabel = (plan_tier || DEFAULT_PLAN) as string
    const planLimits = getPlanLimits(planLabel)
    const baseMax = max_docker_containers ?? planLimits.maxDockerSlots
    const maxSlots = baseMax + (paid_extra_docker || 0)

    if (active_docker_containers >= maxSlots) {
      await client.query("ROLLBACK")
      return {
        success: false,
        error: `All ${maxSlots} container slot${maxSlots > 1 ? "s" : ""} are busy. Your ${planLabel} plan allows ${maxSlots} concurrent scan${maxSlots > 1 ? "s" : ""}. Wait for one to complete or upgrade your plan.`,
      }
    }

    await client.query(
      `UPDATE org_quotas SET active_docker_containers = active_docker_containers + 1
       WHERE org_id = $1`,
      [orgId]
    )

    const sessionId = crypto.randomUUID()
    await client.query("COMMIT")
    return { success: true, sessionId }
  } catch {
    await client.query("ROLLBACK")
    return { success: false, error: "Failed to acquire slot. Please try again." }
  } finally {
    client.release()
  }
}

export async function checkDockerQuota(orgId: string): Promise<QuotaInfo> {
  const pool = getPool()
  try {
    const { rows: quota } = await pool.query(
      `SELECT oq.active_docker_containers, oq.max_docker_containers, oq.paid_extra_docker, oq.plan_tier,
              (SELECT COUNT(*) FROM zap_tasks WHERE org_id = $1 AND status = 'queued') AS queue_length
       FROM org_quotas oq WHERE oq.org_id = $1`,
      [orgId]
    )
    if (quota.length === 0) {
      return { available: false, active: 0, maxSlots: 1, planTier: "free", queueLength: 0 }
    }
    const q = quota[0]
    const planLabel = (q.plan_tier || DEFAULT_PLAN) as string
    const planLimits = getPlanLimits(planLabel)
    const baseMax = q.max_docker_containers ?? planLimits.maxDockerSlots
    const maxSlots = baseMax + (q.paid_extra_docker || 0)
    return {
      available: Number(q.active_docker_containers) < maxSlots,
      active: Number(q.active_docker_containers),
      maxSlots,
      planTier: planLabel,
      queueLength: Number(q.queue_length),
    }
  } catch {
    return { available: false, active: 0, maxSlots: 1, planTier: "free", queueLength: 0 }
  }
}

export async function releaseDockerSlot(orgId: string, sessionId: string): Promise<boolean> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const { rows } = await client.query(
      `SELECT id FROM org_quotas WHERE org_id = $1 FOR UPDATE`,
      [orgId]
    )
    if (rows.length === 0) {
      await client.query("ROLLBACK")
      return false
    }
    await client.query(
      `UPDATE org_quotas SET active_docker_containers = GREATEST(active_docker_containers - 1, 0)
       WHERE org_id = $1`,
      [orgId]
    )
    await client.query(`UPDATE docker_sessions SET status = 'stopped' WHERE id = $1`, [sessionId])
    await client.query("COMMIT")
    return true
  } catch {
    await client.query("ROLLBACK")
    return false
  } finally {
    client.release()
  }
}

export async function checkCiScanQuota(orgId: string): Promise<boolean> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const { rows } = await client.query(
      `SELECT ci_scans_today, max_ci_scans_per_day, 
              (ci_scans_reset_at::date < CURRENT_DATE) as needs_reset
       FROM org_quotas WHERE org_id = $1 FOR UPDATE`,
      [orgId]
    )
    if (rows.length === 0) {
      await client.query("ROLLBACK")
      return false
    }
    const { ci_scans_today, max_ci_scans_per_day, needs_reset } = rows[0]
    const scansToday = needs_reset ? 0 : Number(ci_scans_today)
    if (scansToday >= max_ci_scans_per_day) {
      await client.query("ROLLBACK")
      return false
    }
    await client.query(
      `UPDATE org_quotas SET ci_scans_today = $1, ci_scans_reset_at = CURRENT_TIMESTAMP WHERE org_id = $2`,
      [scansToday + 1, orgId]
    )
    await client.query("COMMIT")
    return true
  } catch {
    await client.query("ROLLBACK")
    return false
  } finally {
    client.release()
  }
}

export async function rollbackCiScanQuota(orgId: string): Promise<boolean> {
  const pool = getPool()
  try {
    await pool.query(
      `UPDATE org_quotas SET ci_scans_today = GREATEST(ci_scans_today - 1, 0) WHERE org_id = $1`,
      [orgId]
    )
    return true
  } catch {
    return false
  }
}
