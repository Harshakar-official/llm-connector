import Link from "next/link"
import { getServerClient } from "@/lib/supabase/server"
import { ShieldCheck, ArrowRight, Sparkles } from "lucide-react"
import type { Role } from "@/lib/supabase/types"

export const dynamic = 'force-dynamic'

// ─── Role Display Config ────────────────────────────────────
const ROLE_CONFIG: Record<Role, { label: string; color: string; description: string }> = {
  super_admin: {
    label: "Super Admin",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    description: "Full platform control — manage all organizations and settings",
  },
  admin: {
    label: "Admin",
    color: "bg-primary/10 text-primary border-primary/30",
    description: "Organization admin — manage users, projects, and settings",
  },
  program_manager: {
    label: "Program Manager",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    description: "Team lead — manage projects and review security findings",
  },
  security_engineer: {
    label: "Security Engineer",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-400/30",
    description: "Technical expert — perform scans and document vulnerabilities",
  },
  developer: {
    label: "Developer",
    color: "bg-orange-500/10 text-orange-400 border-orange-400/30",
    description: "Remediation lead — fix vulnerabilities and submit technical proof",
  },
  guest: {

    label: "Guest / Client",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    description: "View-only access — monitor progress and view reports",
  },
}

export default async function WelcomePage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, organizations(name)")
    .eq("id", user.id)
    .single()

  if (!profile) return null

  const role = profile.role as Role
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.guest

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="bg-panel border border-border rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
          {/* Background Decorative Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full -ml-32 -mb-32 blur-3xl" />
          
          <div className="relative z-10 space-y-8">
            <div className="space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-black tracking-tight text-fg">
                  Welcome to <span className="text-primary">VAPTShield</span>
                </h1>
                <p className="text-xl text-fg-muted font-medium">
                  Hello, {profile.full_name.split(' ')[0]}! Your secure workspace is ready.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-bg-subtle border border-border/50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${config.color}`}>
                    {config.label}
                  </div>
                  <span className="text-xs text-fg-disabled font-bold uppercase tracking-tight">
                    {profile.organizations?.name || "Independent Account"}
                  </span>
                </div>
                <Sparkles className="h-4 w-4 text-primary opacity-50" />
              </div>
              <p className="text-sm text-fg-subtle leading-relaxed">
                {config.description}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/dashboard" className="group">
                <div className="h-full p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all">
                  <h3 className="text-sm font-bold text-fg group-hover:text-primary transition-colors">Go to Dashboard</h3>
                  <p className="text-xs text-fg-muted mt-1">Overview of your security posture</p>
                </div>
              </Link>
              <Link href="/projects" className="group">
                <div className="h-full p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all">
                  <h3 className="text-sm font-bold text-fg group-hover:text-primary transition-colors">Manage Projects</h3>
                  <p className="text-xs text-fg-muted mt-1">Start or review a security audit</p>
                </div>
              </Link>
            </div>

            <div className="pt-4">
              <Link href="/dashboard">
                <button className="w-full h-14 bg-primary hover:bg-primary/90 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-xl shadow-primary/20 transition-all active:scale-[0.98]">
                  Start Security Audit
                  <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
            </div>
          </div>
        </div>
        
        <p className="text-center mt-8 text-xs text-fg-disabled font-medium">
          Secure. Private. Enterprise-Grade. &copy; 2026 VAPTShield Inc.
        </p>
      </div>
    </div>
  )
}
