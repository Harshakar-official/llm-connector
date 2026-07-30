export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { AuditClient } from "@/components/audit/AuditClient"
import { Activity } from "lucide-react"

export default async function AuditLogPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await getServerClient()

  // Auth check - use getUser for latest session data
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Role check (Super Admin only for platform-wide, Admin/PM for org-specific)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .single()

  if (!profile) notFound()

  // Fetch logs with all necessary fields (Audit Fix A16: Include ip_address, user_agent)
  let query = supabase
    .from("audit_log")
    .select(`
      id,
      created_at,
      action,
      resource_type,
      resource_id,
      actor_id,
      org_id,
      ip_address,
      user_agent,
      new_value,
      old_value,
      profiles:actor_id (full_name, email),
      organizations (name)
    `)

  // ─── DATE RANGE FILTERING (Audit Fix A15) ───
  if (searchParams.from) {
      query = query.gte("created_at", new Date(searchParams.from).toISOString())
  }
  if (searchParams.to) {
      const toDate = new Date(searchParams.to)
      toDate.setHours(23, 59, 59, 999)
      query = query.lte("created_at", toDate.toISOString())
  }

  query = query.order("created_at", { ascending: false }).limit(200)

  // If not super_admin, filter by org
  if (profile.role !== "super_admin") {
    if (!profile.org_id) redirect("/dashboard")
    query = query.eq("org_id", profile.org_id)
  }

  const { data: logs } = await query

  const isSuperAdmin = profile.role === "super_admin"

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-black tracking-tighter text-fg flex items-center gap-3 uppercase italic">
                Audit <span className="text-primary">Logs</span>
            </h1>
            <p className="text-sm text-fg-muted font-medium mt-1">
            {isSuperAdmin
                ? "Platform-wide compliance tracking and forensics."
                : "Internal security event logging for your organization."}
            </p>
        </div>
      </div>

      <AuditClient 
        initialLogs={(logs as any) || []} 
        isSuperAdmin={isSuperAdmin} 
      />
    </div>
  )
}
