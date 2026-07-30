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
    if (!hasPermission(profile.role, "findings:edit_own") && !hasPermission(profile.role, "findings:edit_any")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const { patch } = body

    if (!patch) {
      return NextResponse.json({ error: "No patch provided" }, { status: 400 })
    }

    const { data: finding, error: fetchError } = await supabase
      .from("scan_findings")
      .select("ai_normalized")
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .single()

    if (fetchError) throw fetchError

    const currentAiNormalized = finding.ai_normalized || {}
    const updatedAiNormalized = {
      ...currentAiNormalized,
      ai_patch: patch
    }

    const { error: updateError } = await supabase
      .from("scan_findings")
      .update({ ai_normalized: updatedAiNormalized })
      .eq("id", id)
      .eq("org_id", profile.org_id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to save AI patch" }, { status: 500 })
  }
}
