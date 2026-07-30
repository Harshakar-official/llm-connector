import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"

const WORKER_URL = process.env.AI_SECURITY_WORKER_URL || ""
const WORKER_KEY = process.env.DOCKER_HOST_API_KEY || ""

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    const { id } = await params
    const res = await fetch(`${WORKER_URL}/scan/status/${id}`, {
      headers: { Authorization: `Bearer ${WORKER_KEY}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return NextResponse.json({ error: "Scan not found" }, { status: 404 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }) }
}
