import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { killContainer, getSessionByContainerId } from "@/lib/docker/manager"
import { logAudit } from "@/lib/utils/audit-server"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = await slidingWindowRateLimit(`terminal-stop:${user.id}`, 10, 60)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Max 10 stops per minute." }, { status: 429 })
    }

    const session = await getSessionByContainerId(id)
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    if (session.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()

    await killContainer(id, { id: user.id, org_id: profile?.org_id || "", role: profile?.role || "user" })

    await logAudit({
      action: "docker.killed",
      resource_type: "docker_session",
      resource_id: session.id,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
