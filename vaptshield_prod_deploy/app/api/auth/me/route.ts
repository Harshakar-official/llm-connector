import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

export async function GET() {
  try {
    const supabase = await getServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = await slidingWindowRateLimit(`auth-me:${user.id}`, 30, 60)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, org_id, role, is_active, last_seen, presence_status, notification_sound, theme_preference, has_seen_onboarding, created_at, updated_at")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    return NextResponse.json({ profile })
  } catch (error: any) {
    console.error("[API_AUTH_ME]", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
