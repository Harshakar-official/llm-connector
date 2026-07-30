import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).single()
    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const url = process.env.DOCKER_HOST_API_URL || ""
    if (!url) return NextResponse.json({ error: "Worker URL not configured" }, { status: 500 })

    const workerKey = process.env.DOCKER_HOST_API_KEY || ""
    const res = await fetch(`${url}/health`, {
      headers: workerKey ? { Authorization: `Bearer ${workerKey}` } : {},
    })
    const text = await res.text()
    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      body: text
    })
  } catch (e: any) {
    return NextResponse.json({ error: "Health check failed" })
  }
}
