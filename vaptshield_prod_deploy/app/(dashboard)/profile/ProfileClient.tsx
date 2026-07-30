"use client"
import { useState, useEffect, useActionState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, User } from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/lib/hooks/useAuth"
import { uploadAvatarAction } from "@/lib/supabase/avatar-actions"
import { ChangePasswordModal } from "@/components/profile/ChangePasswordModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

const profileSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
})

type ProfileFormData = z.infer<typeof profileSchema>

// ─── Client-Side Validation Constants ──────────────────────────
// These mirror the server-side constants in avatar-actions.ts
// for immediate UX feedback. The server ALWAYS re-validates.
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"]
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

export default function ProfilePage() {
  const router = useRouter()
  const { user, profile, loading: authLoading, refetch } = useAuth()
  const { theme, setTheme } = useTheme()
  const supabase = getBrowserClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState("")
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  // Server Action state for avatar upload
  const [avatarState, avatarFormAction, isPendingAvatar] = useActionState(uploadAvatarAction, null)

  // Sync avatarUrl with profile when profile loads
  useEffect(() => {
    if (profile?.avatar_url) {
      setAvatarUrl(profile.avatar_url)
    }
  }, [profile?.avatar_url])

  // Handle server action result
  useEffect(() => {
    if (avatarState?.success && avatarState.avatarUrl) {
      setAvatarUrl(avatarState.avatarUrl)
      refetch()
      // Broadcast to all useAuth instances (Topbar, Sidebar, etc.) so they
      // re-fetch the profile with the new avatar_url without a full page reload
      window.dispatchEvent(new CustomEvent("profile-updated"))
      toast.success("Avatar updated!")
      router.refresh()
      setUploadingAvatar(false)
    } else if (avatarState && !avatarState.success && avatarState.error) {
      toast.error(avatarState.error)
      setUploadingAvatar(false)
    }
  }, [avatarState, refetch, router])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name || "",
    },
  })

  // Reset form when profile data arrives
  useEffect(() => {
    if (profile) {
      reset({
        full_name: profile.full_name || "",
      })
    }
  }, [profile, reset])

  /**
   * Client-side pre-validation before submitting to server action.
   * Provides immediate UX feedback. The server action performs
   * its own independent validation (magic bytes, MIME type, size).
   */
  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]

    if (!file || !user) {
      return
    }

    // ── Client-side MIME type check ──────────────────────────
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPEG, and WebP images are allowed.")
      // Reset the input so the user can re-select
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    // ── Client-side size check ───────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 2MB.`)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    // ── Submit to server action ──────────────────────────────
    const formData = new FormData()
    formData.append("avatar", file)
    avatarFormAction(formData)
  }

  async function onSubmit(data: ProfileFormData) {
    if (!user) return
    setLoading(true)

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: data.full_name })
        .eq("id", user.id)

      if (error) throw error

      await supabase.auth.updateUser({ data: { full_name: data.full_name } })
      toast.success("Profile updated!")
      router.refresh()
    } catch (err) {
      console.error("Profile update error:", err)
      toast.error("Failed to update profile")
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-fg-muted">Please sign in to view your profile.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-fg-muted">Manage your personal information and preferences.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Avatar Section */}
        <div className="bg-panel border border-border rounded-md p-6">
          <h2 className="text-base font-semibold mb-4">Profile Photo</h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className={`h-20 w-20 rounded-full object-cover border-4 border-border transition-opacity ${isPendingAvatar ? 'opacity-50' : 'opacity-100'}`}
                />
              ) : (
                <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-fg text-2xl font-semibold border-4 border-primary/30 transition-opacity ${isPendingAvatar ? 'opacity-50' : 'opacity-100'}`}>
                  {profile.full_name?.charAt(0).toUpperCase() || "?"}
                </div>
              )}
              {isPendingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/20">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  id="avatar-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <Button 
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-border font-bold text-[10px] uppercase tracking-widest gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPendingAvatar}
                >
                  <User className="h-4 w-4" />
                  {avatarUrl ? "Change Photo" : "Upload Photo"}
                </Button>
                <p className="text-[10px] text-fg-muted font-medium">PNG, JPEG, WebP • Max 2MB</p>
              </div>
            </div>
          </div>
        </div>

        {/* Personal Info */}
        <div className="bg-panel border border-border rounded-md p-6 space-y-4">
          <h2 className="text-base font-semibold">Personal Information</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                {...register("full_name")}
                placeholder="Your full name"
              />
              {errors.full_name && (
                <p className="text-xs text-danger">{errors.full_name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile.email || user.email || ""}
                disabled
                className="opacity-60"
              />
              <p className="text-xs text-fg-muted">Email cannot be changed</p>
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Account Info */}
      <div className="bg-panel border border-border rounded-md p-6">
        <h2 className="text-base font-semibold mb-4">Account Details</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">Role</span>
            <span className="text-sm font-medium capitalize bg-primary-subtle text-primary px-2 py-0.5 rounded">
              {profile.role?.replace("_", " ") || "guest"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">Organization</span>
            <span className={cn(
                "text-sm font-mono text-fg",
                profile.role === 'super_admin' && "text-primary font-bold font-sans"
            )}>
              {profile.role === 'super_admin' ? "Platform Hub" : (profile.org_id || "—")}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">User ID</span>
            <span className="text-sm font-mono text-fg-muted">{user.id}</span>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-panel border border-border rounded-md p-6">
        <h2 className="text-base font-semibold mb-4">Preferences</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Theme</Label>
              <p className="text-xs text-fg-muted">Choose your preferred color theme</p>
            </div>
            <select
              className="h-9 rounded-md border border-border bg-bg px-3 text-sm focus:ring-2 focus:ring-primary outline-none"
              value={theme || "system"}
              onChange={async (e) => {
                const newTheme = e.target.value
                setTheme(newTheme)
                
                if (user) {
                  await supabase
                    .from("profiles")
                    .update({ theme_preference: newTheme })
                    .eq("id", user.id)
                }
                
                toast.success(`Theme updated to ${newTheme}`)
              }}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Notification Sound</Label>
              <p className="text-xs text-fg-muted">Play sound when new notifications arrive</p>
            </div>
            <button
              type="button"
              className={`relative h-6 w-11 rounded-full transition-colors ${
                profile?.notification_sound ? "bg-primary" : "bg-border"
              }`}
              onClick={async () => {
                const newValue = !profile?.notification_sound
                await supabase.from("profiles").update({ notification_sound: newValue }).eq("id", user.id)
                refetch()
                toast.success(newValue ? "Notification sound enabled" : "Notification sound disabled")
              }}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  profile?.notification_sound ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-panel border border-border rounded-md p-6">
        <h2 className="text-base font-semibold mb-4">Security</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Password</Label>
              <p className="text-xs text-fg-muted">Change your account password</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChangePasswordOpen(true)}
            >
              Change Password
            </Button>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />
    </div>
  )
}
