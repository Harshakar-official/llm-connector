export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { UsersClient } from "./UsersClient"

export default async function SuperAdminUsersPage() {
  const supabase = await getServerClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Get user's role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "super_admin") notFound()

  // Get all users with their organization names
  const { data: users, error } = await supabase
    .from("profiles")
    .select(`
      *,
      organizations (name)
    `)
    .order("created_at", { ascending: false })

  return (
    <div className="p-6">
      <UsersClient initialUsers={users || []} />
    </div>
  )
}
