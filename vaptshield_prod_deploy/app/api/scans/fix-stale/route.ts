import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/utils/permissions"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    if (!hasPermission(profile.role, "scanners:view_history")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data, error, count } = await supabase
      .from("scan_history")
      .update({ status: "failed", error_message: "Marked as failed: scan timed out (stale)" })
      .eq("status", "running")
      .eq("org_id", profile.org_id)
      .lt("started_at", staleThreshold)
      .select("id")

    if (error) throw error

    return NextResponse.json({ fixed: count ?? (data?.length ?? 0) })
  } catch (e: any) {
    console.error("[scans/fix-stale] Error:", e.message)
    return NextResponse.json({ error: "Failed to fix stale scans" }, { status: 500 })
  }
}