import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/utils/permissions"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!hasPermission(profile.role, "findings:approve_scan")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params

    const { error } = await supabase
      .from("scan_findings")
      .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", profile.org_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to approve finding" }, { status: 500 })
  }
}
