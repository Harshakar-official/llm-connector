"use client"

import Link from "next/link"
import { MoreHorizontal, Clock, Archive, Trash2, Edit3, RotateCcw, Users, Loader2, ChevronRight, CircleDot, PlayCircle, Eye, CheckCircle2, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, formatRelativeTime } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { archiveProject, deleteProject, updateProject } from "@/app/(dashboard)/projects/actions"
import { toast } from "sonner"
import { useState } from "react"
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
import { MemberAssignment } from "./MemberAssignment"
import { SeverityBadge } from "@/components/findings/SeverityBadge"
import { hasPermission } from "@/lib/utils/permissions"
import { Role } from "@/lib/supabase/types"

interface ProjectCardProps {
  project: {
    id: string
    name: string
    description: string | null
    status: string
    project_type: string
    created_at: string
    updated_at: string
    is_archived?: boolean
    scope?: string | null
    methodology?: string | null
    start_date?: string | null
    end_date?: string | null
    creator?: { id: string; full_name: string; avatar_url: string | null } | null
    project_members?: Array<{ profile_id: string; profiles: { id: string; full_name: string; avatar_url: string | null; role: string } }>
  }
  severityCounts: {
    critical: number
    high: number
    medium: number
    low: number
    informational: number
  }
  members: Array<{
    id: string
    full_name: string
    avatar_url: string | null
    role: string
  }>
  userRole: Role
  onEdit?: (project: ProjectCardProps["project"]) => void
}

const statusConfig = {
  planning: { label: "Planning", color: "bg-blue-500/10 text-blue-500" },
  active: { label: "Active", color: "bg-success/10 text-success" },
  in_review: { label: "In Review", color: "bg-warning/10 text-warning" },
  completed: { label: "Completed", color: "bg-primary/10 text-primary" },
  archived: { label: "Archived", color: "bg-fg-muted/10 text-fg-muted" },
}

const typeLabels: Record<string, string> = {
  web_app: "Web App",
  mobile_app: "Mobile App",
  api: "API",
  network: "Network",
  cloud: "Cloud",
  red_team: "Red Team",
  thick_client: "Thick Client",
}

