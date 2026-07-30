"use client"

import { useState, useActionState, useEffect, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { Plus, MoreHorizontal, Building, Users, HardDrive, Shield, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { getBrowserClient } from "@/lib/supabase/client"
import { createOrganizationAction } from "@/lib/supabase/super-admin-actions"

interface Organization {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
  org_quotas: {
    max_docker_containers: number
    max_users: number
    max_projects: number
    plan_tier: string
  } | null
  profiles: Array<{ count: number }> | null
}

interface Props {
  organizations: Organization[]
  totalUsers: number
  platformUsers: number
}

export function OrganizationsClient({ organizations, totalUsers, platformUsers }: Props) {
  const router = useRouter()
  const supabase = getBrowserClient()
  const [isPending, startTransition] = useTransition()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    industry: "",
    website: "",
  })
  const [pending, setPending] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orgToDelete, setOrgToDelete] = useState<{id: string, name: string} | null>(null)
  
  const [search, setSearch] = useState("")
  const [planFilter, setPlanFilter] = useState("all")
  
  const filteredOrganizations = organizations.filter(org => {
      const matchesSearch = org.name.toLowerCase().includes(search.toLowerCase()) || org.slug.toLowerCase().includes(search.toLowerCase())
      const matchesPlan = planFilter === "all" || org.org_quotas?.plan_tier === planFilter
      return matchesSearch && matchesPlan
  })

  // Server Action for creating organizations
  const [createState, createFormAction] = useActionState(createOrganizationAction, null)

  const industries = [
    "Technology", "Finance", "Healthcare", "Government", "E-commerce", "Education", "Other"
  ]

  // Handle server action result
  useEffect(() => {
    if (createState?.success) {
      toast.success(`Organization created successfully!`)
      setIsCreateOpen(false)
      setFormData({ name: "", slug: "", industry: "", website: "" })
      setPending(false)
      router.refresh()
    } else if (createState && !createState.success && createState.error) {
      toast.error(createState.error)
      setPending(false)
    }
  }, [createState, router])

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPending(true)
    const formDataToSubmit = new FormData(e.currentTarget)
    // Explicitly set values from state to ensure sync
    formDataToSubmit.set("name", formData.name)
    formDataToSubmit.set("slug", formData.slug)
    formDataToSubmit.set("industry", formData.industry)
    formDataToSubmit.set("website", formData.website)
    
    startTransition(() => {
        createFormAction(formDataToSubmit)
    })
  }

  // Auto-generate slug from name (client-side convenience)
  const handleNameChange = (name: string) => {
    // Strip HTML tags client-side for immediate feedback
    const cleanName = name.replace(/<[^>]*>/g, "")
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    setFormData({ ...formData, name: cleanName, slug })
  }

  const handleToggleActive = async (orgId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ is_active: !currentStatus })
        .eq("id", orgId)

      if (error) throw error

      toast.success(!currentStatus ? "Organization activated" : "Organization suspended")
      router.refresh()
    } catch (error) {
      toast.error("Failed to update organization status")
    }
  }

  const handleDeleteOrg = async () => {
    if (!orgToDelete) return

    try {
      const { error } = await supabase
        .from("organizations")
        .delete()
        .eq("id", orgToDelete.id)

      if (error) throw error

      toast.success(`Organization "${orgToDelete.name}" deleted`)
      setDeleteConfirmOpen(false)
      setOrgToDelete(null)
      router.refresh()
    } catch (error) {
      toast.error("Failed to delete organization")
    }
  }

  const promptDelete = (id: string, name: string) => {
      setOrgToDelete({ id, name })
      setDeleteConfirmOpen(true)
  }

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Organizations</h1>
          <p className="text-sm text-fg-muted mt-1">
            Manage all organizations on the platform
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Organization
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-panel border border-border rounded-md p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-2 text-fg-muted text-[10px] font-black uppercase tracking-widest">
            <Building className="h-3 w-3" />
            Organizations
          </div>
          <p className="text-2xl font-black font-mono mt-2 italic">{organizations.length}</p>
        </div>
        <div className="bg-panel border border-border rounded-md p-4 shadow-sm hover:shadow-md transition-all border-l-4 border-l-primary">
          <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest">
            <Users className="h-3 w-3" />
            Assigned Members
          </div>
          <p className="text-2xl font-black font-mono mt-2 italic text-primary">{totalUsers}</p>
        </div>
        <div className="bg-panel border border-border rounded-md p-4 shadow-sm hover:shadow-md transition-all border-l-4 border-l-success">
          <div className="flex items-center gap-2 text-fg-muted text-[10px] font-black uppercase tracking-widest">
            <Shield className="h-3 w-3" />
            Active
          </div>
          <p className="text-2xl font-black font-mono mt-2 italic text-success">
            {organizations.filter(o => o.is_active).length}
          </p>
        </div>
        <div className="bg-panel border border-border rounded-md p-4 shadow-sm hover:shadow-md transition-all border-l-4 border-l-danger">
          <div className="flex items-center gap-2 text-fg-muted text-[10px] font-black uppercase tracking-widest">
            <HardDrive className="h-3 w-3" />
            Suspended
          </div>
          <p className="text-2xl font-black font-mono mt-2 italic text-danger">
            {organizations.filter(o => !o.is_active).length}
          </p>
        </div>
        <div className="bg-panel border border-border rounded-md p-4 shadow-sm hover:shadow-md transition-all bg-primary/5">
          <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest">
            <Users className="h-3 w-3" />
            Platform Users
          </div>
          <p className="text-2xl font-black font-mono mt-2 italic">{platformUsers}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Input 
            placeholder="Search organizations..." 
            className="w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[180px] bg-bg border-border">
                  <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent className="bg-panel border-border text-fg">
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
          </Select>
        </div>
      </div>

      {/* Organizations List */}
      <div className="bg-panel border border-border rounded-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-bg-subtle border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Organization</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Slug</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Users</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-fg-muted uppercase">Created</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-fg-muted uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredOrganizations.map((org) => (
              <tr key={org.id} className="hover:bg-panel-hover">
                <td className="px-4 py-3">
                  <Link
                    href={`/super-admin/organizations/${org.id}`}
                    className="flex items-center gap-2 hover:text-primary"
                  >
                    <Building className="h-4 w-4 text-fg-muted" />
                    <span className="font-medium">{org.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-fg-muted">{org.slug}</td>
                <td className="px-4 py-3 font-mono text-sm">{org.profiles?.[0]?.count || 0}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-primary-subtle text-primary capitalize">
                    {org.org_quotas?.plan_tier || "free"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    org.is_active
                      ? "bg-success-bg text-success"
                      : "bg-danger-bg text-danger"
                  }`}>
                    {org.is_active ? "Active" : "Suspended"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-fg-muted" suppressHydrationWarning>
                  {new Date(org.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleToggleActive(org.id, org.is_active)}>
                        {org.is_active ? "Suspend" : "Activate"}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-danger"
                        onClick={() => promptDelete(org.id, org.name)}
                      >
                        Delete (irreversible)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {organizations.length === 0 && (
          <div className="text-center py-12 text-fg-muted">
            No organizations found. Create your first organization.
          </div>
        )}
      </div>

      {/* Create Organization Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleCreateSubmit}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="org-name">Organization Name *</Label>
              <Input
                id="org-name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Corporation"
                required
              />
            </div>
            <div>
              <Label htmlFor="org-slug">Slug *</Label>
              <Input
                id="org-slug"
                value={formData.slug}
                onChange={(e) => {
                  const cleanSlug = e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                  setFormData({ ...formData, slug: cleanSlug })
                }}
                placeholder="acme-corp"
                className="font-mono"
                required
              />
              <p className="text-xs text-fg-muted mt-1">URL-friendly identifier (auto-generated from name)</p>
            </div>
            <div>
              <Label htmlFor="org-industry">Industry</Label>
              <Select
                value={formData.industry}
                onValueChange={(val) => setFormData({ ...formData, industry: val })}
              >
                <SelectTrigger id="org-industry" className="bg-bg border-border">
                  <SelectValue placeholder="Select Industry" />
                </SelectTrigger>
                <SelectContent className="bg-panel border-border">
                  {industries.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="org-website">Website</Label>
              <Input
                id="org-website"
                value={formData.website}
                onChange={(e) => {
                  // Client-side HTML strip for immediate feedback
                  const clean = e.target.value.replace(/<[^>]*>/g, "")
                  setFormData({ ...formData, website: clean })
                }}
                placeholder="https://example.com"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating..." : "Create Organization"}
              </Button>
            </DialogFooter>
          </form>
          </DialogContent>
          </Dialog>

          {/* Delete Confirmation */}
          <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent className="bg-panel border-border">
              <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-danger">
                      <AlertTriangle className="h-5 w-5" />
                      Critical Action: Purge Organization
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                      This will permanently delete <strong>{orgToDelete?.name}</strong> and ALL associated findings, projects, reports, and member data. This action is irreversible.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel className="bg-bg border-border text-fg">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteOrg} className="bg-danger text-white hover:bg-danger/90">
                      Delete Everything
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
          </div>
          )
          }