"use client"
import { Suspense, useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, ShieldCheck, UserPlus, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"

interface InviteState {
  email: string
  orgId: string
  orgName: string
  role: string
  valid: boolean
  error?: string
}

function InvitePageContent() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [inviteData, setInviteData] = useState<InviteState | null>(null)

  useEffect(() => {
    async function validate() {
      try {
        // Use server-side API route to bypass RLS (unauthenticated users
        // cannot read invitations directly due to org_id = my_org_id() policy)
        const response = await fetch(`/api/invite/validate?token=${encodeURIComponent(token)}`)
        const json = await response.json()

        if (!response.ok || !json.valid) {
          setInviteData({
            email: json.email || "",
            orgId: "",
            orgName: json.orgName || "",
            role: "",
            valid: false,
            error: json.error || "Invalid or expired invitation link.",
          })
          setLoading(false)
          return
        }

        setInviteData({
          email: json.email,
          orgId: json.orgId,
          orgName: json.orgName || "Unknown Org",
          role: json.role,
          valid: true,
        })
      } catch (err) {
        console.error("Invite validation error:", err)
        setInviteData({
          email: "",
          orgId: "",
          orgName: "",
          role: "",
          valid: false,
          error: "Failed to validate invitation. Please try again.",
        })
      }
      setLoading(false)
    }
    validate()
  }, [token])

  async function handleAction(type: 'signup' | 'login') {
    if (!inviteData) return
    
    // Z+ SECURITY: Store invite token in HttpOnly cookie instead of URL query param.
    // This prevents token exposure in browser history, server logs, and referrer headers.
    try {
      await fetch('/api/invite/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
    } catch (err) {
      console.error('Failed to set invite session cookie:', err)
    }
    
    if (type === 'signup') {
      router.push('/register')
    } else {
      router.push('/login')
    }
  }

  if (loading) {
    return (
      <div className="bg-panel border border-border rounded-md p-12 shadow-sm flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-fg-muted font-medium">Validating invitation...</p>
      </div>
    )
  }

  if (!inviteData?.valid) {
    return (
      <div className="bg-panel border border-border rounded-md p-8 shadow-sm text-center">
        <div className="h-12 w-12 rounded-full bg-danger-bg flex items-center justify-center mx-auto mb-4">
             <XCircle className="h-6 w-6 text-danger" />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-fg">Link Invalid</h2>
        <p className="text-sm text-fg-muted mb-6">
          {inviteData?.error || "This invitation link is no longer valid."}
        </p>
        <Link href="/login">
            <Button variant="outline" className="w-full">Back to Login</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-panel border border-border rounded-md p-8 shadow-sm max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold tracking-tight text-fg">
            VAPT<span className="text-primary">Shield</span>
          </span>
        </div>
        <h2 className="text-2xl font-bold text-fg">You&apos;re invited!</h2>
        <p className="text-sm text-fg-muted mt-2">
          Join <span className="font-semibold text-fg">{inviteData.orgName}</span> on the platform.
        </p>
      </div>

      <div className="bg-bg-subtle border border-border rounded-lg p-5 mb-8 space-y-4">
          <div className="flex justify-between items-center">
              <span className="text-fg-muted text-xs uppercase font-bold">Role</span>
              <span className="font-semibold text-primary capitalize bg-primary-subtle px-3 py-1 rounded text-xs border border-primary/20">
                {inviteData.role.replace("_", " ")}
              </span>
          </div>
          <div className="flex justify-between items-center border-t border-border pt-4">
              <span className="text-fg-muted text-xs uppercase font-bold">Invited Email</span>
              <span className="font-mono text-fg text-xs truncate ml-4">{inviteData.email}</span>
          </div>
      </div>

      <div className="space-y-3">
        <Button
            onClick={() => handleAction('signup')}
            className="w-full h-11 text-base font-medium bg-primary hover:bg-primary-hover"
        >
            <UserPlus className="mr-2 h-5 w-5" /> Create New Account
        </Button>
        
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-panel px-2 text-fg-subtle">Already have an account?</span></div>
        </div>

        <Button
            variant="outline"
            onClick={() => handleAction('login')}
            className="w-full h-11 text-base font-medium border-border hover:bg-panel-hover"
        >
            <LogIn className="mr-2 h-5 w-5" /> Sign In to Accept
        </Button>
      </div>

      <p className="text-center text-[11px] text-fg-subtle mt-8 italic px-4">
        By accepting, you agree to join the organization and will be able to perform security scans according to your role.
      </p>
    </div>
  )
}

function XCircle({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
    )
}

export default function InvitePage() {
    return (
        <Suspense fallback={
            <div className="bg-panel border border-border rounded-md p-12 shadow-sm flex flex-col items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <InvitePageContent />
        </Suspense>
    )
}
