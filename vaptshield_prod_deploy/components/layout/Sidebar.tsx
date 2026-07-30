"use client"

import { useState, ComponentType } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/hooks/useAuth"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Home,
  Building,
  Users,
  BarChart3,
  Bell,
  Settings,
  ShieldAlert,
  Terminal,
  History,
  FolderKanban,
  ListTodo,
  FileText,
  Radar,
  GitBranch,
  Sparkles,
  Building2,
  FileSearch,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  Shield,
  Cpu,
} from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

interface NavSection {
  label: string
  items: NavItem[]
}

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { profile, loading } = useAuth()

  // Z+ UX: Prevent flash of wrong navigation items while auth is loading
  if (loading) {
    return (
      <aside className={cn(
        "bg-panel border-r border-border h-screen flex flex-col transition-all duration-300 sticky top-0 z-40 shadow-sm",
        isCollapsed ? "w-16" : "w-64"
      )}>
        <div className="p-4 border-b border-border flex items-center justify-center h-14">
            <div className="h-8 w-8 rounded-lg bg-bg-muted animate-pulse" />
        </div>
        <div className="flex-1 p-3 space-y-6">
            {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                    <div className="h-2 w-12 bg-bg-muted animate-pulse ml-3 rounded" />
                    <div className="space-y-1">
                        {[1, 2].map(j => (
                            <div key={j} className="h-9 w-full bg-bg-muted animate-pulse rounded-lg" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
      </aside>
    )
  }

  const navSections: NavSection[] = []

  // --- SUPER ADMIN NAVIGATION (ISOLATED HUB) ---
  if (profile?.role === "super_admin") {
    navSections.push({
      label: "Platform Management",
      items: [
        { label: "Dashboard", href: "/super-admin/dashboard", icon: Home },
        { label: "Organizations", href: "/super-admin/organizations", icon: Building2 },
        { label: "Users", href: "/super-admin/users", icon: Users },
        { label: "Platform Analytics", href: "/super-admin/analytics", icon: BarChart3 },
        { label: "Connectors", href: "/connector", icon: Cpu },
      ],
    })

    navSections.push({
      label: "Account",
      items: [
        { label: "Settings", href: "/super-admin/settings", icon: Settings },
      ],
    })
  } else {
    // --- REGULAR ORGANIZATION NAVIGATION ---
    navSections.push({
      label: "Platform",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: Home },
        { label: "Analytics", href: "/analytics", icon: BarChart3 },
        { label: "Notifications", href: "/notifications", icon: Bell },
      ],
    })

    navSections.push({
      label: "Security",
      items: [
        { label: "Projects", href: "/projects", icon: FolderKanban },
        { label: "Findings", href: "/findings", icon: ShieldAlert },
        { label: "Tracker", href: "/tracker", icon: ListTodo },
        { label: "Reports", href: "/reports", icon: FileText },
      ],
    })

    // Add role-based items
    if (profile?.role === "admin") {
      navSections.push({
        label: "Administration",
        items: [
          { label: "Organization", href: "/organization", icon: Building },
          { label: "User Management", href: "/users", icon: Users },
          { label: "Audit Logs", href: "/audit", icon: History },
        ],
      })
    } else if (profile?.role === "program_manager") {
      navSections.push({
          label: "Management",
          items: [
            { label: "Team Members", href: "/users", icon: Users },
          ],
        })
    }

    // Account items for regular users
    navSections.push({
      label: "Account",
      items: [
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    })

    if (profile?.role === "admin" || profile?.role === "security_engineer") {
      navSections.push({
        label: "Scanners",
        items: [
          { label: "Kali Terminal", href: "/scanner/terminal", icon: Terminal },
          { label: "ZAP Proxy", href: "/scanner/zap", icon: Radar },
          { label: "CI/CD Pipeline", href: "/scanner/cicd", icon: GitBranch },
          { label: "AI Security", href: "/scanner/ai-security", icon: Shield },
          { label: "Scan History", href: "/scanner/history", icon: History },
          { label: "LLM Connector", href: "/connector", icon: Cpu },
        ],
      })
    }
  }

  return (
    <aside
      className={cn(
        "bg-panel border-r border-border h-screen flex flex-col transition-all duration-300 sticky top-0 z-40 shadow-sm",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between overflow-hidden bg-panel">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="font-black text-lg tracking-tighter text-fg uppercase italic">
              VAPT<span className="text-primary">Shield</span>
            </span>
          </div>
        )}
        {isCollapsed && (
            <div className="mx-auto h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <ShieldCheck className="h-5 w-5 text-white" />
            </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 hover:bg-bg-subtle rounded-md text-fg-muted transition-colors ml-2"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-none">
        {navSections.map((section) => (
          <NavSectionGroup
            key={section.label}
            section={section}
            currentPath={pathname}
            isCollapsed={isCollapsed}
          />
        ))}
      </nav>

      {/* Footer / User Profile Brief */}
      {!isCollapsed && profile && (
          <div className="p-4 border-t border-border bg-bg-subtle/50">
              <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 border border-border">
                      <AvatarImage src={profile.avatar_url || ""} />
                      <AvatarFallback className="bg-bg-subtle text-fg-muted text-[10px]">
                          {profile.full_name?.charAt(0)}
                      </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-fg truncate">{profile.full_name}</span>
                      <Badge variant="outline" className="w-fit h-4 text-[8px] uppercase px-1 border-none bg-primary/10 text-primary font-black">
                          {profile.role.replace('_', ' ')}
                      </Badge>
                  </div>
              </div>
          </div>
      )}
    </aside>
  )
}

function NavSectionGroup({
  section,
  currentPath,
  isCollapsed,
}: {
  section: NavSection
  currentPath: string
  isCollapsed: boolean
}) {
  return (
    <div className="space-y-1.5">
      {!isCollapsed && (
        <h4 className="px-3 text-[9px] font-black text-fg-disabled uppercase tracking-[0.2em] mb-2">
          {section.label}
        </h4>
      )}
      <div className="space-y-1">
        {section.items.map((item) => {
          const isActive = currentPath === item.href || (item.href !== '/dashboard' && currentPath.startsWith(item.href))
          return (
            <Link
                key={item.href}
                href={item.href}
                className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative group",
                isActive
                    ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                    : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                )}
            >
                <item.icon
                className={cn(
                    "h-4 w-4 shrink-0 transition-transform group-hover:scale-110",
                    isActive ? "text-primary" : "text-fg-disabled"
                )}
                />
                {!isCollapsed && <span className={cn("truncate font-medium", isActive ? "font-bold text-fg" : "")}>{item.label}</span>}
                
                {isActive && !isCollapsed && (
                    <div className="absolute right-2 h-1 w-1 rounded-full bg-primary animate-pulse" />
                )}

                {isCollapsed && (
                <div className="absolute left-14 bg-panel border border-border px-2 py-1.5 rounded-md text-[10px] font-bold text-fg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-2 group-hover:translate-x-0 z-50 shadow-2xl">
                    {item.label}
                </div>
                )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
