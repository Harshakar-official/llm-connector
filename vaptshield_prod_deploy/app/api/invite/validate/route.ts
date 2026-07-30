import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = 'force-dynamic'

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
 * Z+ SECURITY: Public Invitation Validation
 *
 * This route uses a standard anon client. RLS policies 'invitations_public_read'
 * and 'orgs_public_names_read' are configured to allow 'anon' role to select
 * these records (filtered by token). This bypasses the corrupted service role 
 * key (supabaseAdmin) which fails on Vercel.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")

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

    const { data: invite, error } = await supabase
      .rpc('validate_invitation_token', { p_token: token })
      .single()

    if (error || !invite) {
      console.error("Invite validation DB error:", error)
      return NextResponse.json(
        { error: "Invalid or expired invitation link" },
        { status: 404 }
      )
    }

    const typedInvite = invite as any
    const orgName = typedInvite.org_name

    // Check if already accepted
    if (typedInvite.accepted_at) {
      return NextResponse.json(
        { error: "This invitation has already been used", email: typedInvite.email, orgName },
        { status: 410 }
      )
    }

    // Check if expired
    if (typedInvite.expires_at && new Date(typedInvite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired", email: typedInvite.email, orgName },
        { status: 410 }
      )
    }

    return NextResponse.json({
      valid: true,
      email: typedInvite.email,
      orgId: typedInvite.org_id,
      orgName: orgName || "Unknown Organization",
      role: typedInvite.role,
    })
  } catch (err) {
    console.error("Invite validation error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}