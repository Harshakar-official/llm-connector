"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Check, Users, Loader2, Sparkles, LayoutGrid, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useSounds } from "@/lib/hooks/useSounds"
import { assignMembers } from "@/app/(dashboard)/projects/actions"
import { assignTeamToProjectAction } from "@/lib/supabase/team-actions"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { hasPermission } from "@/lib/utils/permissions"
import { Role } from "@/lib/supabase/types"
import { createNotification } from "@/lib/supabase/notification-actions"
import { useAuth } from "@/lib/hooks/useAuth"

interface User {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  role: string
  department: string | null
}

interface Team {
  id: string
  name: string
  members: Array<{ profile_id: string }>
}

interface Props {
  projectId: string
  isOpen: boolean
  onClose: () => void
  currentMembers: Array<{ profile_id: string; profiles: { id: string; full_name: string; avatar_url: string | null; role: string } }>
}

export function MemberAssignment({ projectId, isOpen, onClose, currentMembers }: Props) {
  const supabase = getBrowserClient()
  const router = useRouter()
  const { profile: currentUserProfile } = useAuth()
  const { playSound } = useSounds()
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [viewMode, setViewMode] = useState<"users" | "teams">("users")
  const [orgUsers, setOrgUsers] = useState<User[]>([])
  const [orgTeams, setOrgTeams] = useState<Team[]>([])
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  // Fetch org users and teams on mount
  useEffect(() => {
    async function fetchData() {
      // Get current user's org
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        setHasAccess(false)
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id, role")
        .eq("id", user.id)
        .single()

      if (!profile?.org_id) {
        setLoading(false)
        setHasAccess(false)
        return
      }

      // ─── RBAC Guard Check (Z+ Security) ───
      const role = profile.role as Role
      const canAssign = hasPermission(role, "projects:assign_members")
      
      console.log(`[MemberAssignment] User: ${user.email}, Role: ${role}, CanAssign: ${canAssign}`)
      setHasAccess(canAssign)

      if (!canAssign) {
        setLoading(false)
        return
      }

      // 1. Get all org users
      const { data: users } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, role, department")
        .eq("org_id", profile.org_id)
        .eq("is_active", true)
        .neq("role", "super_admin")
        .neq("id", user.id)
        .order("full_name")

      // 2. Get org functional teams
      const { data: teams } = await supabase
        .from("teams")
        .select(`
          id, 
          name,
          members:team_members(profile_id)
        `)
        .eq("org_id", profile.org_id)

      if (users) {
        // ─── Role Hierarchy Filter ───
        const currentUserRole = profile.role
        let filteredByRole = users

        // Enterprise Logic: 
        // Admin: can see/assign everyone
        // PM: can only see/assign SE, Guest, and Developer
        if (currentUserRole === "program_manager") {
          filteredByRole = users.filter((u: { role: string }) => 
            u.role === "security_engineer" || u.role === "guest" || u.role === "developer"
          )
        } else if (currentUserRole !== "admin") {
          // SE and Guest shouldn't even reach here, but for safety:
          filteredByRole = []
        }

        setOrgUsers(filteredByRole)
        setOrgTeams(teams || [])

        // Set initial selected members
        const memberIds = currentMembers.map(m => m.profile_id)
        setSelectedMembers(new Set(memberIds))
      }
      setLoading(false)
    }

    if (isOpen) {
      setLoading(true)
      fetchData()
    }
  }, [isOpen, currentMembers, supabase])

  // Get unique departments for tabs
  const departments = useMemo(() => {
    const deps = new Set<string>()
    orgUsers.forEach(u => {
        if (u.department) deps.add(u.department)
    })
    return Array.from(deps).sort()
  }, [orgUsers])

  const filteredUsers = orgUsers.filter((user) => {
    const matchesSearch = 
        user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesTab = 
        activeTab === "all" || 
        (activeTab === "none" && !user.department) ||
        user.department === activeTab
    
    return matchesSearch && matchesTab
  })

  const toggleMember = (userId: string) => {
    const newSelected = new Set(selectedMembers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedMembers(newSelected)
  }

  const handleSave = async () => {
    setSaving(true)

    try {
        const memberIds = Array.from(selectedMembers)
        const result = await assignMembers(projectId, memberIds)

        if (!result.success) {
            throw new Error(result.error)
        }

        // Enterprise Feedback
        playSound('success')
        toast.success("Team updated", {
            description: `Successfully updated member assignments.`,
            icon: <Sparkles className="h-4 w-4 text-primary" />
        })

        onClose()
        router.refresh()
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update team"
        console.error("Failed to update team:", err)
        toast.error("Failed to update team", {
            description: msg
        })
    } finally {
        setSaving(false)
    }
  }

  const handleAssignTeam = async (teamId: string) => {
    setSaving(true)
    try {
        const result = await assignTeamToProjectAction(teamId, projectId)
        if (result.success) {
            playSound('success')
            toast.success("Team assigned", {
                description: `Added ${result.count} members from the team.`,
                icon: <LayoutGrid className="h-4 w-4 text-primary" />
            })
            onClose()
            router.refresh()
        } else {
            toast.error(result.error)
        }
    } catch (err) {
        toast.error("Failed to assign team")
    } finally {
        setSaving(false)
    }
  }

  const roleColors: Record<string, string> = {
    admin: "bg-primary text-primary-fg",
    program_manager: "bg-chart-4 text-white",
    security_engineer: "bg-chart-2 text-white",
    developer: "bg-orange-500 text-white",
    guest: "bg-fg-muted text-fg",
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Assign Project Members</DialogTitle>
            <div className="flex bg-bg-subtle rounded-md p-0.5 border border-border">
                <Button 
                    variant={viewMode === 'users' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="h-7 px-2 text-[10px] uppercase font-bold"
                    onClick={() => setViewMode('users')}
                >
                    <Users className="h-3 w-3 mr-1.5" /> Users
                </Button>
                <Button 
                    variant={viewMode === 'teams' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="h-7 px-2 text-[10px] uppercase font-bold"
                    onClick={() => setViewMode('teams')}
                >
                    <LayoutGrid className="h-3 w-3 mr-1.5" /> Teams
                </Button>
            </div>
          </div>
          <DialogDescription>
            {viewMode === 'users' 
                ? "Select individual members from your organization." 
                : "Select a functional team for bulk assignment."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasAccess === false ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-danger/10 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6 text-danger" />
              </div>
              <div>
                <p className="text-sm font-bold text-fg">Access Denied</p>
                <p className="text-xs text-fg-muted max-w-[240px] mt-1">
                  You do not have the required permissions to manage project team members.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : viewMode === 'users' ? (
            <>
              {/* Search & Tabs */}
              <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted" />
                    <Input
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {departments.length > 0 && (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="w-full justify-start overflow-x-auto h-9 bg-bg-subtle p-1 gap-1">
                            <TabsTrigger value="all" className="text-[10px] uppercase h-7 px-3">All</TabsTrigger>
                            {departments.map(dep => (
                                <TabsTrigger key={dep} value={dep} className="text-[10px] uppercase h-7 px-3">
                                    {dep}
                                </TabsTrigger>
                            ))}
                            <TabsTrigger value="none" className="text-[10px] uppercase h-7 px-3">Other</TabsTrigger>
                        </TabsList>
                    </Tabs>
                )}
              </div>

              {/* User list */}
              <div className="max-h-64 overflow-y-auto space-y-2 scrollbar-thin">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-8 space-y-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs text-fg-muted">Fetching organization members...</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center text-fg-muted py-8">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No users found</p>
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = selectedMembers.has(user.id)
                    return (
                      <div
                        key={user.id}
                        className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary-subtle shadow-sm"
                            : "border-border hover:bg-panel-hover"
                        }`}
                        onClick={() => toggleMember(user.id)}
                      >
                        <div className="flex-shrink-0">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.full_name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-primary-subtle flex items-center justify-center text-xs font-bold text-primary">
                              {user.full_name?.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.full_name}</p>
                          <p className="text-[10px] text-fg-subtle font-mono truncate">{user.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={cn("text-[9px] uppercase font-black tracking-widest px-2 py-0.5 border-none h-5", roleColors[user.role] || "bg-fg-muted")}>
                            {user.role === 'program_manager' ? 'Program Manager' : 
                             user.role === 'security_engineer' ? 'Security Engineer' : 
                             user.role.replace("_", " ")}
                          </Badge>
                          {isSelected ? (
                            <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center animate-in zoom-in-50 duration-200">
                                <Check className="h-3 w-3 text-white" />
                            </div>
                          ) : (
                            <div className="h-5 w-5 rounded-full border border-border" />
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2 scrollbar-thin py-2">
               {orgTeams.length === 0 ? (
                   <div className="text-center text-fg-muted py-12 border border-dashed rounded-md">
                       <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-10" />
                       <p className="text-sm">No functional teams defined</p>
                       <p className="text-[11px] mt-1">Create teams in Organization settings first.</p>
                   </div>
               ) : (
                   orgTeams.map(team => (
                       <div key={team.id} className="p-3 border border-border rounded-md bg-panel hover:border-primary transition-colors flex items-center justify-between group">
                           <div>
                               <p className="text-sm font-bold">{team.name}</p>
                               <p className="text-[10px] text-fg-muted">{team.members.length} Members</p>
                           </div>
                           <Button 
                             size="sm" 
                             variant="outline" 
                             className="h-7 text-[10px] uppercase font-bold group-hover:bg-primary group-hover:text-primary-fg transition-colors"
                             onClick={() => handleAssignTeam(team.id)}
                             disabled={saving}
                           >
                               Assign Team
                           </Button>
                       </div>
                   ))
               )}
            </div>
          )}
        </div>

        <DialogFooter>
          {hasAccess !== false && (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              {viewMode === 'users' && (
                  <Button onClick={handleSave} disabled={saving || loading}>
                    {saving ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Updating...
                        </>
                    ) : "Update Members"}
                  </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
