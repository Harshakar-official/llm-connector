import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { heartbeatContainer, getSessionByContainerId } from "@/lib/docker/manager"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = await slidingWindowRateLimit(`terminal-heartbeat:${user.id}`, 60, 60)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const session = await getSessionByContainerId(id)
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    if (session.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await heartbeatContainer(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e.message === "Session expired") {
      return NextResponse.json({ error: "Session expired" }, { status: 410 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
