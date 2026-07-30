import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerClient } from "@/lib/supabase/server"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { logAudit } from "@/lib/utils/audit-server"

// ─── Z+ SECURITY: Rate Limiting ───
// Prevent abuse: max 3 forgot-password requests per IP per 60 seconds
let redisInstance: Redis | null = null
let ratelimitInstance: Ratelimit | null = null

const getRatelimit = () => {
  if (!ratelimitInstance) {
    if (!redisInstance) redisInstance = Redis.fromEnv()
    ratelimitInstance = new Ratelimit({
      redis: redisInstance,
      limiter: Ratelimit.slidingWindow(3, "60 s"),
      analytics: true,
    })
  }
  return ratelimitInstance
}

const forgotSchema = z.object({
  email: z.string().email("Valid email required").max(255, "Email is too long"),
})

export async function POST(req: NextRequest) {
  try {
    // ─── Rate Limit Check ───
    const ratelimit = getRatelimit()
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown"

    const { success: rateLimitOk } = await ratelimit.limit(`forgot_pw:${ip}`)
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a minute and try again." },
        { status: 429 }
      )
    }

    const body = await req.json()
    const { email } = forgotSchema.parse(body)

    const supabase = await getServerClient()

    // ── Layer 2: Database-backed Rate Limit (Audit Fix Medium #1) ──
    // Limit to 3 requests per email per 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count: recentAttempts } = await supabase
      .from("audit_log")
      .select("id", { count: 'exact', head: true })
      .eq("action", "auth.forgot_password")
      .gte("created_at", fifteenMinutesAgo)
      .contains("new_value", { email: email.toLowerCase().trim() })

    if (recentAttempts !== null && recentAttempts >= 3) {
      return NextResponse.json(
        { error: "Too many password reset attempts. Please try again in 15 minutes." },
        { status: 429 }
      )
    }

    // ── Layer 3: Audit Log and Process ──
    await logAudit({
        action: "auth.forgot_password",
        new_value: { email: email.toLowerCase().trim() }
    })

    // Z+ SECURITY: Determine the correct base URL dynamically
    const protocol = req.headers.get("x-forwarded-proto") || "http"
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000"
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

    // Send a password reset email using the standard client
    // This uses the Site URL and SMTP settings configured in Supabase Dashboard
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/auth/callback?next=/reset-password`,
    })

    if (error) {
      console.error("Reset password error:", error)
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists for this email, a reset link has been sent.",
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    return NextResponse.json(
      { error: (error as Error).message || "Failed to generate reset link" },
      { status: 500 }
    )
  }
}
