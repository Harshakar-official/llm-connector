import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/utils/permissions"
import { z } from "zod"

export const dynamic = "force-dynamic"

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
    }

    const { ids, reason } = parsed.data
    const rejectionReason = reason || "Rejected by analyst"

    const { error } = await supabase
      .from("scan_findings")
      .update({ status: "rejected", rejection_reason: rejectionReason })
      .in("id", ids)
      .eq("org_id", profile.org_id)

    if (error) throw error

    // Z+ FIX: Also handle pending_alerts for Kali Terminal
    await supabase
      .from("pending_alerts")
      .update({ status: "rejected" })
      .in("id", ids)
      .eq("org_id", profile.org_id)

    return NextResponse.json({ success: true, count: ids.length })
  } catch (e: any) {
    console.error("[scan-findings bulk-reject] Error:", e.message)
    return NextResponse.json({ error: "Failed to bulk reject findings" }, { status: 500 })
  }
}