export function ProjectCard({ project, severityCounts, members, userRole, currentUserId, onEdit }: ProjectCardProps & { currentUserId?: string }) {
  const projectStatus = project.status as keyof typeof statusConfig
  const status = statusConfig[projectStatus] || statusConfig.planning
  const totalVulns = Object.values(severityCounts).reduce((a, b) => a + b, 0)
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false)
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false)

  // Permissions logic via Central Helper (Z+ Security)
  const canManage = hasPermission(userRole, "projects:edit")
  const canAssign = hasPermission(userRole, "projects:assign_members")
  const canArchive = hasPermission(userRole, "projects:archive")
  
  // Enterprise Logic: Admin can delete anything, PM can delete their OWN projects
  const isCreator = currentUserId === project.creator?.id
  const canDelete = hasPermission(userRole, "projects:delete") || (userRole === 'program_manager' && isCreator)

  const [isArchiving, setIsArchiving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChangingStatus, setIsChangingStatus] = useState(false)

  const statusOptions = [
    { value: "planning", label: "Planning", icon: FileText, color: "text-blue-500" },
    { value: "active", label: "Active", icon: PlayCircle, color: "text-success" },
    { value: "in_review", label: "In Review", icon: Eye, color: "text-warning" },
    { value: "completed", label: "Completed", icon: CheckCircle2, color: "text-primary" },
  ]

  const handleStatusChange = async (newStatus: string) => {
    if (isChangingStatus || project.is_archived) return
    setIsChangingStatus(true)
    const result = await updateProject({
      id: project.id,
      name: project.name,
      project_type: project.project_type as "web_app" | "mobile_app" | "api" | "network" | "cloud" | "red_team" | "thick_client",
      description: project.description,
      scope: project.scope,
      methodology: project.methodology,
      start_date: project.start_date,
      end_date: project.end_date,
      status: newStatus as "planning" | "active" | "in_review" | "completed",
    })
    if (result.success) {
      toast.success(`Status changed to ${statusOptions.find(s => s.value === newStatus)?.label}`)
    } else {
      toast.error(result.error || "Failed to update status")
    }
    setIsChangingStatus(false)
  }

  const handleArchive = async () => {
    setIsArchiving(true)
    const result = await archiveProject({ id: project.id })
    if (result.success) {
      toast.success(project.is_archived ? "Project restored" : "Project archived")
    } else {
      toast.error(result.error || "Failed to update project")
    }
    setIsArchiving(false)
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    const result = await deleteProject({ id: project.id })
    if (result.success) {
      toast.success("Project deleted permanently")
    } else {
      toast.error(result.error || "Failed to delete project")
    }
    setIsDeleting(false)
  }

  return (
    <>
      <div className="bg-panel border border-border rounded-xl p-5 hover:border-primary/30 transition-all cursor-pointer group shadow-sm flex flex-col">
        {/* Top row: name + menu */}
        <div className="flex items-start justify-between mb-4">
          <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
            <h3 className="font-bold text-base text-fg truncate group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] uppercase font-bold text-fg-subtle tracking-tighter">
                    {typeLabels[project.project_type] || project.project_type}
                </span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span className={cn("text-[10px] uppercase font-bold tracking-tighter px-1.5 py-0.5 rounded", status.color)}>
                {status.label}
                </span>
                {totalVulns > 0 && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span className="text-[10px] uppercase font-bold text-primary tracking-tighter">
                        {totalVulns} Active Findings
                    </span>
                  </>
                )}
            </div>
          </Link>
          
          {(canManage || canDelete || canArchive) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-fg-muted hover:text-fg">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-panel border-border w-48">
                {canManage && (
                  <DropdownMenuItem onClick={() => onEdit?.(project)} className="gap-2" disabled={isArchiving || isDeleting}>
                    <Edit3 className="h-3.5 w-3.5" /> Edit Details
                  </DropdownMenuItem>
                )}

                {/* Z+ ENTERPRISE: Status Change Submenu */}
                {canManage && !project.is_archived && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2" disabled={isChangingStatus}>
                      {isChangingStatus ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Changing...</>
                      ) : (
                        <><CircleDot className="h-3.5 w-3.5" /> Change Status</>
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-panel border-border w-40">
                      {statusOptions.map((opt) => {
                        const Icon = opt.icon
                        const isCurrent = project.status === opt.value
                        return (
                          <DropdownMenuItem
                            key={opt.value}
                            onClick={() => handleStatusChange(opt.value)}
                            className={`gap-2 ${opt.color} ${isCurrent ? "font-bold" : ""}`}
                            disabled={isChangingStatus || isCurrent}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {opt.label}
                            {isCurrent && <span className="ml-auto text-[10px] text-fg-muted">✓</span>}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                
                {canAssign && (
                  <DropdownMenuItem onClick={() => setIsAssignmentOpen(true)} className="gap-2" disabled={isArchiving || isDeleting}>
                    <Users className="h-3.5 w-3.5" /> Manage Team
                  </DropdownMenuItem>
                )}

                {canArchive && (
                  <DropdownMenuItem onClick={handleArchive} className="gap-2" disabled={isArchiving || isDeleting}>
                    {isArchiving ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {project.is_archived ? "Restoring..." : "Archiving..."}</>
                    ) : project.is_archived ? (
                      <><RotateCcw className="h-3.5 w-3.5" /> Restore</>
                    ) : (
                      <><Archive className="h-3.5 w-3.5" /> Archive</>
                    )}
                  </DropdownMenuItem>
                )}
                
                {canDelete && (
                  <>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem
                      className="text-danger focus:text-danger focus:bg-danger/10 gap-2"
                      onClick={() => setIsDeleteAlertOpen(true)}
                      disabled={isArchiving || isDeleting}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete Project
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-fg-muted line-clamp-2 mb-6 min-h-[2.5rem]">
          {project.description || "No description provided for this security target."}
        </p>

        {/* Severity counts row */}
        <div className="flex items-center gap-1.5 mb-6 flex-wrap">
          {(['critical', 'high', 'medium', 'low', 'informational'] as const).map((sev) => {
            const count = severityCounts[sev] || 0
            return (
              <div key={sev} className="flex items-center gap-1">
                <SeverityBadge 
                    severity={sev}
                    variant="dot"
                    size="sm"
                    className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold border",
                        count === 0 && "opacity-40 grayscale"
                    )}
                />
                <span className={cn("text-[10px] font-mono font-bold", count === 0 ? "text-fg-disabled" : "text-fg")}>{count}</span>
              </div>
            )
          })}
        </div>

        <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center -space-x-2">
            {members.slice(0, 4).map((member) => {
              const roleColors: Record<string, string> = {
                super_admin: "border-purple-500",
                admin: "border-red-500",
                program_manager: "border-blue-500",
                security_engineer: "border-green-500",
                developer: "border-orange-500",
                guest: "border-gray-400",
              }

              return (
                <div key={member.id} className="relative group/avatar">
                  <Avatar className={cn(
                    "h-8 w-8 border-2 ring-1 ring-border shadow-sm transition-transform hover:translate-y-[-2px] hover:z-10",
                    member.role ? roleColors[member.role] : "border-panel"
                  )}>
                    <AvatarImage src={member.avatar_url || undefined} className="object-cover" />
                    <AvatarFallback className="text-[10px] font-bold bg-bg-subtle text-fg-muted">
                      {member.full_name?.slice(0, 2).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-fg text-bg text-[8px] font-bold rounded opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                    {member.full_name} {member.role ? `(${member.role.replace('_', ' ')})` : ''}
                  </div>
                </div>
              )
            })}
            {members.length > 4 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-muted border-2 border-panel ring-1 ring-border text-[10px] font-bold text-fg-muted">
                +{members.length - 4}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 text-[10px] text-fg-subtle font-medium uppercase tracking-tighter">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(project.updated_at)}
          </div>
        </div>
      </div>

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent className="bg-panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-danger flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Delete Project?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-fg-muted">
              Are you sure you want to delete <strong>{project.name}</strong>? 
              This will permanently remove all associated findings, scan history, and reports. 
              This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-bg border-border text-fg hover:bg-bg-subtle">Cancel</AlertDialogCancel>
            <AlertDialogAction 
                onClick={handleDelete}
                className="bg-danger text-white hover:bg-danger/90"
            >
                Purge Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberAssignment
        projectId={project.id}
        isOpen={isAssignmentOpen}
        onClose={() => setIsAssignmentOpen(false)}
        currentMembers={project.project_members || []}
      />
    </>
  )
}
