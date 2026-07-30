import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { sanitizeError } from "@/lib/utils/api-error"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    const { data: connector, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .single()

    if (error) return NextResponse.json({ error: "Connector not found" }, { status: 404 })

    const { data: jobs } = await supabase
      .from("connector_jobs")
      .select("*")
      .eq("connector_id", connector.connector_id)
      .order("created_at", { ascending: false })
      .limit(50)

    return NextResponse.json({ connector, jobs })
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const pool = getPool()
    await pool.query(
      `DELETE FROM connectors WHERE id = $1 AND org_id = $2`,
      [id, profile.org_id]
    )

    return NextResponse.json({ status: "deleted" })
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
