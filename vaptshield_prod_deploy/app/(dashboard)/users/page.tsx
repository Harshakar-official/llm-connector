export const dynamic = "force-dynamic"
import { redirect } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { UsersClient } from "./UsersClient"
import { ShieldAlert } from "lucide-react"

export default async function UsersPage() {
  const supabase = await getServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  // Get user's role
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single()

  // Admin and Program Manager can access users page
  // Return a proper forbidden UI (consistent with middleware's 403)
  if (!profile || (profile.role !== "admin" && profile.role !== "program_manager")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="h-16 w-16 text-fg-disabled" />
        <h1 className="text-2xl font-bold text-fg">Access Denied</h1>
        <p className="text-fg-muted text-center max-w-md">
          You do not have permission to access this page. Please contact your organization admin if you believe this is an error.
        </p>
      </div>
    )
  }

  // Get all org users
  // Stale presence cleanup is handled by Vercel cron: /api/presence/cleanup
  const query = supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role, is_active, last_seen, presence_status, created_at, department_id")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
  
  // If PM, they can see everyone but maybe we want to restrict actions in the client
  const { data: users } = await query

  return <UsersClient initialUsers={users || []} />
}