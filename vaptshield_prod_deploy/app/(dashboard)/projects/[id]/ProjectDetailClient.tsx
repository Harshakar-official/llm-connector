"use client"

import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Home,
  ShieldAlert,
  Radar,
  Users,
  FileText,
  ArrowLeft,
  MoreHorizontal,
  Edit,
  Archive,
  Trash2,
  Calendar,
  Target,
  BookOpen,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, formatRelativeTime } from "@/lib/utils"
import { ProjectForm } from "@/components/projects/ProjectForm"
import { MemberAssignment } from "@/components/projects/MemberAssignment"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { archiveProject, deleteProject } from "../actions"
import { toast } from "sonner"
import { hasPermission } from "@/lib/utils/permissions"
import { Role } from "@/lib/supabase/types"
import { ImportExportDialog } from "@/components/projects/ImportExportDialog"

// Components for optimized tab content
import { FindingsClient } from "@/app/(dashboard)/findings/FindingsClient"
import { ProjectReportClient } from "./report/ProjectReportClient"

interface ProjectMember {
  profile_id: string
  role_in_project: string
  assigned_at: string
  profiles: {
    id: string
    full_name: string
    avatar_url: string | null
    role: string
  }
}

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  project_type: string
  scope: string | null
  methodology: string | null
  start_date: string | null
  end_date: string | null
  is_archived: boolean
  created_by: string
  created_at: string
  updated_at: string
  profiles?: { full_name: string; avatar_url: string | null; role: string } | null
  project_members?: ProjectMember[]
}

interface Props {
  project: Project
  severityCounts: { critical: number; high: number; medium: number; low: number; informational: number }
  activeFindingsCounts: { critical: number; high: number; medium: number; low: number; informational: number }
  recentFindings: Array<{ id: string; title: string; severity: string; created_at: string }>
  userRole: string
  currentUserId: string
  orgId: string
  members: any[]
  reports: any[]
  canGenerateReport: boolean
  canDownloadReport: boolean
}

const statusConfig: Record<string, { label: string; color: string }> = {
  planning: { label: "Planning", color: "bg-info text-info-bg" },
  active: { label: "Active", color: "bg-success text-success-bg" },
  in_review: { label: "In Review", color: "bg-warning text-warning-bg" },
  completed: { label: "Completed", color: "bg-primary text-primary-fg" },
  archived: { label: "Archived", color: "bg-fg-muted text-fg" },
}

const typeLabels: Record<string, string> = {
  web_app: "Web Application",
  mobile_app: "Mobile App",
  api: "API",
  network: "Network",
  cloud: "Cloud",
  red_team: "Red Team",
  thick_client: "Thick Client",
}

