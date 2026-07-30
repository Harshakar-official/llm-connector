"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, MoreHorizontal, Shield, Trash2, UserPlus, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ActiveDot } from "@/components/shared/ActiveDot"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { cn, formatRelativeTime } from "@/lib/utils"
import { InviteUserModal } from "./InviteUserModal"
import { updateUserDetails, removeUser, bulkRemoveUsers } from "./actions"
import { toast } from "sonner"
import { type Role } from "@/lib/supabase/types"
import { useAuth } from "@/lib/hooks/useAuth"
import { hasPermission } from "@/lib/utils/permissions"

interface User {
  id: string
  full_name: string | null
  email: string
  avatar_url: string | null
  role: Role
  department_id: string | null
  is_active: boolean
  last_seen: string | null
  presence_status: string | null
  created_at: string
}

interface Props {
  initialUsers: User[]
}

const roleColors: Record<string, string> = {
  admin: "bg-severity-critical text-white",
  program_manager: "bg-severity-high text-white",
  security_engineer: "bg-severity-medium text-fg",
  developer: "bg-primary text-primary-fg",
  guest: "bg-fg-muted text-fg",
}

const roleLabels: Record<string, string> = {
  admin: "Admin",
  program_manager: "Program Manager",
  security_engineer: "Security Engineer",
  developer: "Developer",
  guest: "Guest",
}

