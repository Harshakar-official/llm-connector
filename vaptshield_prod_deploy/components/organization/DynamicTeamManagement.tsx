"use client"

import { useState, useEffect } from "react"
import { Users, Trash2, Plus, LayoutGrid, Loader2, Sparkles, Pencil } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getBrowserClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createTeamAction, deleteTeamAction, updateTeamAction } from "@/lib/supabase/team-actions"
import { useRouter } from "next/navigation"
import { createNotification } from "@/lib/supabase/notification-actions"
import { useAuth } from "@/lib/hooks/useAuth"

interface TeamMember {
  profile_id: string
  profiles: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
    role: string
  }
}

interface Team {
  id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  members: TeamMember[]
}

interface User {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  role: string
}

export function DynamicTeamManagement({ orgId }: { orgId: string }) {
  const supabase = getBrowserClient()
  const router = useRouter()
  const { profile: currentUserProfile } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [orgUsers, setOrgUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  
  // Edit Team State
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    member_ids: [] as string[]
  })
  
  // New Team Form
  const [newTeam, setNewTeam] = useState({
    name: "",
    description: "",
    member_ids: [] as string[]
  })

  useEffect(() => {
    fetchTeamsAndUsers()
  }, [])

  async function fetchTeamsAndUsers() {
    try {
      setLoading(true)
      
      // 1. Fetch Teams with Members — PM isolation: PM sees only own teams, admin sees all
      let query = supabase
        .from("teams")
        .select(`
          *,
          members:team_members(
            profile_id,
            profiles:profiles(id, full_name, email, avatar_url, role)
          )
        `)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })

      // PM isolation: program managers only see teams they created
      if (currentUserProfile?.role === 'program_manager' && currentUserProfile?.id) {
        query = query.eq("created_by", currentUserProfile.id)
      }

      const { data: teamsData, error: teamsError } = await query

      if (teamsError) throw teamsError

      // 2. Fetch Potential Members (Security Engineers, Developers & Guests)
      const { data: usersData, error: usersError } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, role")
        .eq("org_id", orgId)
        .in("role", ["security_engineer", "developer", "guest"])
        .eq("is_active", true)

      if (usersError) throw usersError

      setTeams(teamsData || [])
      setOrgUsers(usersData || [])
    } catch (err) {
      console.error("Fetch teams error:", err)
      toast.error("Failed to load teams")
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateTeam() {
    if (!newTeam.name) return toast.error("Team name is required")
    if (newTeam.member_ids.length === 0) return toast.error("Select at least one member")
    
    setCreating(true)
    try {
      const result = await createTeamAction(newTeam)
      if (result.success) {
        // ─── ENTERPRISE NOTIFICATIONS: TEAM ASSIGNMENT ───
        if (currentUserProfile?.org_id) {
            await Promise.all(newTeam.member_ids.map(userId => 
                createNotification({
                    user_id: userId,
                    org_id: currentUserProfile.org_id!,
                    title: "Added to Team",
                    message: `You have been added to the functional team: ${newTeam.name}.`,
                    type: 'member_assigned'
                })
            ))
        }

        toast.success("Functional team created", {
            icon: <Sparkles className="h-4 w-4 text-primary" />
        })
        setIsCreateOpen(false)
        setNewTeam({ name: "", description: "", member_ids: [] })
        fetchTeamsAndUsers()
      } else {
        toast.error(result.error || "Failed to create team")
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || "An unexpected error occurred")
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteTeam(id: string) {
    setDeletingId(id)
    try {
      const result = await deleteTeamAction(id)
      if (result.success) {
        toast.success("Team deleted")
        fetchTeamsAndUsers()
      } else {
        toast.error(result.error)
      }
    } catch (err) {
      toast.error("Failed to delete team")
    } finally {
      setDeletingId(null)
    }
  }

  function openEditDialog(team: Team) {
    setEditingTeam(team)
    setEditForm({
      name: team.name,
      description: team.description || "",
      member_ids: team.members.map(m => m.profile_id)
    })
    setIsEditOpen(true)
  }

  async function handleUpdateTeam() {
    if (!editingTeam) return
    if (!editForm.name) return toast.error("Team name is required")
    if (editForm.member_ids.length === 0) return toast.error("Select at least one member")
    
    setUpdatingId(editingTeam.id)
    try {
      const result = await updateTeamAction(editingTeam.id, editForm)
      if (result.success) {
        toast.success("Team updated")
        setIsEditOpen(false)
        setEditingTeam(null)
        fetchTeamsAndUsers()
      } else {
        toast.error(result.error || "Failed to update team")
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || "An unexpected error occurred")
    } finally {
      setUpdatingId(null)
    }
  }

  const toggleMemberSelection = (userId: string) => {
    setNewTeam(prev => ({
      ...prev,
      member_ids: prev.member_ids.includes(userId)
        ? prev.member_ids.filter(id => id !== userId)
        : [...prev.member_ids, userId]
    }))
  }

  if (loading && teams.length === 0) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" /></div>

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Functional Teams</h3>
          <p className="text-sm text-fg-muted">Create and manage agile teams for your projects.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <Card className="bg-panel border-dashed border-2">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-bg-subtle flex items-center justify-center">
              <LayoutGrid className="h-6 w-6 text-fg-subtle" />
            </div>
            <div>
              <p className="font-bold">No functional teams found</p>
              <p className="text-xs text-fg-muted">PMs can create teams here and use them to bulk-assign members to projects.</p>
            </div>
            <Button variant="outline" onClick={() => setIsCreateOpen(true)}>Create your first team</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <Card key={team.id} className="bg-panel border-border hover:border-primary/50 transition-colors group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="h-8 w-8 rounded bg-primary-subtle flex items-center justify-center">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-fg-muted hover:text-primary"
                      onClick={() => openEditDialog(team)}
                      disabled={deletingId === team.id || updatingId === team.id}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-fg-muted hover:text-danger"
                      onClick={() => handleDeleteTeam(team.id)}
                      disabled={deletingId === team.id || updatingId === team.id}
                    >
                      {deletingId === team.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-base mt-3">{team.name}</CardTitle>
                <CardDescription className="text-[11px] line-clamp-1">{team.description || "No description"}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mt-2">
                  <div className="flex -space-x-2 overflow-hidden">
                    {team.members.slice(0, 5).map((m) => (
                      <Avatar key={m.profile_id} className="h-7 w-7 border-2 border-panel">
                        <AvatarImage src={m.profiles.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px] bg-bg-subtle text-fg-muted">
                          {m.profiles.full_name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {team.members.length > 5 && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-panel bg-bg-muted text-[10px] font-bold text-fg-muted">
                        +{team.members.length - 5}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-subtle font-medium">Team Size</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {team.members.length} Members
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-panel border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Create Functional Team</DialogTitle>
            <DialogDescription>Group security engineers across departments into a specialized unit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold text-fg-muted">Team Name</Label>
              <Input 
                placeholder="e.g. Red Team Alpha" 
                value={newTeam.name} 
                onChange={(e) => setNewTeam({...newTeam, name: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold text-fg-muted">Description (Optional)</Label>
              <Input 
                placeholder="Managed by Program Manager" 
                value={newTeam.description} 
                onChange={(e) => setNewTeam({...newTeam, description: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-fg-muted">Select Members ({newTeam.member_ids.length})</Label>
                <div className="border border-border rounded-md bg-bg p-2 max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                    {orgUsers.length === 0 ? (
                        <p className="text-xs text-center py-4 text-fg-muted">No Security Engineers found in organization.</p>
                    ) : (
                        orgUsers.map(user => {
                            const isSelected = newTeam.member_ids.includes(user.id)
                            return (
                                <div 
                                    key={user.id} 
                                    className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-panel-hover border border-transparent'}`}
                                    onClick={() => toggleMemberSelection(user.id)}
                                >
                                    <Avatar className="h-6 w-6">
                                        <AvatarImage src={user.avatar_url || undefined} />
                                        <AvatarFallback className="text-[10px]">{user.full_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{user.full_name}</p>
                                    </div>
                                    {isSelected && <Sparkles className="h-3 w-3 text-primary animate-pulse" />}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTeam} disabled={creating || newTeam.member_ids.length === 0}>
              {creating ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingTeam(null) }}>
        <DialogContent className="bg-panel border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
            <DialogDescription>Update team name, description, or members.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold text-fg-muted">Team Name</Label>
              <Input
                placeholder="e.g. Red Team Alpha"
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold text-fg-muted">Description (Optional)</Label>
              <Input
                placeholder="Managed by Program Manager"
                value={editForm.description}
                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-fg-muted">Select Members ({editForm.member_ids.length})</Label>
                <div className="border border-border rounded-md bg-bg p-2 max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                    {orgUsers.length === 0 ? (
                        <p className="text-xs text-center py-4 text-fg-muted">No Security Engineers found in organization.</p>
                    ) : (
                        orgUsers.map(user => {
                            const isSelected = editForm.member_ids.includes(user.id)
                            return (
                                <div
                                    key={user.id}
                                    className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-panel-hover border border-transparent'}`}
                                    onClick={() => {
                                      setEditForm(prev => ({
                                        ...prev,
                                        member_ids: prev.member_ids.includes(user.id)
                                          ? prev.member_ids.filter(id => id !== user.id)
                                          : [...prev.member_ids, user.id]
                                      }))
                                    }}
                                >
                                    <Avatar className="h-6 w-6">
                                        <AvatarImage src={user.avatar_url || undefined} />
                                        <AvatarFallback className="text-[10px]">{user.full_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{user.full_name}</p>
                                    </div>
                                    {isSelected && <Sparkles className="h-3 w-3 text-primary animate-pulse" />}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditOpen(false); setEditingTeam(null) }}>Cancel</Button>
            <Button onClick={handleUpdateTeam} disabled={updatingId !== null || editForm.member_ids.length === 0}>
              {updatingId !== null ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
