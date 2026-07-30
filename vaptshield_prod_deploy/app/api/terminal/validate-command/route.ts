import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"
import { validateCommand } from "@/lib/config/tool-allowlist"
import { logAudit } from "@/lib/utils/audit-server"

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = await slidingWindowRateLimit(`terminal-validate:${user.id}`, 120, 60)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const { command } = body
    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "command is required" }, { status: 400 })
    }

    const result = validateCommand(command)

    // Log the command to audit trail
    const sessionId = body.session_id || "unknown"
    if (result.valid) {
      await logAudit({
        action: "terminal.command",
        resource_type: "docker_sessions",
        resource_id: sessionId,
        new_value: { command: result.command },
      }).catch(() => {})
    } else {
      await logAudit({
        action: "terminal.command_blocked",
        resource_type: "docker_sessions",
        resource_id: sessionId,
        new_value: { command, error: result.error },
      }).catch(() => {})
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
