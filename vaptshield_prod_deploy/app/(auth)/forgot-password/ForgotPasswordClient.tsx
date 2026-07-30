"use client"
import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, ShieldCheck, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

const forgotSchema = z.object({
  email: z.string().email("Please enter a valid email address").max(255, "Email is too long"),
})

type ForgotFormData = z.infer<typeof forgotSchema>

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [resetLink, setResetLink] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
  })

  async function onSubmit(data: ForgotFormData) {
    setIsLoading(true)
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      })

      const json = await response.json()

      if (!response.ok || json.error) {
        toast.error("Failed to send reset email", { description: json.error })
        return
      }

      setSent(true)

      // In dev mode, show reset link for testing
      if (json.resetLink) {
        setResetLink(json.resetLink)
        toast.success("Reset link generated for testing!")
      } else {
        toast.success("Reset email sent!", {
          description: `Check ${data.email} for the reset link.`,
        })
      }
    } catch (err) {
      console.error("Forgot password error:", err)
      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (sent && resetLink) {
    return (
      <div className="bg-panel border border-border rounded-md p-8 shadow-sm">
        <div className="flex justify-center mb-4">
          <Mail className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-lg font-semibold mb-2 text-center">Reset Link (Testing Mode)</h2>
        <p className="text-sm text-fg-muted mb-4 text-center">
          Click the link below to reset your password:
        </p>
        <div className="bg-bg-muted p-3 rounded-md mb-4 break-all">
          <a href={resetLink} className="text-primary text-sm hover:underline">
            {resetLink}
          </a>
        </div>
        <p className="text-center text-sm text-fg-muted">
          <Link href="/login" className="text-primary hover:text-primary-hover">
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="bg-panel border border-border rounded-md p-8 shadow-sm text-center">
        <div className="flex justify-center mb-4">
          <Mail className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Check your email</h2>
        <p className="text-sm text-fg-muted">
          We sent a password reset link. It expires in 1 hour.
        </p>
        <p className="text-sm text-fg-muted mt-4">
          <Link href="/login" className="text-primary hover:text-primary-hover">
            Back to sign in
          </Link>
        </p>
      </div>
    )
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
        <h2 className="text-lg font-semibold">Forgot password?</h2>
        <p className="text-sm text-fg-muted mt-1">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-danger">{errors.email.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-fg-muted mt-6">
        Remember your password?{" "}
        <Link
          href="/login"
          className="text-primary hover:text-primary-hover transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