export function UsersClient({ initialUsers }: Props) {
  const router = useRouter()
  const { profile: currentUserProfile } = useAuth()
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [inviteOpen, setInviteOpen] = useState(false)
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isBulkRemoving, setIsBulkRemoving] = useState(false)

  // User edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<string>("")
  const [isUpdating, setIsUpdating] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  // Listen for lightweight presence updates from RealtimeProvider.
  // Instead of a full router.refresh() on every 30s heartbeat across all pages,
  // only the users page responds to the PRESENCE_UPDATE custom event.
  useEffect(() => {
    const handlePresenceUpdate = () => {
      router.refresh()
    }
    window.addEventListener("vaptshield:presence-update", handlePresenceUpdate)
    return () => {
      window.removeEventListener("vaptshield:presence-update", handlePresenceUpdate)
    }
  }, [router])

  const filteredUsers = initialUsers.filter((user) => {
    const matchesSearch = !search ||
      user.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === "all" || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  // ─── Selection Logic ───
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Only select users that aren't self and aren't super admins
      const selectable = filteredUsers
        .filter(u => u.id !== currentUserProfile?.id && u.role !== 'super_admin')
        .map(u => u.id)
      setSelectedIds(selectable)
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectRow = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, userId])
    } else {
      setSelectedIds(prev => prev.filter(id => id !== userId))
    }
  }

  const handleBulkRemove = async () => {
    if (selectedIds.length === 0) return
    
    if (!confirm(`Are you sure you want to remove ${selectedIds.length} members? This cannot be undone.`)) {
        return
    }

    setIsBulkRemoving(true)
    try {
        const result = await bulkRemoveUsers(selectedIds)
        if (result.success) {
            toast.success(result.message || "Members removed")
            setSelectedIds([])
            router.refresh()
        } else {
            toast.error(result.error)
        }
    } catch (err) {
        toast.error("Failed to execute bulk removal")
    } finally {
        setIsBulkRemoving(false)
    }
  }

  const handleExportUsers = () => {
    const headers = ["Name", "Email", "Role", "Last Seen", "Joined At"]
    const csvData = filteredUsers.map(u => [
      u.full_name || "Unknown",
      u.email,
      u.role,
      u.last_seen || "Never",
      new Date(u.created_at).toLocaleDateString()
    ])

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => row.join(","))
    ].join("\n")

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `vaptshield_users_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("User roster exported successfully")
  }

  const handleOpenEditDialog = (user: User) => {
      setSelectedUser(user)
      setNewRole(user.role)
      setEditDialogOpen(true)
  }
const handleUserUpdate = async () => {
    if (!selectedUser || !newRole || !currentUserProfile || !currentUserProfile.org_id) return

    setIsUpdating(true)
    try {
        const result = await updateUserDetails(selectedUser.id, {
            role: newRole as Role,
            department_id: null
        })

        if (result.success) {
            // Note: changeUserRole (called by updateUserDetails) already creates
            // a notification server-side, so we don't duplicate it here.
            toast.success("User updated successfully")
            setEditDialogOpen(false)
            router.refresh()
        } else {
            toast.error(result.error || "Update failed")
        }
    } catch (error) {
        console.error("User update error:", error)
        toast.error("Failed to update user")
    } finally {
        setIsUpdating(false)
    }
  }

  const handleOpenRemoveDialog = (user: User) => {
      setSelectedUser(user)
      setRemoveDialogOpen(true)
  }

  const handleRemoveUser = async () => {
    if (!selectedUser) return

    setIsRemoving(true)
    try {
        const result = await removeUser(selectedUser.id)
        if (result.success) {
            toast.success("Member removed successfully")
            setRemoveDialogOpen(false)
            setSelectedUser(null)
            router.refresh()
        }
 else {
            toast.error(result.error)
            // Still close the dialog so it doesn't get stuck
            setRemoveDialogOpen(false)
            setSelectedUser(null)
        }
    } catch (error) {
        console.error("Remove user error:", error)
        toast.error("Failed to remove user")
        setRemoveDialogOpen(false)
        setSelectedUser(null)
    } finally {
        setIsRemoving(false)
    }
  }

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-fg-muted">Manage organization members</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportUsers} className="rounded-xl border-border hover:bg-bg-subtle font-bold text-xs uppercase tracking-tighter">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
            </Button>
            {hasPermission(currentUserProfile?.role as Role, 'users:invite_guest_security_eng') && (
            <Button onClick={() => setInviteOpen(true)} className="rounded-xl font-bold">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite User
            </Button>
            )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="program_manager">Program Manager</SelectItem>
            <SelectItem value="security_engineer">Security Engineer</SelectItem>
            <SelectItem value="developer">Developer</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <div className="bg-panel border border-border rounded-md overflow-hidden shadow-sm relative">
        {/* Bulk Actions Toolbar */}
        {selectedIds.length > 0 && (
            <div className="absolute top-0 left-0 right-0 h-[49px] bg-primary/10 backdrop-blur-md border-b border-primary/20 flex items-center px-4 justify-between z-20 animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-3">
                    <Checkbox 
                        checked={selectedIds.length > 0} 
                        onCheckedChange={() => setSelectedIds([])}
                        className="border-primary data-[state=checked]:bg-primary"
                    />
                    <span className="text-sm font-black text-primary uppercase italic tracking-tighter">
                        {selectedIds.length} Members Selected
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        className="h-8 rounded-lg font-black uppercase text-[10px] tracking-widest px-4 shadow-lg shadow-danger/20"
                        onClick={handleBulkRemove}
                        disabled={isBulkRemoving}
                    >
                        {isBulkRemoving ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Trash2 className="h-3 w-3 mr-2" />}
                        Remove Selected
                    </Button>
                </div>
            </div>
        )}

        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-bg-subtle/50">
              <th className="px-4 py-3 text-left w-10">
                  <Checkbox 
                    checked={selectedIds.length > 0 && selectedIds.length === filteredUsers.filter(u => u.id !== currentUserProfile?.id && u.role !== 'super_admin').length}
                    onCheckedChange={handleSelectAll}
                  />
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-fg-muted uppercase tracking-wider">User</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-fg-muted uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-fg-muted uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-fg-muted uppercase tracking-wider">Last Seen</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-fg-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredUsers.map((user) => {
              const isSelf = user.id === currentUserProfile?.id
              const canEditThisUser = currentUserProfile?.role === 'admin' || (currentUserProfile?.role === 'program_manager' && user.role !== 'admin' && user.role !== 'program_manager')
              const canDeleteThisUser = !isSelf && user.role !== 'super_admin' && (
                currentUserProfile?.role === 'admin' ||
                (currentUserProfile?.role === 'program_manager' && user.role !== 'admin' && user.role !== 'program_manager')
              )

              return (
                <tr key={user.id} className={cn(
                    "hover:bg-panel-hover transition-colors",
                    selectedIds.includes(user.id) && "bg-primary/5"
                )}>
                  <td className="px-4 py-3">
                      <Checkbox 
                        checked={selectedIds.includes(user.id)}
                        onCheckedChange={(checked) => handleSelectRow(user.id, !!checked)}
                        disabled={!canDeleteThisUser}
                      />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-9 w-9 border border-border">
                          <AvatarImage src={user.avatar_url || undefined} className="object-cover" />
                          <AvatarFallback className="text-xs font-bold bg-bg-subtle text-fg-muted">
                            {user.full_name?.slice(0, 2).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <ActiveDot
                          lastSeen={user.last_seen}
                          presenceStatus={user.presence_status}
                          size="sm"
                          showTooltip={false}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate flex items-center gap-2">
                            {user.full_name || "Unknown"}
                            {isSelf && <Badge variant="outline" className="text-[9px] uppercase h-4 px-1 bg-primary/5 text-primary border-primary/20">You</Badge>}
                        </div>
                        <div className="text-[10px] text-fg-muted font-mono truncate">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tighter border ${roleColors[user.role]}`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "h-2 w-2 rounded-full",
                            user.presence_status === 'active' ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse" : 
                            user.presence_status === 'away' ? "bg-warning" : "bg-fg-disabled"
                        )} />
                        <span className={cn(
                            "text-xs font-medium capitalize",
                            user.presence_status === 'active' ? "text-fg" : "text-fg-muted"
                        )}>
                          {user.presence_status || 'offline'}
                        </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-mono text-fg-subtle">
                      {user.last_seen ? formatRelativeTime(user.last_seen) : "Never"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (canEditThisUser || canDeleteThisUser) ? (
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-panel border-border w-44">
                            {canEditThisUser && (
                                <DropdownMenuItem onClick={() => handleOpenEditDialog(user)} className="gap-2">
                                <Shield className="h-3.5 w-3.5" /> Edit User
                                </DropdownMenuItem>
                            )}

                            {canDeleteThisUser && (
                                <>
                                    <DropdownMenuSeparator className="bg-border" />
                                    <DropdownMenuItem 
                                        onClick={() => handleOpenRemoveDialog(user)}
                                        className="text-danger focus:text-danger focus:bg-danger/10 gap-2"
                                    >
                                    <Trash2 className="h-3.5 w-3.5" /> Remove User
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <span className="text-[10px] font-bold text-fg-disabled uppercase italic">
                            {isSelf ? "Locked" : "Read Only"}
                        </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="px-4 py-12 text-center text-fg-muted flex flex-col items-center gap-2">
            <Search className="h-8 w-8 opacity-20" />
            <p className="text-sm">No users match your search criteria</p>
          </div>
        )}
      </div>

      {/* Remove User Confirmation */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
          <AlertDialogContent className="bg-panel border-border rounded-2xl">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-bold italic uppercase">Remove Member?</AlertDialogTitle>
                  <AlertDialogDescription className="text-fg-muted text-sm leading-relaxed">
                      This action will strictly revoke <strong>{selectedUser?.full_name || selectedUser?.email}</strong>'s access to this organization. 
                      They will no longer be able to view projects or findings. This action can be undone by re-inviting the user.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4 gap-2">
                  <AlertDialogCancel className="rounded-xl border-border hover:bg-bg-subtle text-[10px] font-black uppercase tracking-widest">
                      Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction 
                      onClick={(e) => {
                          e.preventDefault()
                          handleRemoveUser()
                      }}
                      disabled={isRemoving}
                      className="rounded-xl bg-danger hover:bg-danger/90 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                      {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Trash2 className="h-3.5 w-3.5 mr-2" />}
                      Remove Permanently
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      {/* User Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-md bg-panel border-border">
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Edit User Profile
                  </DialogTitle>
                  <DialogDescription>
                      Manage identity and access for <strong>{selectedUser?.full_name || selectedUser?.email}</strong>.
                  </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-5">
                  <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase text-fg-muted">Role / Permissions</label>
                      <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                          <SelectTrigger className="bg-bg border-border">
                              <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-panel border-border">
                              {/* Admin can promote to Admin, PM can only swap Guest/SE/Developer */}
                              {currentUserProfile?.role === 'admin' && <SelectItem value="admin">Admin</SelectItem>}
                              <SelectItem value="program_manager" disabled={currentUserProfile?.role !== 'admin'}>Program Manager</SelectItem>
                              <SelectItem value="security_engineer">Security Engineer</SelectItem>
                              <SelectItem value="developer">Developer</SelectItem>
                              <SelectItem value="guest">Guest</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>

                  <div className="bg-warning/5 border border-warning/20 p-3 rounded-md">
                      <p className="text-[11px] text-warning leading-relaxed flex gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span><strong>Security Protocol:</strong> Session may be invalidated if role is changed to ensure token integrity.</span>
                      </p>
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isUpdating}>
                      Cancel
                  </Button>
                  <Button onClick={handleUserUpdate} disabled={isUpdating || newRole === selectedUser?.role} className="font-bold">
                      {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Update User
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Invite Modal */}
      <InviteUserModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={() => router.refresh()}
        userRole={currentUserProfile?.role || 'guest'}
      />
    </div>
  )
}
