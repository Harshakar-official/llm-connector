import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { killContainer } from "@/lib/docker/manager"
import { sanitizeError } from "@/lib/utils/api-error"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 })
    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 })
    }

    const rl = await slidingWindowRateLimit(`force-cleanup:${user.id}`, 5, 60)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests. Max 5 per minute." }, { status: 429 })
    }

    const pool = getPool()

    // Get all stuck sessions for this org (outside the transaction so worker
    // kills don't hold the quota lock).
    const { rows: sessions } = await pool.query(
      `SELECT id, container_id, container_name, container_type
       FROM docker_sessions
       WHERE org_id = $1 AND status IN ('starting', 'running', 'idle')`,
      [profile.org_id]
    )

    if (sessions.length === 0) {
      return NextResponse.json({ cleaned: 0, message: "No stuck sessions found" })
    }

    // Kill each container via the worker first — otherwise the Docker
    // container keeps running on the worker host while the DB row is gone.
    // killContainer handles worker /kill + session status update + quota
    // release (using its own pool connection, so no lock conflict here).
    const userInfo = { id: user.id, org_id: profile.org_id, role: profile.role }
    for (const s of sessions) {
      await killContainer(s.container_id, userInfo).catch(() => {})
    }

    // Reconcile: delete any sessions still stuck (e.g. killContainer couldn't
    // update them) and fix the quota counter under a lock.
    const client = await pool.connect()

    try {
      await client.query("BEGIN")

      // Lock the org quota row to prevent concurrent slot acquisition
      await client.query(`SELECT id FROM org_quotas WHERE org_id = $1 FOR UPDATE`, [profile.org_id])

      await client.query(
        `DELETE FROM docker_sessions
         WHERE org_id = $1 AND status IN ('starting', 'running', 'idle')`,
        [profile.org_id]
      )

      // Reconcile counter to actual active sessions (not blind 0)
      await client.query(
        `UPDATE org_quotas
         SET active_docker_containers = (
           SELECT COUNT(*) FROM docker_sessions
           WHERE org_id = $1 AND status IN ('starting', 'running', 'idle')
         )
         WHERE org_id = $1`,
        [profile.org_id]
      )

      await client.query("COMMIT")

      return NextResponse.json({
        cleaned: sessions.length,
        message: `Freed ${sessions.length} stuck session(s).`,
        sessions: sessions.map((s: { id: string; container_name: string }) => ({ id: s.id, name: s.container_name })),
      })
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