export function ProjectDetailClient({ 
  project, 
  severityCounts, 
  activeFindingsCounts,
  recentFindings, 
  userRole, 
  currentUserId,
  orgId,
  members,
  reports,
  canGenerateReport,
  canDownloadReport
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab") || "overview"
  const [isPending, startTransition] = useTransition()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false)

  const allDisplayMembers = useMemo(() => {
    const membersList = [...(project.project_members || [])]
    const isCreatorInMembers = membersList.some(m => m.profile_id === project.created_by)
    if (!isCreatorInMembers && project.profiles) {
      membersList.unshift({
        profile_id: project.created_by,
        role_in_project: "creator",
        assigned_at: project.created_at,
        profiles: {
          id: project.created_by,
          full_name: project.profiles.full_name,
          avatar_url: project.profiles.avatar_url,
          role: project.profiles.role || "admin"
        }
      } as any)
    }
    return membersList
  }, [project.project_members, project.created_by, project.profiles, project.created_at])

  const status = statusConfig[project.status] || statusConfig.planning
  const canEdit = hasPermission(userRole as Role, "projects:edit")
  const isCreator = currentUserId === project.created_by
  const canDelete = hasPermission(userRole as Role, "projects:delete") || (userRole === 'program_manager' && isCreator)
  const canAssign = hasPermission(userRole as Role, "projects:assign_members")
  const canArchive = hasPermission(userRole as Role, "projects:archive")

  const totalFindings = Object.values(severityCounts).reduce((a, b) => a + b, 0)

  const handleArchive = () => {
    startTransition(async () => {
      const res = await archiveProject({ id: project.id })
      if (res.success) {
        toast.success(res.data?.is_archived ? "Project archived" : "Project restored")
        router.refresh()
      } else {
        toast.error(res.error || "Failed to archive project")
      }
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteProject({ id: project.id })
      if (res.success) {
        toast.success("Project deleted successfully")
        setDeleteDialogOpen(false)
        router.push("/projects")
      } else {
        toast.error(res.error || "Failed to delete project")
      }
    })
  }

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/projects" className="text-fg-muted hover:text-fg flex items-center gap-1 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>
        <span className="text-fg-subtle">/</span>
        <span className="text-fg font-medium">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-black tracking-tighter uppercase italic text-fg">{project.name}</h1>
            <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded", status.color)}>
              {status.label}
            </span>
            {project.is_archived && (
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-fg-muted text-fg">
                Archived
              </span>
            )}
          </div>
          <p className="text-sm text-fg-muted font-medium">{typeLabels[project.project_type] || project.project_type}</p>
        </div>

        {(canEdit || canArchive) && (
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button onClick={() => setEditOpen(true)} disabled={isPending} className="font-bold rounded-xl h-10">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" disabled={isPending} className="rounded-xl h-10 w-10">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-panel border-border w-48">
                {canArchive && (
                  <DropdownMenuItem onClick={handleArchive}>
                    <Archive className="h-4 w-4 mr-2" />
                    {project.is_archived ? "Restore" : "Archive"}
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem 
                      className="text-danger focus:text-danger focus:bg-danger/10"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Project
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue={currentTab} className="space-y-6">
        <TabsList className="bg-bg-subtle p-1 rounded-xl border border-border overflow-x-auto h-auto min-h-12 w-full justify-start no-scrollbar">
          <TabsTrigger value="overview" className="gap-2 rounded-lg data-[state=active]:bg-panel data-[state=active]:text-primary font-bold text-xs uppercase tracking-widest px-6 h-10">
            <Home className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="findings" className="gap-2 rounded-lg data-[state=active]:bg-panel data-[state=active]:text-primary font-bold text-xs uppercase tracking-widest px-6 h-10">
            <ShieldAlert className="h-3.5 w-3.5" />
            Findings
            {totalFindings > 0 && (
              <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{totalFindings}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scanner" className="gap-2 rounded-lg data-[state=active]:bg-panel data-[state=active]:text-primary font-bold text-xs uppercase tracking-widest px-6 h-10">
            <Radar className="h-3.5 w-3.5" />
            Scanner
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2 rounded-lg data-[state=active]:bg-panel data-[state=active]:text-primary font-bold text-xs uppercase tracking-widest px-6 h-10">
            <Users className="h-3.5 w-3.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-2 rounded-lg data-[state=active]:bg-panel data-[state=active]:text-primary font-bold text-xs uppercase tracking-widest px-6 h-10">
            <FileText className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 animate-in fade-in duration-500">
          {/* Description */}
          {project.description && (
            <div className="bg-panel border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted mb-3">Project Abstract</h3>
              <p className="text-sm text-fg leading-relaxed">{project.description}</p>
            </div>
          )}

          {/* Severity Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(["critical", "high", "medium", "low", "informational"] as const).map((sev) => {
              const count = severityCounts[sev]
              const colors = {
                critical: "text-severity-critical bg-severity-critical/10",
                high: "text-severity-high bg-severity-high/10",
                medium: "text-severity-medium bg-severity-medium/10",
                low: "text-severity-low bg-severity-low/10",
                informational: "text-severity-info bg-severity-info/10",
              }
              const labels = { critical: "Critical", high: "High", medium: "Medium", low: "Low", informational: "Info" }
              return (
                <div key={sev} className="bg-panel border border-border rounded-xl p-5 shadow-sm hover:border-primary/20 transition-all group">
                  <div className={cn("text-3xl font-black font-mono mb-1 transition-transform group-hover:scale-110", count > 0 ? colors[sev].split(' ')[0] : "text-fg-disabled")}>
                    {count}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">{labels[sev]} Risk</div>
                </div>
              )
            })}
          </div>

          {/* Project Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Scope */}
            <div className="bg-panel border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-fg-muted mb-3">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest">Target Scope</span>
              </div>
              <p className="text-xs font-mono text-fg bg-bg-subtle p-2 rounded border border-border/50 line-clamp-3">{project.scope || "No Scope Defined"}</p>
            </div>

            {/* Methodology */}
            <div className="bg-panel border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-fg-muted mb-3">
                <BookOpen className="h-3.5 w-3.5 text-success" />
                <span className="text-[10px] font-black uppercase tracking-widest">Methodology</span>
              </div>
              <p className="text-sm font-bold text-fg">{project.methodology || "Standard Assessment"}</p>
            </div>

            {/* Start Date */}
            <div className="bg-panel border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-fg-muted mb-3">
                <Calendar className="h-3.5 w-3.5 text-warning" />
                <span className="text-[10px] font-black uppercase tracking-widest">Commencement</span>
              </div>
              <p className="text-sm font-bold text-fg">
                {project.start_date ? new Date(project.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : "Not Scheduled"}
              </p>
            </div>

            {/* End Date */}
            <div className="bg-panel border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-fg-muted mb-3">
                <Calendar className="h-3.5 w-3.5 text-danger" />
                <span className="text-[10px] font-black uppercase tracking-widest">Estimated Closure</span>
              </div>
              <p className="text-sm font-bold text-fg">
                {project.end_date ? new Date(project.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : "Continuous"}
              </p>
            </div>
          </div>

          {/* Recent Findings */}
          {recentFindings.length > 0 && (
            <div className="bg-panel border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-bg-subtle/30 flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Recent Discovered Artifacts</h3>
                <Link href={`/projects/${project.id}?tab=findings`} className="text-[10px] font-black uppercase text-primary hover:underline">
                  Inventory →
                </Link>
              </div>
              <div className="divide-y divide-border">
                {recentFindings.map((finding) => {
                  const sevColors = {
                    critical: "bg-severity-critical",
                    high: "bg-severity-high",
                    medium: "bg-severity-medium",
                    low: "bg-severity-low",
                    informational: "bg-severity-info",
                  }
                  return (
                    <Link key={finding.id} href={`/findings/${finding.id}`} className="px-6 py-4 flex items-center justify-between hover:bg-panel-hover transition-colors group text-fg">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full", sevColors[finding.severity as keyof typeof sevColors])} />
                        <span className="text-sm font-bold group-hover:text-primary transition-colors">{finding.title}</span>
                      </div>
                      <span className="text-[10px] text-fg-disabled font-mono italic">
                        {formatRelativeTime(finding.created_at)}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="findings" className="animate-in slide-in-from-right-4 duration-500 space-y-4">
          <div className="flex items-center justify-between">
            <div />
            <ImportExportDialog projectId={project.id} />
          </div>
          <FindingsClient
            orgId={orgId}
            projects={[project]} 
            members={members}
            userRole={userRole}
            severityCounts={activeFindingsCounts}
            lockedProjectId={project.id}
          />
        </TabsContent>

        <TabsContent value="scanner" className="animate-in zoom-in-95 duration-500">
          <div className="bg-panel border border-border rounded-2xl p-12 text-center flex flex-col items-center">
            <div className="h-20 w-20 bg-bg rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                <Radar className="h-10 w-10 text-primary animate-pulse" />
            </div>
            <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-2 text-fg">Offensive Engine</h3>
            <p className="text-sm text-fg-muted max-w-sm mb-8 leading-relaxed">Automated infrastructure and application security testing is currently in deep synthesis.</p>
            <Link href={`/projects/${project.id}/scanner`}>
              <Button className="rounded-xl px-8 font-black uppercase text-xs tracking-widest h-11">Initialize Alpha Module</Button>
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-6 animate-in fade-in duration-500">
          <div className="flex items-center justify-between bg-panel border border-border p-6 rounded-xl shadow-sm">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted">Project Taskforce</h3>
              <p className="text-xs text-fg-disabled mt-1">Users authorized to interact with this specific assessment.</p>
            </div>
            {canAssign && (
              <Button onClick={() => setIsAssignmentOpen(true)} className="gap-2 rounded-xl font-bold uppercase text-xs h-10">
                <Users className="h-4 w-4" />
                Manage Team
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allDisplayMembers.length > 0 ? (
              allDisplayMembers.map((member) => {
                const p = member.profiles
                if (!p) return null

                const roleColors: Record<string, string> = {
                  super_admin: "bg-purple-500/10 text-purple-500 border-purple-500/20",
                  admin: "bg-danger/10 text-danger border-danger/20",
                  program_manager: "bg-warning/10 text-warning border-warning/20",
                  security_engineer: "bg-success/10 text-success border-success/20",
                  developer: "bg-orange-500/10 text-orange-500 border-orange-500/20",
                  guest: "bg-info/10 text-info border-info/20",
                }
                const roleLabels: Record<string, string> = {
                  super_admin: "Super Admin",
                  admin: "Administrator",
                  program_manager: "Program Manager",
                  security_engineer: "Security Engineer",
                  developer: "Developer",
                  guest: "Guest / Client",
                }

                const displayRole = p.role || "guest"
                const borderClass = roleColors[displayRole]?.split(' ').find(c => c.startsWith('border-')) || "border-border"

                return (
                  <div key={member.profile_id} className={cn(
                    "bg-panel border rounded-2xl p-4 flex items-center gap-4 transition-all group hover:shadow-md",
                    borderClass.replace('border-', 'hover:border-')
                  )}>
                    <div className={cn(
                        "h-12 w-12 rounded-full overflow-hidden bg-bg-subtle border-2 transition-colors",
                        borderClass
                    )}>
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt={p.full_name || "Member"} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-lg font-bold text-fg-muted uppercase">
                          {p.full_name?.charAt(0) || "?"}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-fg">{p.full_name || "Unknown Member"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded border",
                          roleColors[displayRole] || "bg-fg-muted/10 text-fg-muted border-border"
                        )}>
                          {roleLabels[displayRole] || displayRole}
                        </span>
                        <span className="text-[9px] text-fg-disabled font-medium italic">
                          {formatRelativeTime(member.assigned_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="col-span-full py-12 bg-panel border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-center">
                <Users className="h-12 w-12 text-fg-disabled mb-4 opacity-20" />
                <p className="text-sm text-fg-muted font-medium">No members assigned to this project yet.</p>
                {canAssign && (
                  <Button variant="ghost" size="sm" onClick={() => setIsAssignmentOpen(true)} className="mt-2 text-primary font-bold">
                    Assign Taskforce
                  </Button>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="report" className="animate-in slide-in-from-left-4 duration-500">
          <ProjectReportClient 
            projectId={project.id}
            projectName={project.name}
            canGenerate={canGenerateReport}
            canDownload={canDownloadReport}
            initialReports={reports}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Modal */}
      <ProjectForm
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSuccess={() => router.refresh()}
      />

      {/* Member Assignment Modal */}
      <MemberAssignment
        projectId={project.id}
        isOpen={isAssignmentOpen}
        onClose={() => setIsAssignmentOpen(false)}
        currentMembers={project.project_members || []}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-panel border-border rounded-2xl">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-bold italic uppercase text-danger">Purge Project?</AlertDialogTitle>
                  <AlertDialogDescription className="text-fg-muted text-sm leading-relaxed">
                      This action will strictly delete the project <strong>{project.name}</strong> and all associated findings, reports, and scans. 
                      This action is irreversible and follows Z+ Security purge protocols.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4 gap-2">
                  <AlertDialogCancel className="rounded-xl border-border hover:bg-bg-subtle text-[10px] font-black uppercase tracking-widest">
                      Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction 
                      onClick={(e) => {
                          e.preventDefault()
                          handleDelete()
                      }}
                      disabled={isPending}
                      className="rounded-xl bg-danger hover:bg-danger/90 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Trash2 className="h-3.5 w-3.5 mr-2" />}
                      Purge Permanently
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
