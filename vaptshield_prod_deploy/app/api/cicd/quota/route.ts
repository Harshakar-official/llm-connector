import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 400 })

    const pool = getPool()

    // Clean stale sessions before returning count
    await pool.query(
      `UPDATE docker_sessions SET status = 'stopped'
       WHERE org_id = $1 AND status IN ('starting', 'running', 'idle')
         AND (last_heartbeat < NOW() - INTERVAL '90 seconds' OR max_lifetime_at < NOW())`,
      [profile.org_id]
    )
    await pool.query(
      `UPDATE org_quotas SET active_docker_containers = (
        SELECT COUNT(*) FROM docker_sessions
        WHERE org_id = $1 AND status IN ('starting', 'running', 'idle')
      ) WHERE org_id = $1`,
      [profile.org_id]
    )

    const { rows } = await pool.query(
      `SELECT ci_scans_today, max_ci_scans_per_day, ci_scans_reset_at, plan_tier,
              active_docker_containers, max_docker_containers, paid_extra_docker,
              (ci_scans_reset_at::date < CURRENT_DATE) as needs_reset
       FROM org_quotas WHERE org_id = $1`,
      [profile.org_id]
    )

    if (rows.length === 0) {
      return NextResponse.json({ ci_scans_today: 0, max_ci_scans_per_day: 0, plan_tier: "free", ci_scans_reset_at: null, active_docker_containers: 0, max_docker_containers: 1, paid_extra_docker: 0 })
    }

    const { ci_scans_today, max_ci_scans_per_day, ci_scans_reset_at, plan_tier, needs_reset, active_docker_containers, max_docker_containers, paid_extra_docker } = rows[0]
    const effectiveToday = needs_reset ? 0 : Number(ci_scans_today)

    return NextResponse.json({
      ci_scans_today: effectiveToday,
      max_ci_scans_per_day: Number(max_ci_scans_per_day),
      plan_tier: plan_tier || "free",
      ci_scans_reset_at: ci_scans_reset_at,
      active_docker_containers: Number(active_docker_containers) || 0,
      max_docker_containers: Number(max_docker_containers) || 1,
      paid_extra_docker: Number(paid_extra_docker) || 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch quota" }, { status: 500 })
  }
}