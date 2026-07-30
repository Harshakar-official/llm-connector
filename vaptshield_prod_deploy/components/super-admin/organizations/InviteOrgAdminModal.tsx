"use client"

import { useState } from "react"
import { Mail, Shield, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { inviteOrgAdminAction } from "@/lib/supabase/super-admin-actions"

/**
 * Z+ SECURITY: Email validation regex
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "")
}

function validateAndSanitizeEmail(input: string): string | null {
  const stripped = stripHtml(input).trim().toLowerCase()
  if (!stripped || stripped.length > 254) return null
  if (!EMAIL_REGEX.test(stripped)) return null
  return stripped
}

interface InviteOrgAdminModalProps {
  orgId: string
  orgName: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteOrgAdminModal({
  orgId,
  orgName,
  isOpen,
  onOpenChange,
}: InviteOrgAdminModalProps) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  const handleInvite = async () => {
    const sanitizedEmail = validateAndSanitizeEmail(email)
    if (!sanitizedEmail) {
      toast.error("Please enter a valid email address")
      return
    }

    setLoading(true)
    try {
      const result = await inviteOrgAdminAction({
          email: sanitizedEmail,
          orgId: orgId
      })

      if (!result.success) {
        throw new Error(result.error)
      }

      toast.success(`Invitation sent to ${sanitizedEmail}`)
      
      if (result.data?.token) {
        const link = `${window.location.origin}/invite/${result.data.token}`
        setInviteLink(link)
      } else {
          onOpenChange(false)
          setEmail("")
      }
    } catch (error: any) {
      console.error("Invite error:", error)
      toast.error(error.message || "Failed to send invitation")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-panel border-border text-fg">
        <DialogHeader>
          <DialogTitle>Invite Organization Admin</DialogTitle>
          <DialogDescription>
            Invite an administrator for <strong>{orgName}</strong>.
            They will have full control over their organization&apos;s security data.
          </DialogDescription>
        </DialogHeader>

      {inviteLink ? (
        <div className="space-y-4 py-8 text-center animate-in zoom-in-95 duration-300">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-success/10 mb-2">
            <Shield className="h-6 w-6 text-success" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-fg">Invitation Sent!</h3>
            <p className="text-sm text-fg-muted px-6">
              A secure invitation has been sent to <strong>{email}</strong>. 
              They can now join <strong>{orgName}</strong> using the link in their email.
            </p>
          </div>
          <Button className="w-full mt-4 font-bold" onClick={() => {
              onOpenChange(false)
              setInviteLink(null)
              setEmail("")
          }}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-bold uppercase text-fg-muted">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-bg border-border rounded-xl"
            />
          </div>
        </div>
      )}

        {!inviteLink && (
          <DialogFooter>
            <Button variant="outline" className="rounded-xl border-border" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={loading} className="rounded-xl font-bold">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Invitation
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
