"use client"
import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, ShieldCheck } from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

// ─── Validation Schema ───────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address").max(255, "Email is too long"),
  password: z.string().min(1, "Password is required").max(64, "Password cannot exceed 64 characters"),
})

type LoginFormData = z.infer<typeof loginSchema>

// ─── Rate Limiter State ─────────────────────────────────────
const RATE_LIMIT_KEY = "login_attempts"
const MAX_ATTEMPTS = 5
const RATE_WINDOW_MS = 60 * 1000 // 1 minute

function getRateLimitInfo(): { count: number; resetAt: number } {
  if (typeof window === "undefined") return { count: 0, resetAt: 0 }
  const stored = localStorage.getItem(RATE_LIMIT_KEY)
  if (!stored) return { count: 0, resetAt: 0 }
  const data = JSON.parse(stored) as { count: number; resetAt: number }
  if (Date.now() > data.resetAt) {
    localStorage.removeItem(RATE_LIMIT_KEY)
    return { count: 0, resetAt: 0 }
  }
  return data
}

function incrementRateLimit(): number {
  const current = getRateLimitInfo()
  const newCount = current.count + 1
  const resetAt =
    current.resetAt === 0 ? Date.now() + RATE_WINDOW_MS : current.resetAt
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({ count: newCount, resetAt }))
  return newCount
}

