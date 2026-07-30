import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { spawnKaliContainer } from "@/lib/docker/manager"
import { logAudit } from "@/lib/utils/audit-server"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = await slidingWindowRateLimit(`terminal-start:${user.id}`, 3, 60)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role, full_name").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const { project_id } = body
    if (!project_id) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 })
    }

    const result = await spawnKaliContainer(user.id, profile.org_id, project_id, profile.role)
    if (!result.success) {
      return NextResponse.json({
        error: result.error,
      }, { status: 409 })
    }

    await logAudit({
      action: "docker.spawned",
      resource_type: "docker_session",
      resource_id: result.sessionId,
      new_value: { container_id: result.containerId, type: "kali", project_id },
    })

    // The worker now returns a relative proxy path like `/tty/32783`.
    // We prepend the Cloudflare Tunnel URL so the browser routes the iframe traffic securely over the internet.
    const dockerHostUrl = process.env.DOCKER_HOST_API_URL || ""
    const internalIp = process.env.DOCKER_HOST_INTERNAL_IP || ""
    if (result.wsUrl) {
      if (result.wsUrl.startsWith('/tty/')) {
        result.wsUrl = (dockerHostUrl || "https://kali.secprima.in") + result.wsUrl;
      } else if (internalIp) {
        result.wsUrl = result.wsUrl.replace(/127\.0\.0\.1|localhost/gi, internalIp)
      }
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
