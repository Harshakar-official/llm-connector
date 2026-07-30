import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { hasPermission } from "@/lib/utils/permissions"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    if (!hasPermission(profile.role, "findings:approve_scan")) {
      return NextResponse.json({ error: "Forbidden — insufficient permissions to reject findings" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = body.reason || "Rejected by analyst"

    const { data: updated, error } = await supabase
      .from("scan_findings")
      .update({ status: "rejected", rejection_reason: reason })
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .select("id")

    if (error) throw error

    // Fallback: kali/zap findings live in pending_alerts, not scan_findings
    // (note: the column there is rejected_reason, not rejection_reason)
    if (!updated || updated.length === 0) {
      const pool = getPool()
      const { rowCount } = await pool.query(
        `UPDATE pending_alerts
         SET status = 'rejected', rejected_reason = $1
         WHERE id = $2 AND org_id = $3 AND status = 'pending'`,
        [reason, id, profile.org_id]
      )
      if (!rowCount) {
        return NextResponse.json({ error: "Finding not found" }, { status: 404 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("[scan-findings reject] Error:", e.message)
    return NextResponse.json({ error: "Failed to reject finding" }, { status: 500 })
  }
}