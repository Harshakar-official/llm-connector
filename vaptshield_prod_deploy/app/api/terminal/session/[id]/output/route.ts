import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"
import { sanitizeError } from "@/lib/utils/api-error"

import { signWorkerToken } from "@/lib/docker/manager"

const WORKER_URL = process.env.DOCKER_HOST_API_URL || ""

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = await slidingWindowRateLimit(`terminal-output:${user.id}`, 30, 60)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded. Max 30 output fetches per minute." }, { status: 429 })
    }

    const { data: session } = await supabase
      .from("docker_sessions")
      .select("id, container_id, user_id, status, org_id")
      .eq("id", id)
      .single()

    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    if (session.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!WORKER_URL) {
      return NextResponse.json({ error: "Worker not configured" }, { status: 500 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const jwtToken = await signWorkerToken(user.id, session.org_id, profile?.role || "user", id)

    const workerRes = await fetch(`${WORKER_URL}/session-output/${id}`, {
      headers: { Authorization: `Bearer ${jwtToken}` },
    })

    const data = await workerRes.json()

    if (!workerRes.ok) {
      return NextResponse.json({ error: data.error || "Worker error" }, { status: workerRes.status })
    }

    return NextResponse.json({ output: data.output || "" })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
