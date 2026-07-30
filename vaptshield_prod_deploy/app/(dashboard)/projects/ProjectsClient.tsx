"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Search, FolderKanban, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ProjectCard } from "@/components/projects/ProjectCard"
import { ProjectForm } from "@/components/projects/ProjectForm"
import { getBrowserClient } from "@/lib/supabase/client"

interface Project {
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

interface Props {
  initialProjects: Project[]
  currentPage: number
  totalPages: number
  totalCount: number
  severityData: Record<string, { critical: number; high: number; medium: number; low: number; informational: number }>
  userRole: string
  currentUserId: string
}

export function ProjectsClient({
  initialProjects,
  currentPage,
  totalPages,
  totalCount,
  severityData: initialSeverityData,
  userRole,
  currentUserId,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [projects, setProjects] = useState(initialProjects)
  const [severityData, setSeverityData] = useState(initialSeverityData)
  const [search, setSearch] = useState(searchParams.get("search") || "")
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all")
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "all")
  const [formOpen, setFormOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof getBrowserClient>["channel"]> | null>(null)
  const vulnChannelRef = useRef<ReturnType<ReturnType<typeof getBrowserClient>["channel"]> | null>(null)

  // Only admin and program_manager can create projects
  const canCreateProject = userRole === "admin" || userRole === "program_manager"

  const handleEdit = (project: Project) => {
    setSelectedProject(project)
    setFormOpen(true)
  }

  const handleCloseForm = (open: boolean) => {
    setFormOpen(open)
    if (!open) setSelectedProject(null)
  }

  useEffect(() => {
    // Sync initial data
    setProjects(initialProjects)
  }, [initialProjects])

  useEffect(() => {
    // Sync initial severity data from server
    setSeverityData(initialSeverityData)
  }, [initialSeverityData])

  // ─── Realtime: Listen for project_members INSERT (assigned) and DELETE (unassigned) ───
  useEffect(() => {
    if (!currentUserId) return

    const supabase = getBrowserClient()

    const channel = supabase
      .channel(`project-members-${currentUserId}`)
      // INSERT: PM/Admin assigns current user to a project → add to grid
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_members",
          filter: `profile_id=eq.${currentUserId}`,
        },
        async (payload: unknown) => {
          const p = payload as { new: { project_id: string; profile_id: string } }
          const newProjectId = p.new.project_id

          // Avoid duplicate: check if project already in list
          if (projects.some(proj => proj.id === newProjectId)) return

          // Fetch the full project with members
          const { data: newProject } = await supabase
            .from("projects")
            .select(`
              *,
              creator:profiles!projects_created_by_fkey(id, full_name, avatar_url),
              project_members(
                profile_id,
                profiles:profiles!project_members_profile_id_fkey(id, full_name, avatar_url, role)
              )
            `)
            .eq("id", newProjectId)
            .single()

          if (newProject) {
            setProjects(prev => [newProject as Project, ...prev])
          }
        }
      )
      // DELETE: PM/Admin unassigns current user from a project → remove from grid
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "project_members",
        },
        (payload: unknown) => {
          const p = payload as { old: { project_id: string; profile_id: string } }
          const removedProjectId = p.old.project_id
          const removedProfileId = p.old.profile_id
          
          console.log(`[ProjectsClient] Received DELETE event. RemovedProjectId: ${removedProjectId}, RemovedProfileId: ${removedProfileId}`)

          // Only react if the unassigned user is the current user
          if (removedProfileId === currentUserId) {
            console.log(`[ProjectsClient] Unassigning current user from project: ${removedProjectId}`)
            setProjects(prev => prev.filter(proj => proj.id !== removedProjectId))
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, projects])

  // ─── Realtime: Listen for vulnerabilities INSERT/UPDATE/DELETE to update severity counts ───
  useEffect(() => {
    if (!currentUserId) return

    const supabase = getBrowserClient()

    const vulnChannel = supabase
      .channel(`vulns-severity-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vulnerabilities",
        },
        (payload: unknown) => {
          const p = payload as { new: { project_id: string; severity: string; status: string } }
          const { project_id, severity, status } = p.new
          // Only count active findings (open/in_review)
          if (status === "resolved" || status === "false_positive") return
          setSeverityData(prev => {
            const current = prev[project_id] || { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
            const validSeverities = ["critical", "high", "medium", "low", "informational"]
            if (!validSeverities.includes(severity)) return prev
            return {
              ...prev,
              [project_id]: {
                ...current,
                [severity]: current[severity as keyof typeof current] + 1,
              },
            }
          })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "vulnerabilities",
        },
        (payload: unknown) => {
          const p = payload as { old: { project_id: string; severity: string; status: string }; new: { project_id: string; severity: string; status: string } }
          const oldStatus = p.old.status
          const newStatus = p.new.status
          const oldSeverity = p.old.severity
          const newSeverity = p.new.severity
          const projectId = p.new.project_id
          const validSeverities = ["critical", "high", "medium", "low", "informational"]

          setSeverityData(prev => {
            const current = { ...(prev[projectId] || { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }) }

            // Remove old count if it was active
            const oldWasActive = oldStatus !== "resolved" && oldStatus !== "false_positive"
            if (oldWasActive && validSeverities.includes(oldSeverity)) {
              current[oldSeverity as keyof typeof current] = Math.max(0, current[oldSeverity as keyof typeof current] - 1)
            }

            // Add new count if it's now active
            const newIsActive = newStatus !== "resolved" && newStatus !== "false_positive"
            if (newIsActive && validSeverities.includes(newSeverity)) {
              current[newSeverity as keyof typeof current] = (current[newSeverity as keyof typeof current] || 0) + 1
            }

            return { ...prev, [projectId]: current }
          })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "vulnerabilities",
        },
        (payload: unknown) => {
          const p = payload as { old: { project_id: string; severity: string; status: string } }
          const { project_id, severity, status } = p.old
          // Only decrement if the deleted finding was active
          if (status === "resolved" || status === "false_positive") return
          const validSeverities = ["critical", "high", "medium", "low", "informational"]
          if (!validSeverities.includes(severity)) return
          setSeverityData(prev => {
            const current = prev[project_id]
            if (!current) return prev
            return {
              ...prev,
              [project_id]: {
                ...current,
                [severity]: Math.max(0, current[severity as keyof typeof current] - 1),
              },
            }
          })
        }
      )
      .subscribe()

    vulnChannelRef.current = vulnChannel

    return () => {
      supabase.removeChannel(vulnChannel)
    }
  }, [currentUserId])

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.set("page", "1") // Reset to page 1 on filter change
    router.push(`?${params.toString()}`)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateParams("search", search)
  }

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", newPage.toString())
    router.push(`?${params.toString()}`)
  }

  // Status options
  const statuses = [
    { value: "all", label: "All Status" },
    { value: "planning", label: "Planning" },
    { value: "active", label: "Active" },
    { value: "in_review", label: "In Review" },
    { value: "completed", label: "Completed" },
    { value: "archived", label: "Archived" },
  ]

  // Type options
  const types = [
    { value: "all", label: "All Types" },
    { value: "web_app", label: "Web Application" },
    { value: "mobile_app", label: "Mobile Application" },
    { value: "api", label: "API" },
    { value: "network", label: "Network" },
    { value: "cloud", label: "Cloud" },
    { value: "red_team", label: "Red Team" },
    { value: "thick_client", label: "Thick Client" },
  ]

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Projects</h1>
          <p className="text-sm text-fg-muted">Manage security assessments</p>
        </div>
        {canCreateProject && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </form>

        <Select 
            value={statusFilter} 
            onValueChange={(val) => {
                setStatusFilter(val)
                updateParams("status", val)
            }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select 
            value={typeFilter} 
            onValueChange={(val) => {
                setTypeFilter(val)
                updateParams("type", val)
            }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Project Type" />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== "all" || typeFilter !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("all")
              setTypeFilter("all")
              setSearch("")
              router.push("?")
            }}
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-fg-muted">
        Showing {projects.length} of {totalCount} projects
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderKanban className="h-12 w-12 text-fg-subtle mb-4" />
          <h3 className="text-lg font-medium mb-2">No projects found</h3>
          <p className="text-sm text-fg-muted mb-4">
            {search || statusFilter !== "all" || typeFilter !== "all"
              ? "Try adjusting your filters"
              : "Create your first project to get started"}
          </p>
          {canCreateProject && !search && statusFilter === "all" && typeFilter === "all" && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => {
            // Combine creator and members for avatars, removing duplicates
            const allMembers: Array<{ id: string; full_name: string; avatar_url: string | null; role?: string }> = [
                ...(project.creator ? [project.creator] : []),
                ...(project.project_members ?? []).map(m => m.profiles).filter(p => p !== null)
            ]
            
            // Unique by ID
            const uniqueMembers = Array.from(new Map(allMembers.map((m: unknown) => {
                const member = m as { id: string }
                return [member.id, m]
            })).values())

            return (
              <ProjectCard
                key={project.id}
                project={project}
                severityCounts={severityData[project.id] || { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }}
                members={uniqueMembers as Array<{ id: string; full_name: string; avatar_url: string | null; role: string }>}
                userRole={userRole as 'admin' | 'program_manager' | 'security_engineer' | 'guest'}
                currentUserId={currentUserId}
                onEdit={handleEdit}
              />
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => handlePageChange(currentPage - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-fg-muted">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Project Form Modal */}
      <ProjectForm
        open={formOpen}
        onOpenChange={handleCloseForm}
        project={selectedProject}
        onSuccess={() => {
            handleCloseForm(false)
            router.refresh()
        }}
      />
    </div>
  )
}
