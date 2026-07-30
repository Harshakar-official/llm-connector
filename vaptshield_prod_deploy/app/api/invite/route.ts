import { NextRequest, NextResponse } from "next/server"
import { processInvitation } from "@/lib/utils/invite-internal"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"
import { validateOrigin } from "@/lib/utils/csrf"
import { z } from "zod"

export const dynamic = 'force-dynamic'

const inviteSchema = z.object({
  email: z.string().email("Invalid email format").max(255, "Email is too long"),
  role: z.enum(["admin", "program_manager", "security_engineer", "guest", "developer"]),
  department_id: z.string().uuid().optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    // ─── CSRF check ───
    const csrf = validateOrigin(req)
    if (!csrf.valid) return csrf.error

    // ─── Rate limit per IP ───
    const ip = req.headers.get("x-forwarded-for") || "anonymous"
    const rateResult = await slidingWindowRateLimit(`invite:${ip}`, 10, 3600)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 })
    }

    const body = await req.json()
    const validation = inviteSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues.map(i => i.message).join(", ") },
        { status: 400 }
      )
    }

    const invitation = await processInvitation({
      email: validation.data.email,
      role: validation.data.role,
      department_id: validation.data.department_id,
    })

    return NextResponse.json({ success: true, data: invitation })

  } catch (error: any) {
    console.error("Invite API Error:", error.message)
    return NextResponse.json(
      { error: "Invitation could not be processed" },
      { status: 400 }
    )
  }
}
