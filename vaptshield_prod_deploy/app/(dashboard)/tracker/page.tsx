export const dynamic = "force-dynamic"
import { redirect } from "next/navigation"
import { getSafeSession, getAllowedProjectIds } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import { TrackerGrid } from "@/components/tracker/TrackerGrid"

export default async function TrackerPage() {
  const { orgId, role, user, error } = await getSafeSession()

  if (error || !orgId || !user) redirect("/login")

  const supabase = await getServerClient()

  // Z+ SECURITY: Project Isolation Logic
  // Admins see everything. SE, Developers, and Guests see only assigned projects.
  const allowedProjectIds = await getAllowedProjectIds()

  // Parallel fetch: tracker items, projects, and members for filtering
  let trackerQuery = supabase
        .from("vulnerabilities")
        .select(`
            id,
            ticket_id,
            title,
            status,
            severity,
            version,
            created_at,
            updated_at,
            assigned_to,
            project_id,
            projects (id, name, status),
            profiles:profiles!vulnerabilities_assigned_to_fkey (id, full_name, avatar_url),
            vuln_comments (id, content, created_at, author_id, profiles (full_name, avatar_url, role))
        `)
        .eq("org_id", orgId)
        // Z+ LOGIC: Only show findings that are assigned to SOMEONE or are in remediation lifecycle
        .not("assigned_to", "is", null)
        // Z+ LOGIC: Exclude informational findings from remediation tracking by default
        .neq("severity", "informational")

  // ─── ROLE-BASED FILTERING ───
  if (role === "developer") {
      trackerQuery = trackerQuery.eq("assigned_to", user.id)
  } else if (role !== "admin") {
      trackerQuery = trackerQuery.in("project_id", allowedProjectIds)
  }
  
  trackerQuery = trackerQuery.order("created_at", { ascending: false })

  const [
    trackerResult,
    { data: projects },
    { data: members }
  ] = await Promise.all([
    trackerQuery,
    supabase
        .from("projects")
        .select("id, name")
        .eq("org_id", orgId)
        .in("id", allowedProjectIds)
        .order("name"),
    supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .eq("org_id", orgId)
        .order("full_name")
  ])

  const items = trackerResult.data;
  console.log(`[TrackerPage] Query returned ${items?.length || 0} items.`);
  if (trackerResult.error) console.error(`[TrackerPage] Query Error:`, trackerResult.error);

  return (
    <div className="p-6 h-[calc(100vh-3.5rem)] flex flex-col space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-fg">Remediation Tracker</h1>
          <p className="text-fg-muted mt-1 text-sm font-medium">
            Manage vulnerability lifecycle and remediation tickets at scale.
          </p>
        </div>
      </div>

      <TrackerGrid 
        initialItems={items || []} 
        projects={projects || []} 
        members={members || []}
        userRole={role || "guest"}
        orgId={orgId}
        userId={user.id}
      />
    </div>
  )
}
