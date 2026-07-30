"use client"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Loader2, ShieldCheck, CheckCircle2, Sparkles } from "lucide-react"
import { OtpInput } from "@/components/auth/OtpInput"
import { getBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useSounds } from "@/lib/hooks/useSounds"

const RESEND_COOLDOWN = 60 // seconds

function VerifyOtpContent() {
  const router = useRouter()
  const { playSound } = useSounds()
  const searchParams = useSearchParams()

  // Z+ Security: Get email from URL param with fallback to sessionStorage
  // This handles cases where user opens link in new tab or after refresh
  let email = searchParams.get("email") || ""

  // Fallback: If no email in URL, try sessionStorage (set during registration)
  if (!email && typeof window !== "undefined") {
    email = sessionStorage.getItem("pending_verification_email") || ""
  }

  // If still no email, redirect back to register
  useEffect(() => {
    if (!email && typeof window !== "undefined") {
      router.push("/register?error=email_required")
    }
  }, [email, router])

  const [otp, setOtp] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN)
  const [canResend, setCanResend] = useState(false)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
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
          }
        }
      } catch {
        // No invite session — normal verification flow
      }
      setInviteChecked(true)
    }
    checkInviteSession()
  }, [])

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true)
      return
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  async function handleOtpComplete(enteredOtp: string) {
    setOtp(enteredOtp)
    setIsLoading(true)
    setError(false)

    try {
      const supabase = getBrowserClient()

      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: enteredOtp,
        type: "email",
      })

      if (verifyError) {
        setError(true)
        setIsLoading(false)
        toast.error("Invalid code", {
          description: "Please check your email and try again.",
        })
        return
      }

      // ─── Handle Invitation (Z+ Security) ───
      let wasInviteAccepted = false
      if (verifyData.user) {
        const { acceptInvitationAction } = await import("@/lib/supabase/actions")
        // Always attempt to accept; backend will read cookie directly to avoid client-side race conditions
        const inviteResult = await acceptInvitationAction(inviteToken || undefined)
        
        if (inviteResult.success) {
          wasInviteAccepted = true
          // Z+ SECURITY: Clear the invite cookie after successful acceptance
          fetch('/api/invite/session', { method: 'DELETE' }).catch(() => {})
          playSound('success')
          toast.success("Welcome Aboard!", {
            description: "Successfully joined the organization.",
            icon: <Sparkles className="h-4 w-4 text-primary" />,
            duration: 6000,
          })
        } else if (inviteResult.error !== "No invitation token found") {
          toast.error("Invitation Error", { description: inviteResult.error })
        }
      }

      // Success!
      setSuccess(true)
      if (!wasInviteAccepted) {
          playSound('success')
          toast.success("Email verified!", { description: "Redirecting..." })
      }

      // Redirect after animation — go to welcome page if invite was accepted
      setTimeout(() => {
        if (wasInviteAccepted) {
          router.push("/welcome")
        } else {
          router.push("/dashboard")
        }
      }, 1500)
    } catch (err) {
      console.error("OTP verify error:", err)
      setError(true)
      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleResend() {
    if (!canResend) return

    setIsLoading(true)
    try {
      const supabase = getBrowserClient()
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      })

      if (resendError) {
        toast.error("Failed to resend", { description: resendError.message })
        return
      }

      toast.success("Verification code sent!")
      setCountdown(RESEND_COOLDOWN)
      setCanResend(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Mask email for display
  function maskEmail(e: string) {
    if (!e) return ""
    const [local, domain] = e.split("@")
    if (local.length <= 2) return `${local[0]}***@${domain}`
    return `${local.slice(0, 2)}${"*".repeat(Math.min(local.length - 2, 4))}@${domain}`
  }

  if (success) {
    return (
      <div className="bg-panel border border-border rounded-md p-8 shadow-sm text-center">
        <div className="flex justify-center mb-4">
          <CheckCircle2 className="h-12 w-12 text-success animate-[scale-in_0.3s_ease-out]" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Email Verified!</h2>
        <p className="text-sm text-fg-muted">Redirecting to dashboard...</p>
        <style>{`
          @keyframes scale-in {
            from { transform: scale(0); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="bg-panel border border-border rounded-md p-8 shadow-sm">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <span className="text-xl font-semibold tracking-tight">
            VAPT<span className="text-primary">Shield</span>
          </span>
        </div>
        <h2 className="text-lg font-semibold">Verify your email</h2>
        <p className="text-sm text-fg-muted mt-1">
          Enter the 6-digit code sent to
        </p>
        <p className="text-sm font-mono text-fg-muted mt-0.5">
          {maskEmail(email)}
        </p>
      </div>

      <div className="mb-6">
        <OtpInput
          onComplete={handleOtpComplete}
          disabled={isLoading}
          error={error}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-danger-bg border border-border rounded-md">
          <p className="text-sm text-danger text-center">
            Invalid code. Please check your email and try again.
          </p>
        </div>
      )}

      {isLoading && otp && !error && !success && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-fg-muted">Verifying...</span>
        </div>
      )}

      <div className="text-center">
        {canResend ? (
          <button
            onClick={handleResend}
            disabled={isLoading}
            className="text-sm text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
          >
            Resend verification code
          </button>
        ) : (
          <p className="text-xs text-fg-muted">
            Resend in{" "}
            <span className="font-mono text-primary">{countdown}s</span>
          </p>
        )}
      </div>

      <p className="text-center text-sm text-fg-muted mt-4">
        <a
          href="/login"
          className="text-primary hover:text-primary-hover transition-colors"
        >
          Use a different email
        </a>
      </p>
    </div>
  )
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-panel border border-border rounded-md p-8 shadow-sm flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  )
}
