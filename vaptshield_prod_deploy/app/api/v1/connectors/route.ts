import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { sanitizeError } from "@/lib/utils/api-error"

export async function GET() {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    const { data: connectors, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ connectors })
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
