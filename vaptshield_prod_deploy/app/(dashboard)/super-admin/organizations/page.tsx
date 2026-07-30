export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { OrganizationsClient } from "./OrganizationsClient"

export default async function SuperAdminOrganizationsPage() {
  const supabase = await getServerClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  // Get user's role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  // Only super_admin can access this page
  if (!profile || profile.role !== "super_admin") {
    notFound()
  }

  // Get all organizations with stats
  const { data: organizations } = await supabase
    .from("organizations")
    .select(`
      *,
      org_quotas (*),
      profiles (count)
    `)
    .order("created_at", { ascending: false })

  // Get total registered users (Platform Users - excluding Super Admins)
  const { count: totalPlatformUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .neq("role", "super_admin")

  // Get assigned members count (Users already in organizations)
  const { count: assignedUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .not("org_id", "is", null)

  return (
    <OrganizationsClient 
      organizations={organizations || []} 
      totalUsers={assignedUsers || 0}
      platformUsers={totalPlatformUsers || 0}
    />
  )
}
