"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { toast } from "sonner"

import { type Role } from "@/lib/supabase/types"

const inviteSchema = z.object({
  email: z.string().email("Invalid email address").max(255, "Email is too long"),
  role: z.enum(["admin", "program_manager", "security_engineer", "guest", "developer"]),
})

type FormValues = z.infer<typeof inviteSchema>

interface InviteUserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  userRole: string
}

export function InviteUserModal({ open, onOpenChange, onSuccess, userRole }: InviteUserModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "developer",
    },
  })

  async function onSubmit(data: FormValues) {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        toast.success("Invitation sent successfully")
        onOpenChange(false)
        form.reset()
        onSuccess?.()
      } else {
        // Fallback for demo/dev env where SMTP might be off
        if (result.token) {
           toast.success("Invite created. See console for token.")
           console.log("INVITE TOKEN URL:", `${window.location.origin}/invite/${result.token}`)
           onOpenChange(false)
           form.reset()
           onSuccess?.()
        } else {
           setError(result.error || "Failed to send invitation")
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // ─── RBAC Logic ───
  const isSuperAdmin = userRole === 'super_admin'
  const isAdmin = userRole === 'admin'
  const isProgramManager = userRole === 'program_manager'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-panel border-border">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Send an invitation to join your organization
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase text-fg-muted">Email Address</FormLabel>
                  <FormControl>
                    <Input placeholder="user@example.com" className="bg-bg border-border" {...field} />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase text-fg-muted">Assigned Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-bg border-border">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      </FormControl>
                    <SelectContent className="bg-panel border-border">
                      {isSuperAdmin && <SelectItem value="admin">Admin</SelectItem>}
                      {(isSuperAdmin || isAdmin) && <SelectItem value="program_manager">Program Manager</SelectItem>}
                      <SelectItem value="security_engineer">Security Engineer</SelectItem>
                      <SelectItem value="developer">Developer</SelectItem>
                      <SelectItem value="guest">Guest</SelectItem>
                    </SelectContent>
                  </Select>
                  {isProgramManager && (
                      <p className="text-[10px] text-fg-subtle mt-1">
                          As Program Manager, you can only invite Security Engineers, Developers, and Guests.
                      </p>
                  )}
                  {!isSuperAdmin && !isProgramManager && (
                      <p className="text-[10px] text-fg-subtle mt-1">
                          Only Super Admins can invite additional Organization Administrators.
                      </p>
                  )}                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            {error && (
              <div className="text-xs font-medium text-danger bg-danger/5 border border-danger/10 p-3 rounded-md animate-in fade-in zoom-in-95 duration-200">
                {error}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="gap-2 font-bold">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Send Invitation
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
