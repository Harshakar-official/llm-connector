import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { cleanupOrphanedContainers, fixStaleRunningScans } from "@/lib/docker/manager"

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || process.env.VERIFICATION_TOKEN || ""

/**
 * GET /api/presence/cleanup
 *
 * Cron-invoked endpoint that marks stale presence as "offline".
 *
 * Protected by `x-cron-secret` header matching CRON_SECRET env var.
 * See vercel.json for cron schedule (every 2 minutes).
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace("Bearer ", "")
    if (CRON_SECRET && authHeader !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: "Admin client unavailable" }, { status: 500 })
    }

    const STALE_THRESHOLD_MS = 2 * 60 * 1000
    const staleBefore = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString()

    const { data, error } = await admin
      .from("profiles")
      .update({
        presence_status: "offline",
        last_seen: new Date().toISOString(),
      })
      .neq("presence_status", "offline")
      .lt("last_seen", staleBefore)
      .select("id")

    if (error) {
      console.error("[presence/cleanup] Failed to update stale presence:", error)
      return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
    }

    const count = data?.length ?? 0
    if (count > 0) {
      console.log(`[presence/cleanup] Marked ${count} stale user(s) as offline`)
    }

    // Clean up orphaned Docker containers and stale running scans.
    // cleanupOrphanedContainers calls each worker's /cleanup-orphans and kills
    // sessions with stale heartbeats / exceeded max lifetime.
    // fixStaleRunningScans marks scans stuck in 'running' for >30min as failed
    // and kills their containers via the worker. Both are best-effort and
    // isolated so a failure in one doesn't affect the rest of the cron.
    let containersCleaned = 0
    let scansFixed = 0
    try {
      containersCleaned = await cleanupOrphanedContainers()
      if (containersCleaned > 0) {
        console.log(`[presence/cleanup] Cleaned ${containersCleaned} orphaned container(s)`)
      }
    } catch (err) {
      console.error("[presence/cleanup] Container cleanup failed:", err)
    }
    try {
      scansFixed = await fixStaleRunningScans()
      if (scansFixed > 0) {
        console.log(`[presence/cleanup] Fixed ${scansFixed} stale scan(s)`)
      }
    } catch (err) {
      console.error("[presence/cleanup] Stale scan cleanup failed:", err)
    }

    return NextResponse.json({ success: true, cleaned: count, containersCleaned, scansFixed })
  } catch (err) {
    console.error("[presence/cleanup] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}