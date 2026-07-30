"use client"
import { Suspense, useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

const passwordSchema = z
  .string()
  .min(12, "Minimum 12 characters")
  .max(64, "Password cannot exceed 64 characters")
  .regex(/[A-Z]/, "Must contain uppercase letter")
  .regex(/[0-9]/, "Must contain number")
  .regex(/[^A-Za-z0-9]/, "Must contain special character")

const resetSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type ResetFormData = z.infer<typeof resetSchema>

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    async function verifyToken() {
      // 1. Try to get tokens from search params (manual bypass or custom link)
      let accessToken = searchParams.get("access_token")
      let refreshToken = searchParams.get("refresh_token") || ""
      let type = searchParams.get("type")

      // 2. If not in search params, try to get from hash (Supabase default redirect)
      if (!accessToken && typeof window !== "undefined" && window.location.hash) {
        console.log("Detecting token in URL hash...")
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        accessToken = params.get("access_token")
        refreshToken = params.get("refresh_token") || ""
        type = type || params.get("type") || "recovery"
      }

      if (!accessToken) {
        console.log("No access token found in URL or hash")
        setIsValidToken(false)
        return
      }

      setToken(accessToken)
      const supabase = getBrowserClient()

      console.log("Verifying session with Supabase...")
      // Try to set session with the token
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError || !sessionData.session) {
        console.error("Supabase session error:", sessionError)
        setIsValidToken(false)
        return
      }

      console.log("Session verified successfully for:", sessionData.session.user.email)
      // Token is valid
      setIsValidToken(true)
    }

    verifyToken()
  }, [searchParams])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  })

  async function onSubmit(data: ResetFormData) {
    if (!token) {
      toast.error("Invalid reset link")
      return
    }

    setIsLoading(true)
    try {
      const supabase = getBrowserClient()

      // Already have a valid session from the verification
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (error) {
        toast.error("Reset failed", { description: error.message })
        return
      }

      // ─── Clear failed_login_attempts and unlock account ───
      // After a successful password reset, the user should not remain locked
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        import("@/lib/supabase/actions").then(({ resetFailedLoginAttempts }) => {
          resetFailedLoginAttempts(user.id)
        }).catch(() => {})
      }

      setDone(true)
      toast.success("Password updated!")
    } catch (err) {
      console.error("Reset password error:", err)
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  if (isValidToken === null) {
    return (
      <div className="bg-panel border border-border rounded-md p-8 shadow-sm text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-sm text-fg-muted">Verifying reset link...</p>
      </div>
    )
  }

  if (isValidToken === false) {
    return (
      <div className="bg-panel border border-border rounded-md p-8 shadow-sm text-center">
        <AlertCircle className="h-12 w-12 text-danger mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">Invalid or Expired Link</h2>
        <p className="text-sm text-fg-muted mb-6">
          This password reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password">
          <Button>Request New Reset Link</Button>
        </Link>
        <p className="text-sm text-fg-muted mt-4">
          <Link href="/login" className="text-primary hover:text-primary-hover">
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="bg-panel border border-border rounded-md p-8 shadow-sm text-center">
        <div className="flex justify-center mb-4">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Password Updated!</h2>
        <p className="text-sm text-fg-muted mb-6">
          Your password has been changed successfully.
        </p>
        <Button onClick={() => router.push("/login")} className="w-full">
          Sign in with new password
        </Button>
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
        <h2 className="text-lg font-semibold">Create new password</h2>
        <p className="text-sm text-fg-muted mt-1">
          Must meet all password requirements below
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-danger">{errors.password.message}</p>
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

        <div className="bg-bg-muted border border-border rounded-md p-3 space-y-1">
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span>At least 12 characters</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span>One uppercase letter (A-Z)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span>One number (0-9)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span>One special character (!@#$%)</span>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            "Update password"
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-fg-muted mt-6">
        <Link href="/login" className="text-primary hover:text-primary-hover">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="bg-panel border border-border rounded-md p-8 shadow-sm text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-sm text-fg-muted">Loading...</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
