import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { generateConnectorKey } from "@/lib/utils/connector-auth"
import { sanitizeError } from "@/lib/utils/api-error"

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (profile.role !== "admin" && profile.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const name = body.name || `connector-${Date.now()}`
    const { raw, hash, prefix } = generateConnectorKey()

    const pool = getPool()
    await pool.query(
      `INSERT INTO connector_api_keys (org_id, name, key_hash, key_prefix, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [profile.org_id, name, hash, prefix, user.id]
    )

    return NextResponse.json({
      key: raw,
      prefix,
      name,
      warning: "Save this key — it will not be shown again.",
    })
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    const supabaseAdmin = await getServerClient()
    const { data: keys, error } = await supabaseAdmin
      .from("connector_api_keys")
      .select("id, name, key_prefix, created_at, revoked_at")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ keys })
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
