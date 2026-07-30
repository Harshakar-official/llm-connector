export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { OrganizationClient } from "./OrganizationClient"

export default async function OrganizationPage() {
  const supabase = await getServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "admin") {
    notFound()
  }

  // Get org details
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.org_id)
    .single()

  // Get org quotas
  const { data: quotas } = await supabase
    .from("org_quotas")
    .select("*")
    .eq("org_id", profile.org_id)
    .single()

  // Get user count
  const { count: userCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("org_id", profile.org_id)

  // Get project count
  const { count: projectCount } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("org_id", profile.org_id)
    .eq("is_archived", false)

  if (!org || !quotas) {
    notFound()
  }

  return (
    <OrganizationClient
      org={org}
      quotas={quotas}
      userCount={userCount || 0}
      projectCount={projectCount || 0}
      userRole={profile.role || "guest"}
    />

  )
}