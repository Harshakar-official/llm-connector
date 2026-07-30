import { getSafeSession } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import ReportsClient from "./ReportsClient"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function GlobalReportsPage() {
  const { orgId, user, role, error } = await getSafeSession()

  if (error || !orgId || !user) {
    redirect("/login")
  }

  const supabase = await getServerClient()

  // Fetch all reports for the organization with creator info
  const { data: reports } = await supabase
    .from("reports")
    .select(`
      *,
      projects(name),
      profiles:created_by(full_name, avatar_url)
    `)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">All Reports</h1>
        <p className="text-fg-muted mt-2">
          View and manage all generated security reports across your organization.
        </p>
      </div>

      <ReportsClient initialReports={reports || []} role={role} />
    </div>
  )
}
