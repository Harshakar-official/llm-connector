export const dynamic = "force-dynamic"
import { redirect, notFound } from "next/navigation"
import { getSafeSession } from "@/lib/utils/security-guard"
import { getServerClient } from "@/lib/supabase/server"
import { ProjectReportClient } from "./ProjectReportClient"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjectReportPage({ params }: Props) {
  const { id: projectId } = await params
  const { orgId, error, role } = await getSafeSession()

  if (error || !orgId) redirect("/login")
  
  const supabase = await getServerClient()

  // Verify Project access and details
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .eq("org_id", orgId)
    .single()

  if (!project) notFound()

  // Fetch existing reports for this project with author info
  const { data: reports } = await supabase
    .from("reports")
    .select(`
        *,
        profiles:created_by(full_name, avatar_url)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })

  // Permission Check: Admin/PM/SE can generate, others can view/download
  const canGenerate = ['admin', 'program_manager', 'security_engineer'].includes(role || '')
  const canDownload = ['admin', 'program_manager', 'security_engineer'].includes(role || '')

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link href={`/projects/${projectId}`} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-fg-muted hover:text-primary mb-8 transition-colors">
        <ArrowLeft className="h-3 w-3" />
        Back to Dashboard
      </Link>

      <ProjectReportClient 
        projectId={projectId}
        projectName={project.name}
        canGenerate={canGenerate}
        canDownload={canDownload}
        initialReports={reports || []}
      />
    </div>
  )
}
