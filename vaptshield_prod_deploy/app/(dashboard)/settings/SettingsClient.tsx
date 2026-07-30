"use client"

import { useState, useActionState, useEffect, useRef } from "react"
import { 
    Shield, 
    Bell, 
    UserCircle, 
    Key, 
    Activity,
    Eye,
    EyeOff,
    CheckCircle2,
    Loader2,
    Save
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { changePasswordAction } from "@/lib/supabase/password-actions"
import { updateNotificationPrefsAction, updateProfileAction } from "@/lib/supabase/profile-actions"
import { uploadAvatarAction } from "@/lib/supabase/avatar-actions"

interface Props {
    profile: {
        id: string
        full_name: string | null
        email: string
        avatar_url: string | null
        role: string
        notification_preferences?: any
    }
}

export function SettingsClient({ profile }: Props) {
    const [state, formAction, isPendingPassword] = useActionState(changePasswordAction, null)
    const [avatarState, avatarAction, isPendingAvatar] = useActionState(uploadAvatarAction, null)
    
    const [showPassword, setShowPassword] = useState(false)
    const [fullName, setFullName] = useState(profile.full_name || "")
    const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "")
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
    const avatarInputRef = useRef<HTMLInputElement>(null)
    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append("avatar", file)
        avatarAction(formData)
    }

    const [prefs, setPrefs] = useState<Record<string, boolean>>(profile.notification_preferences || {
        critical_alerts: true,
        report_success: true,
        discussion_mentions: true,
        marketing: false
    })
    const [isUpdatingNotifs, setIsUpdatingNotifs] = useState<string | null>(null)

    const handleToggleNotif = async (key: string) => {
        const next = { ...prefs, [key]: !prefs[key] }
        setPrefs(next)
        setIsUpdatingNotifs(key)
        
        const result = await updateNotificationPrefsAction(next)
        if (result.success) {
            toast.success("Notification protocols updated.")
        } else {
            toast.error(result.error)
            setPrefs(prefs) // rollback
        }
        setIsUpdatingNotifs(null)
    }

    const handleProfileUpdate = async () => {
        if (fullName === profile.full_name) return
        setIsUpdatingProfile(true)
        const result = await updateProfileAction({ full_name: fullName })
        if (result.success) {
            toast.success("Public identity updated.")
            window.dispatchEvent(new CustomEvent("profile-updated"))
        } else {
            toast.error(result.error)
        }
        setIsUpdatingProfile(false)
    }

    useEffect(() => {
        if (state?.success) {
            toast.success("Security protocol updated: Password changed.")
            const form = document.getElementById("settings-password-form") as HTMLFormElement
            form?.reset()
        } else if (state && !state.success && state.error) {
            toast.error(state.error)
        }
    }, [state])

    useEffect(() => {
        if (avatarState?.success && avatarState.avatarUrl) {
            toast.success("Identity visual updated: Avatar changed.")
            // Backend now appends ?v=timestamp to the URL in the database to solve caching globally
            setAvatarUrl(avatarState.avatarUrl)
            window.dispatchEvent(new CustomEvent("profile-updated"))
        } else if (avatarState && !avatarState.success) {
            toast.error(avatarState.error || "Avatar upload failed.")
        }
    }, [avatarState])

    return (
        <div className="max-w-[1000px] mx-auto space-y-8 animate-in fade-in duration-700 pb-20">
            <div>
                <h1 className="text-3xl font-black tracking-tighter text-fg uppercase italic leading-none">Account <span className="text-primary">Settings</span></h1>
                <p className="text-sm text-fg-muted font-medium mt-1">Manage your identity, security protocols, and preferences.</p>
            </div>

            <Tabs defaultValue="profile" className="w-full">
                <TabsList className="bg-panel border border-border">
                    <TabsTrigger value="profile" className="gap-2">
                        <UserCircle className="h-4 w-4" /> Profile
                    </TabsTrigger>
                    <TabsTrigger value="security" className="gap-2">
                        <Shield className="h-4 w-4" /> Security
                    </TabsTrigger>
                    <TabsTrigger value="notifications" className="gap-2">
                        <Bell className="h-4 w-4" /> Notifications
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="pt-6 space-y-6">
                    <Card className="bg-panel border-border overflow-hidden">
                        <CardHeader className="border-b border-border/50 bg-bg-subtle/30">
                            <CardTitle>Personal Information</CardTitle>
                            <CardDescription>Update your public identity on the platform.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8">
                            <div className="flex flex-col md:flex-row gap-12">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="relative group">
                                        <Avatar className={`h-24 w-24 border-4 border-primary/10 transition-opacity ${isPendingAvatar ? 'opacity-50' : 'opacity-100'}`}>
                                            <AvatarImage src={avatarUrl || ""} />
                                            <AvatarFallback className="text-2xl font-black bg-bg-subtle text-primary">
                                                {profile.full_name?.charAt(0).toUpperCase() || "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        {isPendingAvatar && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                            </div>
                                        )}
                                    </div>
                                    <input 
                                        type="file" 
                                        ref={avatarInputRef} 
                                        className="hidden" 
                                        accept="image/png,image/jpeg,image/webp"
                                        onChange={handleAvatarChange}
                                    />
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="rounded-xl border-border text-[10px] font-black uppercase tracking-widest"
                                        onClick={() => avatarInputRef.current?.click()}
                                        disabled={isPendingAvatar}
                                    >
                                        Change Avatar
                                    </Button>
                                </div>
                                <div className="flex-1 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold uppercase text-fg-muted">Full Name</Label>
                                            <Input 
                                                value={fullName} 
                                                onChange={(e) => setFullName(e.target.value)}
                                                className="bg-bg border-border rounded-xl" 
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold uppercase text-fg-muted">Email Address</Label>
                                            <Input value={profile.email} disabled className="bg-bg-subtle border-border rounded-xl opacity-60 font-mono" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-bold uppercase text-fg-muted">Access Role</Label>
                                            <div className="h-10 px-4 flex items-center bg-primary/5 border border-primary/10 rounded-xl text-primary font-black text-[10px] uppercase tracking-widest">
                                                {profile.role.replace('_', ' ')}
                                            </div>
                                        </div>
                                    </div>
                                    <Button 
                                        onClick={handleProfileUpdate}
                                        disabled={isUpdatingProfile || fullName === profile.full_name}
                                        className="rounded-xl font-bold uppercase text-[10px] tracking-widest px-8"
                                    >
                                        {isUpdatingProfile ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Save className="h-3 w-3 mr-2" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="security" className="pt-6 space-y-6">
                    <Card className="bg-panel border-border overflow-hidden">
                        <CardHeader className="border-b border-border/50 bg-bg-subtle/30">
                            <CardTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5 text-warning" /> Update Password
                            </CardTitle>
                            <CardDescription>Ensure your account remains bulletproof with a strong password.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8">
                            <form 
                                id="settings-password-form"
                                action={formAction} 
                                className="max-w-md space-y-4"
                            >
                                <div className="space-y-1.5">
                                    <Label htmlFor="currentPassword">Current Password</Label>
                                    <Input 
                                        id="currentPassword"
                                        name="currentPassword"
                                        type="password" 
                                        placeholder="Enter current password"
                                        className="bg-bg border-border rounded-xl" 
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="newPassword">New Password</Label>
                                    <div className="relative">
                                        <Input 
                                            id="newPassword"
                                            name="newPassword"
                                            type={showPassword ? "text" : "password"} 
                                            placeholder="Enter new password"
                                            className="bg-bg border-border rounded-xl pr-10" 
                                            required
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-disabled hover:text-fg"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                    <Input 
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        type={showPassword ? "text" : "password"} 
                                        placeholder="Repeat new password"
                                        className="bg-bg border-border rounded-xl" 
                                        required
                                    />
                                </div>
                                <Button type="submit" disabled={isPendingPassword} className="w-full rounded-xl font-black uppercase text-xs tracking-widest gap-2">
                                    {isPendingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                    Deploy New Password
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="notifications" className="pt-6 space-y-6">
                    <Card className="bg-panel border-border">
                        <CardHeader>
                            <CardTitle>Communication Preferences</CardTitle>
                            <CardDescription>Control how and when you receive security alerts.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {[
                                { id: "critical_alerts", title: "Critical Finding Alerts", desc: "Receive immediate notifications for Critical/High findings." },
                                { id: "report_success", title: "Report Generation Success", desc: "Get notified when a new VAPT report is ready for download." },
                                { id: "discussion_mentions", title: "Team Discussion Mentions", desc: "Notification when someone mentions you in a finding discussion." },
                                { id: "marketing", title: "Marketing & News", desc: "Periodic updates about new scanners and features." }
                            ].map((item) => (
                                <div key={item.id} className="flex items-center justify-between py-4 border-b border-border/30 last:border-0">
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-bold text-fg">{item.title}</p>
                                        <p className="text-xs text-fg-muted">{item.desc}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isUpdatingNotifs === item.id && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                                        <Switch 
                                            checked={prefs[item.id] || false}
                                            onCheckedChange={() => handleToggleNotif(item.id)}
                                            disabled={isUpdatingNotifs !== null}
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
