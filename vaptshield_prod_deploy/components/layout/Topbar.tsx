"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import { DateRangePickerWrapper } from "@/components/shared/DateRangePickerWrapper"
import { Bell, Search, ChevronRight, User, LogOut, CheckCheck, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { useAuth } from "@/lib/hooks/useAuth"
import { getBrowserClient } from "@/lib/supabase/client"
import { useNotifications } from "@/lib/hooks/useNotifications"
import { markAllAsRead, markAsRead } from "@/lib/supabase/notification-actions"
import { formatRelativeTime, cn } from "@/lib/utils"
import { createAuditLog } from "@/lib/utils/audit"
import { toast } from "sonner"

function buildBreadcrumbs(pathname: string, role?: string) {
  const segments = pathname.split("/").filter(Boolean)
  
  if (segments.length === 0) {
    return [{ 
        label: role === 'super_admin' ? "Platform" : "Overview", 
        href: role === 'super_admin' ? "/super-admin/dashboard" : "/dashboard" 
    }]
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  return segments.map((segment, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/")
    
    // Z+ UX: Hide raw UUIDs from breadcrumbs
    let label = segment
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
    
    if (uuidRegex.test(segment)) {
        // If it's a UUID, it's likely a Project or Finding ID.
        // For now, we show a generic "Details" or similar, 
        // as the actual name requires a DB fetch.
        label = "Details"
    }

    return { label, href }
  })
}

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, organization, loading } = useAuth()
  const { notifications, unreadCount } = useNotifications()
  const breadcrumbs = buildBreadcrumbs(pathname, profile?.role)

  // Z+ Security: Show loading skeleton while auth is being verified
  // This prevents flash of "User" text before profile loads
  if (loading) {
    return (
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-bg/80 px-6 backdrop-blur">
        <nav className="flex items-center gap-1 text-sm">
          <div className="h-4 w-20 bg-bg-muted animate-pulse rounded" />
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <div className="h-9 w-64 bg-bg-muted animate-pulse rounded-md" />
          <div className="h-9 w-9 bg-bg-muted animate-pulse rounded-full" />
        </div>
      </header>
    )
  }

  // Get user initials
  const userInitials = profile?.full_name
    ? profile.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : profile?.email?.slice(0, 2).toUpperCase() || "ME"

  const displayName = profile?.full_name || profile?.email || "User"
  const roleLabel = profile?.role?.replace("_", " ") || "User"
  
  // Z+ UX: Super Admins are platform-level, no 'Unknown Organization' text
  const isSuperAdmin = profile?.role === 'super_admin'
  const orgName = isSuperAdmin ? "Platform Management" : (organization?.name || "Unknown Organization")

  async function handleLogout() {
    // Z+ Security: Audit log the logout event before signing out
    try {
      await createAuditLog({ action: "auth.logout" })
    } catch {
      // Audit failure should not block logout
    }
    const supabase = getBrowserClient()
    await supabase.auth.signOut()
    localStorage.removeItem("vaptshield-terminal-store")
    window.location.href = "/login"
  }

  const handleMarkAllRead = async () => {
      const result = await markAllAsRead()
      if (result.success) {
          toast.success("All notifications marked as read")
      }
  }

  const handleNotifClick = async (id: string, link: string | null) => {
      await markAsRead(id)
      if (link) {
          router.push(link)
      }
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-bg/80 px-6 backdrop-blur">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-fg-subtle" />}
            {i === breadcrumbs.length - 1 ? (
              <span className="font-medium text-fg">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="text-fg-muted hover:text-fg transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Enterprise Display: Organization Badge for non-admins to know their context */}
      {profile?.role !== 'admin' && profile?.role !== 'super_admin' && (
          <div className="hidden md:flex items-center px-2.5 py-1 rounded-md bg-primary/5 border border-primary/20 mr-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary truncate max-w-[150px]">
                  {orgName}
              </span>
          </div>
      )}

      {/* Date range - Only visible on Dashboard and Analytics */}
      {(pathname === "/dashboard" || pathname === "/analytics") && (
          <DateRangePickerWrapper />
      )}

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-severity-critical animate-pulse" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-0 bg-panel border-border shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-subtle/50">
                <h3 className="text-sm font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-[10px] uppercase font-bold text-primary hover:text-primary-hover"
                        onClick={handleMarkAllRead}
                    >
                        <CheckCheck className="h-3 w-3 mr-1" /> Mark all read
                    </Button>
                )}
            </div>
            <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
                {notifications.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-fg-muted">
                        <Inbox className="h-8 w-8 mb-2 opacity-20" />
                        <p className="text-xs">No notifications yet</p>
                    </div>
                ) : (
                    notifications.map((n) => (
                        <DropdownMenuItem 
                            key={n.id} 
                            className={cn(
                                "flex flex-col items-start gap-1 p-4 cursor-pointer focus:bg-panel-hover border-b border-border/50 last:border-0",
                                !n.is_read && "bg-primary/5"
                            )}
                            onClick={() => handleNotifClick(n.id, n.link || null)}
                        >
                            <div className="flex items-center justify-between w-full">
                                <span className={cn("text-xs font-bold uppercase tracking-tight", !n.is_read ? "text-primary" : "text-fg-muted")}>
                                    {n.title}
                                </span>
                                <span className="text-[10px] text-fg-subtle font-mono">
                                    {formatRelativeTime(n.created_at)}
                                </span>
                            </div>
                            <p className="text-xs text-fg-muted line-clamp-2 leading-relaxed">
                                {n.message}
                            </p>
                        </DropdownMenuItem>
                    ))
                )}
            </div>
            <DropdownMenuSeparator className="m-0 bg-border" />
            {profile?.role !== "super_admin" && (
                <div className="p-2 bg-bg-subtle/50">
                    <Button 
                        variant="ghost" 
                        className="w-full h-8 text-xs text-fg-muted hover:text-fg font-medium"
                        onClick={() => router.push("/notifications")}
                    >
                        View all notifications
                    </Button>
                </div>
            )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme */}
      <ThemeToggle />

      {/* Avatar with Dropdown - PROFILE LINK IN TOP NAV */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 w-9 p-0 rounded-full hover:bg-panel-hover overflow-hidden border border-border">
            <Avatar className="h-full w-full">
              <AvatarImage src={profile?.avatar_url || undefined} className="object-cover" />
              <AvatarFallback className="bg-primary text-primary-fg text-xs font-semibold">
                {loading ? "..." : userInitials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-panel border-border shadow-lg">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-fg-muted font-mono uppercase tracking-tighter capitalize">{roleLabel}</span>
                <span className="text-[10px] text-fg-disabled">•</span>
                <span className="text-[10px] text-primary font-bold uppercase tracking-tight truncate">{orgName}</span>
            </div>
          </div>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem asChild>
            <Link href="/profile" className="cursor-pointer gap-2">
              <User className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem onClick={handleLogout} className="text-danger cursor-pointer gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
