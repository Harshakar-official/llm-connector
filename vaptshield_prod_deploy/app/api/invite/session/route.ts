import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = 'force-dynamic'

/**
 * Z+ SECURITY: Invite Token Session via HttpOnly Cookie
 *
 * This route uses a standard anon client. RLS policies 'invitations_public_read'
 * and 'orgs_public_names_read' are configured to allow 'anon' role to select
 * these records (filtered by token). This bypasses the corrupted service role 
 * key (supabaseAdmin) which fails on Vercel.
 */

const COOKIE_NAME = "invite_token"
const COOKIE_MAX_AGE = 5 * 60 // 5 minutes

interface InviteWithOrg {
  email: string
  org_id: string
  role: string
  token: string
  accepted_at: string | null
  expires_at: string | null
  organizations: { name: string } | null
}

/**
 * POST — Validate token and set HttpOnly cookie.
 * Called from the invite landing page before navigating to login/register.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = body.token as string | undefined

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      )
    }

    // Use regular client with anon key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Validate the token (same logic as validate endpoint)
    const { data: invite, error } = await supabase
      .from("invitations")
      .select("email, org_id, role, token, accepted_at, expires_at, organizations(name)")
      .eq("token", token)
      .single()

    if (error || !invite) {
      return NextResponse.json(
        { error: "Invalid or expired invitation link" },
        { status: 404 }
      )
    }

    const typedInvite = invite as unknown as InviteWithOrg

    if (typedInvite.accepted_at) {
      return NextResponse.json(
        { error: "This invitation has already been used" },
        { status: 410 }
      )
    }

    if (typedInvite.expires_at && new Date(typedInvite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 410 }
      )
    }

    // Set HttpOnly cookie with the token
    const response = NextResponse.json({
      success: true,
      email: typedInvite.email,
      orgName: typedInvite.organizations?.name || "Unknown Organization",
      role: typedInvite.role,
    })

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    })

    return response
  } catch (err) {
    console.error("Invite session POST error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET — Read the cookie and return invite metadata.
 * Called from login/register/verify-otp pages to get invite info without URL params.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value

    if (!token) {
      return NextResponse.json(
        { valid: false, error: "No invitation session found" },
        { status: 200 } // 200 so client can distinguish "no cookie" from "server error"
      )
    }

    // Use regular client with anon key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: invite, error } = await supabase
      .from("invitations")
      .select("email, org_id, role, token, accepted_at, expires_at, organizations(name)")
      .eq("token", token)
      .single()

    if (error || !invite) {
      // Token in cookie is invalid — clear it
      const response = NextResponse.json(
        { valid: false, error: "Invitation no longer valid" },
        { status: 200 }
      )
      response.cookies.delete(COOKIE_NAME)
      return response
    }

    const typedInvite = invite as unknown as InviteWithOrg

    if (typedInvite.accepted_at) {
      const response = NextResponse.json(
        { valid: false, error: "This invitation has already been used" },
        { status: 200 }
      )
      response.cookies.delete(COOKIE_NAME)
      return response
    }

    if (typedInvite.expires_at && new Date(typedInvite.expires_at) < new Date()) {
      const response = NextResponse.json(
        { valid: false, error: "This invitation has expired" },
        { status: 200 }
      )
      response.cookies.delete(COOKIE_NAME)
      return response
    }

    return NextResponse.json({
      valid: true,
      token: typedInvite.token,
      email: typedInvite.email,
      orgId: typedInvite.org_id,
      orgName: typedInvite.organizations?.name || "Unknown Organization",
      role: typedInvite.role,
    })
  } catch (err) {
    console.error("Invite session GET error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * DELETE — Clear the invite cookie after successful acceptance.
 * Called after acceptInvitationAction completes successfully.
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete(COOKIE_NAME)
  return response
}