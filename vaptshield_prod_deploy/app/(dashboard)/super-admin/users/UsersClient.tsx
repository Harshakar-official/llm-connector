"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Users, Building, Mail, Shield, UserMinus, Search, Trash2, Loader2, AlertTriangle, Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ActiveDot } from "@/components/shared/ActiveDot"
import { ROLE_BADGE_CLASSES } from "@/lib/utils/permissions"
import type { Role } from "@/lib/supabase/types"
import { deleteUserAction } from "@/lib/supabase/super-admin-actions"
import { formatRelativeTime } from "@/lib/utils"
import { toast } from "sonner"

interface UserProfile {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  role: string
  org_id: string | null
  created_at: string
  last_seen: string | null
  presence_status: string | null
  organizations: { name: string } | null
}

export function UsersClient({ initialUsers }: { initialUsers: UserProfile[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "unassigned" | "assigned">("all")
  const [orgFilter, setOrgFilter] = useState<string>(searchParams.get("org") || "all")
  
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; userId: string; userName: string }>({
    open: false,
    userId: "",
    userName: ""
  })
  const [isDeleting, setIsDeleting] = useState(false)

  // Get unique organizations for the filter dropdown
  const uniqueOrgs = Array.from(new Set(initialUsers.filter(u => u.organizations).map(u => JSON.stringify({ id: u.org_id, name: u.organizations?.name }))))
    .map(str => JSON.parse(str))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Listen for lightweight presence updates
  useEffect(() => {
    const handlePresenceUpdate = () => {
      router.refresh()
    }
    window.addEventListener("vaptshield:presence-update", handlePresenceUpdate)
    return () => {
      window.removeEventListener("vaptshield:presence-update", handlePresenceUpdate)
    }
  }, [router])

  useEffect(() => {
      setUsers(initialUsers)
  }, [initialUsers])

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.full_name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    
    const matchesOrg = orgFilter === "all" || user.org_id === orgFilter

    if (filter === "unassigned") return matchesSearch && matchesOrg && !user.org_id && user.role !== "super_admin"
    if (filter === "assigned") return matchesSearch && matchesOrg && !!user.org_id
    return matchesSearch && matchesOrg
  })

  const unassignedCount = users.filter(u => !u.org_id && u.role !== "super_admin").length

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteUserAction(deleteDialog.userId)
      if (result.success) {
        toast.success(result.message)
        setDeleteDialog({ ...deleteDialog, open: false })
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Failed to purge user")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleExport = () => {
    if (filteredUsers.length === 0) {
      toast.error("No data to export")
      return
    }
    try {
      const headers = ["Full Name", "Email", "Role", "Organization", "Last Seen", "Joined At"]
      const rows = filteredUsers.map(u => [
        u.full_name || "Unknown",
        u.email,
        u.role,
        u.organizations?.name || "N/A",
        u.last_seen || "Never",
        new Date(u.created_at).toLocaleDateString()
      ])
      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n")
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement("a")
      link.setAttribute("href", URL.createObjectURL(blob))
      link.setAttribute("download", `vaptshield_platform_users_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success("User list exported")
    } catch {
      toast.error("Export failed")
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Platform Users</h1>
          <p className="text-sm text-fg-muted mt-1">Manage all accounts across the entire platform</p>
        </div>
        <Button onClick={handleExport} variant="outline" className="rounded-xl font-bold text-xs uppercase tracking-tighter">
          <Download className="h-4 w-4 mr-2" />
          Export Roster
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4 w-full md:w-auto flex-1">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted" />
              <Input 
                placeholder="Search by name or email..." 
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-56">
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                  <SelectTrigger className="bg-bg border-border text-[10px] font-black uppercase tracking-widest h-9">
                      <SelectValue placeholder="All Organizations" />
                  </SelectTrigger>
                  <SelectContent className="bg-panel border-border text-fg max-h-64">
                      <SelectItem value="all">All Organizations</SelectItem>
                      {uniqueOrgs.map(org => org.id && org.name && (
                          <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
            </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button 
            variant={filter === "all" ? "default" : "outline"} 
            size="sm"
            onClick={() => setFilter("all")}
          >
            All Accounts
          </Button>
          <div className="group relative flex">
            <Button 
              variant={filter === "unassigned" ? "default" : "outline"} 
              size="sm"
              onClick={() => setFilter("unassigned")}
            >
              Pending Assignment ({unassignedCount})
            </Button>
            <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 w-max opacity-0 transition-opacity group-hover:opacity-100 bg-panel border border-border text-xs px-2 py-1 rounded shadow-lg z-10 text-fg-muted font-medium">
                Excludes Platform Staff (Super Admins)
            </div>
          </div>
          <Button 
            variant={filter === "assigned" ? "default" : "outline"} 
            size="sm"
            onClick={() => setFilter("assigned")}
          >
            Assigned
          </Button>
        </div>
      </div>

      <div className="bg-panel border border-border rounded-md overflow-hidden shadow-sm">
        <table className="w-full">
          <thead className="bg-bg-subtle/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-fg-muted uppercase tracking-wider">User</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-fg-muted uppercase tracking-wider">Platform Role</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-fg-muted uppercase tracking-wider">Organization</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-fg-muted uppercase tracking-wider">Last Seen</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-fg-muted uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-panel-hover transition-colors">
                <td className="px-4 py-3 text-fg">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.avatar_url || ""} />
                        <AvatarFallback className="text-xs font-bold bg-bg-subtle text-fg-muted">
                          {user.full_name?.slice(0, 2).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <ActiveDot presenceStatus={user.presence_status} lastSeen={user.last_seen} size="sm" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">{user.full_name || "Unidentified User"}</div>
                      <div className="text-[10px] text-fg-muted font-mono">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={`text-[10px] font-bold uppercase ${ROLE_BADGE_CLASSES[user.role as Role] || "bg-bg-subtle text-fg-muted"}`}>
                    {user.role.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {user.organizations ? (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-fg">
                      <Building className="h-3 w-3 text-primary/60" />
                      {user.organizations.name}
                    </div>
                  ) : (
                    <span className="text-xs text-fg-disabled italic">Platform Staff</span>
                  )}
                </td>
                <td className="px-4 py-3 text-fg">
                  <span className="text-[10px] font-mono text-fg-subtle">
                    {user.last_seen ? formatRelativeTime(user.last_seen) : "Never"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {user.role !== 'super_admin' ? (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setDeleteDialog({ open: true, userId: user.id, userName: user.full_name || user.email })}
                      className="text-danger hover:bg-danger/10 h-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] uppercase font-black italic">Locked</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent className="bg-panel border-border text-fg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger">
              <AlertTriangle className="h-5 w-5" />
              Purge User Account
            </DialogTitle>
            <DialogDescription className="text-fg-muted">
              You are about to permanently delete <strong>{deleteDialog.userName}</strong>. This will remove their profile from the database and trigger a hard-delete in the auth system.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ ...deleteDialog, open: false })} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Purge User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
