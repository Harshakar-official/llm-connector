import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"

export const dynamic = 'force-dynamic'

/**
 * POST /api/presence/offline
 *
 * Fire-and-forget endpoint called via navigator.sendBeacon() on pagehide.
 * Sets the user's presence_status to "offline" so other users see them
 * as offline immediately after browser close / tab termination.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await supabase
      .from("profiles")
      .update({
        presence_status: "offline",
        last_seen: new Date().toISOString(),
      })
      .eq("id", user.id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false }, { status: 500 })
  }
}