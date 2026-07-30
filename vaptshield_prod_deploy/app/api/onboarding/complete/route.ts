import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"

/**
 * POST /api/onboarding/complete
 * Marks the current user's onboarding as seen.
 * Requires authenticated user session.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the user via server client (respects RLS)
    const supabase = await getServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // 2. Use standard client to update the profile
    // The RLS policy "profiles_update_self" allows users to update their own profile.
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ has_seen_onboarding: true })
      .eq("id", user.id)

    if (updateError) {
      console.error("Failed to mark onboarding as seen:", updateError)
      return NextResponse.json(
        { error: "Failed to update onboarding status" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Onboarding complete API error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}