function clearRateLimit() {
  localStorage.removeItem(RATE_LIMIT_KEY)
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Validates that a redirect path is safe (internal only, no open redirect).
 * Uses robust URL parsing to prevent bypasses like protocol-relative URLs.
 */
function getSafeRedirect(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null

  // ── Layer 1: Basic Sanity ───────────────────────────────────
  // Must be a relative path starting with /
  // Explicitly block // (protocol-relative) and /\ (single slash followed by backslash)
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null

  try {
    // ── Layer 2: Origin Validation ─────────────────────────────
    // Resolve the URL against a dummy internal base
    const base = "https://vaptshield.internal"
    const url = new URL(raw, base)
    
    // If the resulting origin doesn't match our base, it's an external URL (bypass attempt)
    if (url.origin !== base) return null
    
    // ── Layer 3: Route Policy ──────────────────────────────────
    // Block redirect loops and internal API routes
    const path = url.pathname
    if (path.startsWith("/login") || path.startsWith("/api/")) return null
    
    return raw
  } catch {
    // If URL parsing fails, the input was malicious or malformed
    return null
  }
}

// ─── Component ──────────────────────────────────────────────
function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = getSafeRedirect(searchParams.get("redirect"))

  const [isLoading, setIsLoading] = useState(false)
  const [rateLimitError, setRateLimitError] = useState<string | null>(null)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState<string>("")
  const [inviteChecked, setInviteChecked] = useState(false)

  // Z+ SECURITY: Read invite token from HttpOnly cookie via API instead of URL query param.
  // This prevents token exposure in browser history, server logs, and referrer headers.
  useEffect(() => {
    async function checkInviteSession() {
      try {
        const res = await fetch('/api/invite/session')
        if (res.ok) {
          const data = await res.json()
          if (data.valid) {
            setInviteToken(data.token)
            setInviteEmail(data.email || "")
          }
        }
      } catch {
        // No invite session — normal login flow
      }
      setInviteChecked(true)
    }
    checkInviteSession()
  }, [])

  const {
    register,
    handleSubmit,
    setError,
    resetField,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Set email field when invite data loads
  useEffect(() => {
    if (inviteEmail) {
      resetField("email", { defaultValue: inviteEmail })
    }
  }, [inviteEmail, resetField])

  async function onSubmit(data: LoginFormData) {
    // ─── Rate Limit Check ───
    const rateInfo = getRateLimitInfo()
    if (rateInfo.count >= MAX_ATTEMPTS) {
      const remaining = Math.ceil((rateInfo.resetAt - Date.now()) / 1000)
      setRateLimitError(
        `Too many attempts. Try again in ${remaining} seconds.`
      )
      return
    }

    setIsLoading(true)
    setRateLimitError(null)

    try {
      const supabase = getBrowserClient()

      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        const newCount = incrementRateLimit()

        // ─── Server-Side Rate Limiting (Z+ Security) ───
        // Fire-and-forget: increment DB failed_login_attempts, lock if threshold reached
        import("@/lib/supabase/actions").then(({ incrementFailedLoginAttempts }) => {
          incrementFailedLoginAttempts(data.email)
        }).catch(() => {})

        if (newCount >= MAX_ATTEMPTS) {
          const resetIn = Math.ceil((Date.now() + RATE_WINDOW_MS - Date.now()) / 1000)
          setRateLimitError(
            `Too many failed attempts. Please wait ${resetIn} seconds.`
          )
        } else {
          setError("email", { message: error.message })
          toast.error("Login failed", {
            description: `${MAX_ATTEMPTS - newCount} attempts remaining.`,
          })
        }
        return
      }

      // Success
      clearRateLimit()

      // ─── Server-Side: Reset failed_login_attempts on successful login ───
      if (authData.user) {
        import("@/lib/supabase/actions").then(({ resetFailedLoginAttempts }) => {
          resetFailedLoginAttempts(authData.user.id)
        }).catch(() => {})
      }

      // ─── Handle Invitation if exists (Z+ Security) ───
      if (authData.user) {
        const { acceptInvitationAction } = await import("@/lib/supabase/actions")
        const inviteResult = await acceptInvitationAction(inviteToken || undefined)
        
        if (inviteResult.success) {
          // Z+ SECURITY: Clear the invite cookie after successful acceptance
          fetch('/api/invite/session', { method: 'DELETE' }).catch(() => {})
          toast.success("Joined organization successfully!")
          // Redirect to welcome/onboarding page
          router.push("/welcome")
          return
        } else if (inviteResult.error !== "No invitation token found") {
          toast.error("Invitation Error", { description: inviteResult.error })
        }
      }

      // Check if email needs verification
      if (authData.user && !authData.user.email_confirmed_at) {
        toast.info("Email verification required", {
          description: "Redirecting to verify your email...",
        })
        router.push(`/verify-otp?email=${encodeURIComponent(data.email)}`)
        return
      }

      // Check if profile is locked
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active, locked_until")
        .eq("id", authData.user.id)
        .single()

      if (profile?.locked_until && new Date(profile.locked_until) > new Date()) {
        await supabase.auth.signOut()
        setError("email", {
          message: "Account locked. Contact your admin.",
        })
        toast.error("Account locked")
        return
      }

      // Get user role for redirect
      const { data: profileWithRole } = await supabase
        .from("profiles")
        .select("role, org_id")
        .eq("id", authData.user.id)
        .single()

      // Determine redirect destination
      // Super admin always goes to platform dashboard (ignore redirect param)
      // Regular users: use redirectTo if safe, otherwise /dashboard
      let destination = "/dashboard"
      if (profileWithRole?.role === "super_admin") {
        destination = "/super-admin/dashboard"
      } else if (redirectTo) {
        destination = redirectTo
      }

      // Check if user is super_admin
      if (profileWithRole?.role === "super_admin") {
        toast.success("Welcome back!")
      } else if (profileWithRole?.org_id) {
        toast.success("Welcome back!")
      } else {
        toast.success("Welcome!")
      }
      router.push(destination)
    } catch (err: unknown) {
      console.error("Login error:", err)
      const error = err as { status?: number; code?: string; message?: string }

      // Handle session expiry gracefully
      if (error?.status === 401 || error?.code === "session_expired" || error?.message?.includes("expired")) {
        toast.error("Your session has expired. Please sign in again.")
        router.push("/login")
        return
      }

      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-panel border border-border rounded-md p-8 shadow-sm">
      {/* ─── Logo + Header ─── */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <span className="text-xl font-semibold tracking-tight text-fg">
            VAPT<span className="text-primary">Shield</span>
          </span>
        </div>
        <h2 className="text-lg font-semibold text-fg">
          {inviteToken ? "Sign in to accept invite" : "Sign in to your account"}
        </h2>
        <p className="text-sm text-fg-muted">
          {inviteToken ? "Welcome back! Please verify your identity." : "Manage your security posture"}
        </p>
      </div>

      {/* ─── Form ─── */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Rate limit error */}
        {rateLimitError && (
          <div className="bg-danger-bg border border-border rounded-md p-3">
            <p className="text-sm text-danger text-center font-medium">
              {rateLimitError}
            </p>
          </div>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-danger">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-fg-muted hover:text-primary transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-danger">{errors.password.message}</p>
          )}
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      {/* ─── Divider ─── */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-panel px-2 text-fg-subtle text-fg">or</span>
        </div>
      </div>

      {/* ─── Register Link ─── */}
      <p className="text-center text-sm text-fg-muted">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="text-primary hover:text-primary-hover font-medium transition-colors"
        >
          {inviteToken ? "Create new account" : "Request access"}
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="bg-panel border border-border rounded-md p-12 shadow-sm flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
