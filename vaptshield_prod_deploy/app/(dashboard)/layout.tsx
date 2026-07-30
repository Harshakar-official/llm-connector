import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import { RealtimeProvider } from "@/components/shared/RealtimeProvider"
import { ThemeSyncProvider } from "@/components/shared/ThemeSyncProvider"
import { TerminalHeartbeatProvider } from "@/components/shared/TerminalHeartbeatProvider"
import { getServerClient } from "@/lib/supabase/server"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await getServerClient()

  // ─── 1. FETCH USER CONTEXT ───
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login?error=profile_missing")

  // ─── 2. RESOLVE CURRENT PATHNAME ───
  // In Next.js 15 App Router, headers() provides the x-invoke-path (or
  // x-pathname) header that tells us which route is being rendered.
  const headersList = await headers()
  const pathname = headersList.get("x-invoke-path") || headersList.get("x-pathname") || ""

  // ─── 3. SUPER ADMIN ISOLATION GUARD ───
  // Super admins are platform-level operators. They must NOT access tenant
  // data routes (projects, findings, reports, etc.). Conversely, non-super-admins
  // must NOT access the /super-admin panel.
  if (profile.role === "super_admin") {
    const tenantDataRoutes = ["/projects", "/findings", "/reports", "/scanner", "/tracker", "/users", "/organization"]
    const isTenantRoute = tenantDataRoutes.some(r =>
      pathname === r || pathname.startsWith(r + "/")
    )
    if (isTenantRoute) {
      // Super admins trying to access tenant data → redirect to super-admin dashboard
      redirect("/super-admin/dashboard")
    }
  } else {
    // Non-super-admins trying to access /super-admin → 404 (hide existence)
    if (pathname.startsWith("/super-admin")) {
      notFound()
    }
  }

  // ─── 4. PLATFORM MAINTENANCE GATE (Regular Users Only) ───
  if (profile.role !== "super_admin") {
    const { data: maintenance } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle()

    if (maintenance?.value === "true") {
      redirect("/login?error=maintenance")
    }

    // ─── 5. ORGANIZATION SUSPENSION GATE ───
    if (profile.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("is_active")
        .eq("id", profile.org_id)
        .maybeSingle()

      if (org && org.is_active === false) {
        redirect("/login?error=suspended")
      }
    }
  }

  return (
    <RealtimeProvider>
      <ThemeSyncProvider>
        <TerminalHeartbeatProvider />
        <div className="flex h-screen overflow-hidden bg-bg">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </ThemeSyncProvider>
    </RealtimeProvider>
  )
}
