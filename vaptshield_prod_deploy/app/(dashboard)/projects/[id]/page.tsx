export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"
import { ProjectDetailClient } from "./ProjectDetailClient"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await getServerClient()

  // Auth check - use getUser for latest session data
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  // Get user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.org_id) {
    redirect("/dashboard")
  }

  const orgId = profile.org_id

  // 1. Fetch Project and Related Data in Parallel
  const [projectResult, membersResult, reportsResult, projectFindingsResult] = await Promise.all([
    supabase.from("projects")
      .select(`
        *,
        profiles!projects_created_by_fkey(full_name, avatar_url, role),
        project_members(
          profile_id,
          role_in_project,
          assigned_at,
          profiles:profiles!project_members_profile_id_fkey(id, full_name, avatar_url, role)
        )
      `)
      .eq("id", id)
      .eq("org_id", orgId)
      .single(),
    supabase.from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("org_id", orgId)
      .order("full_name"),
    supabase.from("reports")
      .select(`*, profiles:created_by(full_name, avatar_url)`)
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("vulnerabilities")
      .select("severity, status")
      .eq("project_id", id)
  ])

  if (projectResult.error || !projectResult.data) {
    notFound()
  }

  const project = projectResult.data

  // For guest users, check project membership
  if (profile.role === "guest") {
    const isMember = project.project_members?.some(
      (m: { profile_id: string }) => m.profile_id === user.id
    )
    if (!isMember) {
      notFound()
    }
  }

  // Calculate severity counts
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
  const activeFindingsCounts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }

  projectFindingsResult.data?.forEach((v) => {
    const sev = v.severity as keyof typeof severityCounts
    if (sev in severityCounts) {
      severityCounts[sev]++
      // For findings tab filtering: exclude resolved/false_positive
      if (!['resolved', 'false_positive'].includes(v.status)) {
          activeFindingsCounts[sev]++
      }
    }
  })

  // Get recent activity (latest findings)
  const { data: recentFindings } = await supabase
    .from("vulnerabilities")
    .select("id, title, severity, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(5)

  // Permissions for reports
  const canGenerateReport = ['admin', 'program_manager', 'security_engineer'].includes(profile.role || '')
  const canDownloadReport = ['admin', 'program_manager', 'security_engineer'].includes(profile.role || '')

  return (
    <ProjectDetailClient
      project={project}
      severityCounts={severityCounts}
      activeFindingsCounts={activeFindingsCounts}
      recentFindings={recentFindings || []}
      userRole={profile.role}
      currentUserId={user.id}
      orgId={orgId}
      members={membersResult.data || []}
      reports={reportsResult.data || []}
      canGenerateReport={canGenerateReport}
      canDownloadReport={canDownloadReport}
    />
  )
}
