import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { logAudit } from "@/lib/utils/audit-server"
import { hasPermission } from "@/lib/utils/permissions"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const ip = req.headers.get("x-forwarded-for") || "anonymous"
    const rateResult = await slidingWindowRateLimit(`link-vuln:${ip}`, 30, 60)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    if (!hasPermission(profile.role, "findings:approve_scan")) {
      return NextResponse.json({ error: "Forbidden — insufficient permissions" }, { status: 403 })
    }

    const body = await req.json()
    if (!body.vulnId) {
      return NextResponse.json({ error: "vulnId is required" }, { status: 400 })
    }

    const pool = await getPool()

    const { rows: alert } = await pool.query(
      `SELECT id, org_id, status FROM pending_alerts WHERE id = $1 AND org_id = $2`,
      [id, profile.org_id]
    )

    if (alert.length === 0) {
      return NextResponse.json({ error: "Finding not found or access denied" }, { status: 404 })
    }

    if (alert[0].status === 'approved') {
      return NextResponse.json({ success: true, message: "Already approved" })
    }

    await pool.query(
      `UPDATE pending_alerts SET vuln_id = $1, status = 'approved', approved_at = NOW() WHERE id = $2 AND org_id = $3`,
      [body.vulnId, id, profile.org_id]
    )

    await logAudit({
      org_id: profile.org_id,
      actor_id: user.id,
      action: "kali_finding.approved",
      resource_type: "pending_alert",
      resource_id: id,
      new_value: { vuln_id: body.vulnId },
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("[link-vuln] Error:", e.message)
    return NextResponse.json({ error: "Failed to link vulnerability" }, { status: 500 })
  }
}
