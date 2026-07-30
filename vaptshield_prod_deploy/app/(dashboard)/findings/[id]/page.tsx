export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getSafeSession, verifyProjectAccess } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import { FindingDetailClient } from "./FindingDetailClient"

interface PageProps {
  params: Promise<{ id: string }>
}

interface VulnAttachmentRaw {
  id: string
  original_filename: string
  stored_filename: string
  file_url: string
  mime_type: string
  file_size_bytes: number
  created_at: string
}

interface FindingRaw {
  id: string
  project_id: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  status: 'open' | 'reopened' | 'in_progress' | 'resolved' | 'verified' | 'closed' | 'accepted_risk' | 'false_positive'
  cve_id: string | null
  cwe_id: string | null
  owasp_category: string | null
  cvss_score: number | null
  cvss_vector: string | null
  endpoint_url: string | null
  affected_component: string | null
  proof_of_concept: string | null
  impact: string | null
  remediation: string | null
  reference_links: string[] | null
  assigned_to: string | null
  version: number
  created_at: string
  updated_at: string
  projects: { id: string, name: string, org_id: string } | null
  profiles: { id: string, full_name: string, avatar_url: string | null } | null
  assigned_to_profile: { id: string, full_name: string, avatar_url: string | null } | null
  vuln_attachments: VulnAttachmentRaw[] | null
}

export default async function FindingDetailPage({ params }: PageProps) {
  const { id } = await params
  const { orgId, user, role, error } = await getSafeSession()

  if (error || !orgId || !user) redirect("/login")

  const supabase = await getServerClient()

  // 1. Fetch finding detail with relations
  const { data: finding, error: fetchError } = await supabase
    .from("vulnerabilities")
    .select(`
        *,
        projects (id, name, status),
        profiles!vulnerabilities_found_by_fkey (id, full_name, avatar_url),
        assigned_to_profile:profiles!vulnerabilities_assigned_to_fkey (id, full_name, avatar_url),
        vuln_attachments (id, original_filename, stored_filename, file_url, mime_type, file_size_bytes, created_at)
    `)
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  if (fetchError || !finding) notFound()

  // 2. Security Check: For guest/PM/SE, verify project access
  if (role !== "admin") {
      const { allowed } = await verifyProjectAccess(finding.project_id)
    
      if (!allowed) {
          // If not explicitly assigned, SE can still view if they are the creator
          if (role === "security_engineer" && finding.found_by === user.id) {
              // Allowed
          } else {
              return redirect("/findings?error=access_denied")
          }
      }
  }

  // 3. Parallel fetch: projects (for edit modal), members, activity log, and comments
  const [
    { data: projects },
    { data: members },
    { data: activity },
    { data: comments }
  ] = await Promise.all([
    supabase
        .from("projects")
        .select("id, name")
        .eq("org_id", orgId)
        .order("name"),
    supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .eq("org_id", orgId)
        .order("full_name"),
    supabase
        .from("audit_log")
        .select(`
            *,
            profiles (full_name, avatar_url)
        `)
        .eq("resource_id", id)
        .eq("resource_type", "vulnerability")
        .order("created_at", { ascending: false }),
    supabase
        .from("vuln_comments")
        .select(`
            id,
            content,
            created_at,
            author_id,
            is_edited,
            profiles:author_id (full_name, avatar_url, role)
        `)
        .eq("vuln_id", id)
        .order("created_at", { ascending: true })
  ])

// 4. Manual mapping for strict TS compliance
const typedFinding = {
    ...finding,
    projects: finding.projects ? {
        id: finding.projects.id,
        name: finding.projects.name,
        status: (finding.projects as any).status || 'active'
    } : null
}

const typedComments = (comments || []).map(c => ({
    ...c,
    profiles: Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
}))

return (
  <FindingDetailClient
    finding={typedFinding as any}
    projects={projects || []}
    members={members || []}
    activity={activity || []}
    comments={typedComments as any}
    userRole={role || "guest"}
    currentUserId={user.id}
  />
)
}

