import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 })

    const rl = await slidingWindowRateLimit(`audit:${user.id}`, 100, 60)
    if (!rl.success) return NextResponse.json({ error: "Rate limit" }, { status: 429 })

    const { command, sessionId } = await req.json()
    if (!command || !sessionId) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

    await logAudit({
      action: "kali.command_executed",
      resource_type: "docker_sessions",
      resource_id: sessionId,
      new_value: { command: command.slice(0, 1000) },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 })
  }
}
