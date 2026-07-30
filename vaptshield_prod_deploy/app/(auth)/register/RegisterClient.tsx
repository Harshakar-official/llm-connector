"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, ShieldCheck, Check, X } from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

// ─── Password Schema (per Section 16 of CLAUDE.md) ─────────
const passwordSchema = z
  .string()
  .min(12, "Minimum 12 characters")
  .max(64, "Password cannot exceed 64 characters")
  .regex(/[A-Z]/, "Must contain uppercase letter")
  .regex(/[0-9]/, "Must contain number")
  .regex(/[^A-Za-z0-9]/, "Must contain special character")

const registerSchema = z
  .object({
    fullName: z.string().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
    email: z.string().email("Please enter a valid email address").max(255, "Email is too long"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type RegisterFormData = z.infer<typeof registerSchema>

// ─── Password Strength Checker ────────────────────────────────
function getPasswordStrength(password: string): {
  score: number
  label: string
  color: string
} {
  let score = 0
  if (password.length >= 12) score++
  if (password.length >= 16) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2)
    return { score, label: "Weak", color: "bg-danger" }
  if (score <= 4)
    return { score, label: "Fair", color: "bg-warning" }
  if (score <= 5)
    return { score, label: "Good", color: "bg-primary" }
  return { score, label: "Strong", color: "bg-success" }
}

// ─── Component ──────────────────────────────────────────────
function RegisterPageContent({ registrationEnabled }: { registrationEnabled: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [isLoading, setIsLoading] = useState(false)
  const [passwordValue, setPasswordValue] = useState("")
  const [serverError, setServerError] = useState<string | null>(null)
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
        // No invite session — normal registration flow
      }
      setInviteChecked(true)
    }
    checkInviteSession()
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    resetField,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: inviteEmail || "",
    }
  })

  // Pre-fill email field when invite session data loads
  useEffect(() => {
    if (inviteEmail) {
      resetField("email", { defaultValue: inviteEmail })
    }
  }, [inviteEmail, resetField])

  const strength = getPasswordStrength(passwordValue)
  const watchedPassword = watch("password", "")

  useEffect(() => {
    if (!inviteChecked) return
    
    if (!registrationEnabled && !inviteToken) {
        toast.error("Public registration is currently disabled.")
    }
  }, [registrationEnabled, inviteToken, inviteChecked])

  if (inviteChecked && !registrationEnabled && !inviteToken) {
      return (
          <div className="bg-panel border border-border rounded-md p-12 shadow-sm text-center space-y-6 animate-in zoom-in-95 duration-500">
              <div className="h-16 w-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <ShieldCheck className="h-8 w-8 text-warning" />
              </div>
              <div>
                  <h2 className="text-xl font-bold text-fg">Registration Restricted</h2>
                  <p className="text-sm text-fg-muted mt-2 max-w-xs mx-auto font-medium">
                      Self-registration is currently closed by the platform administrator. 
                      An organization invite is required to join.
                  </p>
              </div>
              <Link href="/login" className="block w-full">
                  <Button variant="outline" className="w-full mt-4 rounded-xl font-bold border-border shadow-sm">
                      Return to Secure Login
                  </Button>
              </Link>
          </div>
      )
  }

  async function onSubmit(data: RegisterFormData) {
    setIsLoading(true)
    setServerError(null)

    try {
      const supabase = getBrowserClient()

      // 1. Sign up the user
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
          },
        },
      })

      if (error) {
        setServerError(error.message)
        toast.error("Registration failed", { description: error.message })
        return
      }

      if (authData.user) {
        toast.success("Account created!", {
          description: "Check your email for the verification code.",
        })

        // Z+ Security: Store email in sessionStorage as backup for verify-otp
        if (typeof window !== "undefined") {
          sessionStorage.setItem("pending_verification_email", data.email)
        }

        // Navigate to verify-otp — invite token is already in HttpOnly cookie,
        // so verify-otp page will read it from the cookie API directly.
        const verifyUrl = new URL("/verify-otp", window.location.origin)
        verifyUrl.searchParams.set("email", data.email)

        router.push(verifyUrl.pathname + verifyUrl.search)
      }
    } catch (err) {
      console.error("Register error:", err)
      setServerError("Something went wrong. Please try again.")
      toast.error("Error")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-panel border border-border rounded-md p-8 shadow-sm">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <span className="text-xl font-semibold tracking-tight text-fg">
            VAPT<span className="text-primary">Shield</span>
          </span>
        </div>
        <h2 className="text-lg font-semibold">
          {inviteToken ? "Complete your registration" : "Create your account"}
        </h2>
        <p className="text-sm text-fg-muted">
          {inviteToken ? "Join your organization to start scanning" : "Sign up for VAPTShield platform"}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div className="bg-danger-bg border border-border rounded-md p-3">
            <p className="text-sm text-danger text-center">{serverError}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Priya Sharma"
            autoComplete="name"
            {...register("fullName")}
          />
          {errors.fullName && (
            <p className="text-xs text-danger">{errors.fullName.message}</p>
          )}
        </div>

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

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("password")}
            onChange={(e) => {
              register("password").onChange(e)
              setPasswordValue(e.target.value)
            }}
          />
          {errors.password && (
            <p className="text-xs text-danger">{errors.password.message}</p>
          )}

          {watchedPassword && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <div
                    key={level}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      strength.score >= level ? strength.color : "bg-border"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs ${
                    strength.label === "Weak"
                      ? "text-danger"
                      : strength.label === "Strong"
                        ? "text-success"
                        : "text-warning"
                  }`}
                >
                  {strength.label}
                </span>
                <span className="text-xs text-fg-subtle">
                  12+ chars · uppercase · number · special
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-danger">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {watchedPassword && (
          <div className="bg-bg-muted border border-border rounded-md p-3 space-y-1">
            <p className="text-xs text-fg-muted mb-2">Requirements:</p>
            {[
              { label: "At least 12 characters", check: watchedPassword.length >= 12 },
              { label: "Uppercase letter", check: /[A-Z]/.test(watchedPassword) },
              { label: "Number", check: /[0-9]/.test(watchedPassword) },
              { label: "Special character", check: /[^A-Za-z0-9]/.test(watchedPassword) },
            ].map((req, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {req.check ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <X className="h-3 w-3 text-fg-disabled" />
                )}
                <span className={req.check ? "text-success" : "text-fg-muted"}>
                  {req.label}
                </span>
              </div>
            ))}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-panel px-2 text-fg-subtle text-fg">or</span>
        </div>
      </div>

      <p className="text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-primary hover:text-primary-hover font-medium transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
export default RegisterPageContent
