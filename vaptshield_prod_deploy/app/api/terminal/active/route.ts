import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"

export async function GET(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Check for active Kali session belonging to this user
    const { data: sessions } = await supabase
      .from("docker_sessions")
      .select("id, container_id, ws_url, status, created_at")
      .eq("org_id", profile.org_id)
      .eq("user_id", user.id)
      .eq("container_type", "kali")
      .in("status", ["starting", "running", "idle"])
      .order("created_at", { ascending: false })
      .limit(1)

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ active: false, session: null })
    }

    const dockerHostUrl = process.env.DOCKER_HOST_API_URL || ""
    const internalIp = process.env.DOCKER_HOST_INTERNAL_IP || ""
    const session = sessions[0]
    return NextResponse.json({
      active: true,
      session: {
        sessionId: session.id,
        containerId: session.container_id,
        wsUrl: session.ws_url.startsWith('/tty/')
          ? (dockerHostUrl || "https://kali.secprima.in") + session.ws_url
          : internalIp
            ? session.ws_url.replace(/127\.0\.0\.1|localhost/gi, internalIp)
            : session.ws_url,
        status: session.status,
        createdAt: session.created_at,
      },
    })
  } catch {
    return NextResponse.json({ active: false, session: null })
  }
}
