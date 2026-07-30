export const dynamic = "force-dynamic"

import { notFound, redirect } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { OrgDetailClient } from "./OrgDetailClient"

export default async function OrgDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await props.params
  const supabase = await getServerClient()

  // 1. Auth & Role Guard (Server-side)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    notFound()
  }

  // 2. Fetch Data in Parallel (Performance)
  const [orgResult, quotaResult, userCountResult, projectCountResult, membersResult] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", orgId).single(),
    supabase.from("org_quotas").select("*").eq("org_id", orgId).single(),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("projects").select("*", { count: "exact" }).eq("org_id", orgId),
    supabase.from("profiles").select("id, full_name, email, role, avatar_url, is_active, last_seen").eq("org_id", orgId).order("role")
  ])

  if (orgResult.error || !orgResult.data) {
    notFound()
  }

  return (
    <OrgDetailClient
      org={orgResult.data}
      quotas={quotaResult.data || null}
      userCount={userCountResult.count || 0}
      projectCount={projectCountResult.count || 0}
      members={membersResult.data || []}
    />
  )
}
