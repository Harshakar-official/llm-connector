"use client"

import { useState, useEffect } from "react"
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
import { Building2, Save, Loader2, UserCog, Zap, Globe, Tag, Sparkles, Check, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { updateOrganizationAction } from "@/lib/supabase/organization-actions"
import { assignOrgAdminAction } from "@/lib/supabase/super-admin-actions"
import { upgradeOrganizationPlan } from "@/lib/supabase/billing-actions"
import { PlanGrid, type PlanTier } from "@/components/shared/PricingCards"
import { cn } from "@/lib/utils"

interface OrgManagementProps {
  org: { id: string; name: string; slug: string; industry?: string | null; website?: string | null }
  quotas: { plan_tier?: string | null; max_users?: number; max_projects?: number } | null
}

export function OrgManagement({ org, quotas }: OrgManagementProps) {
  const router = useRouter()
  
  // Normalize "free" to "starter" for UI consistency
  const getNormalizedTier = (tier: string | null | undefined) => {
    if (!tier || tier === "free") return "starter"
    return tier
  }

  const [activeTier, setActiveTier] = useState(getNormalizedTier(quotas?.plan_tier))
  const [loading, setLoading] = useState<string | null>(null)
  
  // Sync state if props change (e.g. from realtime update)
  useEffect(() => {
    if (quotas?.plan_tier) {
      setActiveTier(getNormalizedTier(quotas.plan_tier))
    }
  }, [quotas?.plan_tier])

  // Form States
  const [formData, setFormData] = useState({
    name: org.name,
    slug: org.slug,
    industry: org.industry || "",
    website: org.website || ""
  })
  const [adminEmail, setAdminEmail] = useState("")
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false)

  const industries = [
    "Technology", "Finance", "Healthcare", "Government", "E-commerce", "Education", "Other"
  ]

  const hasChanges = 
    formData.name !== org.name || 
    formData.slug !== org.slug || 
    formData.industry !== (org.industry || "") || 
    formData.website !== (org.website || "")

  const handleUpdateOrg = async () => {
    setLoading('save')
    const result = await updateOrganizationAction(org.id, formData)
    if (result.success) {
      toast.success(result.message)
      router.refresh()
    } else {
      toast.error(result.error)
    }
    setLoading(null)
  }

  const handleAssignAdmin = async () => {
    const trimmedEmail = adminEmail.trim().toLowerCase()
    setLoading('admin')
    const result = await assignOrgAdminAction(org.id, trimmedEmail)
    if (result.success) {
      toast.success(result.message)
      setAdminEmail("")
      setTransferConfirmOpen(false)
      router.refresh()
    } else {
      toast.error(result.error)
    }
    setLoading(null)
  }

  const promptTransfer = () => {
    if (!adminEmail) return
    const trimmedEmail = adminEmail.trim().toLowerCase()
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_RE.test(trimmedEmail)) {
      toast.error("Please enter a valid email address.")
      return
    }
    setTransferConfirmOpen(true)
  }

  const handleTierChange = async (tier: PlanTier) => {
    setLoading(tier)
    const result = await upgradeOrganizationPlan(org.id, tier)
    if (result.success) {
      setActiveTier(tier) // Instant local update
      toast.success(`Platform Override: Switched to ${tier} tier`, {
          icon: <Sparkles className="h-4 w-4 text-warning" />
      })
      router.refresh()
    } else {
      toast.error(result.error)
    }
    setLoading(null)
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* 1. Organization Profile Settings */}
      <div className="bg-panel border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-bg-subtle/30 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Organization Profile
            </h3>
            <Button 
                onClick={handleUpdateOrg} 
                disabled={loading !== null || !hasChanges}
                size="sm"
                className="h-8 px-4 font-bold"
            >
                {loading === 'save' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
            </Button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <Label className="text-xs text-fg-muted uppercase font-bold tracking-tight">Display Name</Label>
            <Input 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                placeholder="Company Name"
                className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-fg-muted uppercase font-bold tracking-tight">URL Slug (Permanent)</Label>
            <Input 
                value={formData.slug} 
                disabled
                className="h-10 bg-bg-subtle/50 font-mono text-xs opacity-70"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-fg-muted uppercase font-bold tracking-tight flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-primary/60" /> Industry
            </Label>
            <Select 
                value={formData.industry} 
                onValueChange={(val) => setFormData({...formData, industry: val})}
            >
                <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select Industry" />
                </SelectTrigger>
                <SelectContent>
                    {industries.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-fg-muted uppercase font-bold tracking-tight flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-primary/60" /> Website
            </Label>
            <Input 
                value={formData.website} 
                onChange={(e) => setFormData({...formData, website: e.target.value})} 
                placeholder="https://company.com"
                className="h-10"
            />
          </div>
        </div>
      </div>

      {/* 2. Unified Plan Management (DRY - Using shared component) */}
      <div className="space-y-6">
        <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted flex items-center gap-2 px-1">
          <Zap className="h-4 w-4 text-warning" /> Resource Provisioning (God Mode)
        </h3>
        
        <PlanGrid 
            currentTier={activeTier}
            onUpgrade={handleTierChange}
            isLoading={loading}
            isAdminView={true}
        />
      </div>

      {/* 3. Ownership Transfer */}
      <div className="bg-panel border border-warning/20 rounded-xl p-6 bg-warning/5 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-widest text-warning mb-4 flex items-center gap-2">
          <UserCog className="h-4 w-4" /> Transfer Primary Ownership
        </h3>
        <div className="space-y-4 max-w-lg">
          <p className="text-xs text-fg-muted leading-relaxed">
            Enter a registered user&apos;s email to assign them as the <strong>Organization Admin</strong>.
            <span className="block mt-2 font-medium text-warning/80">Security Notice: The current admin will be demoted to Program Manager to preserve data integrity.</span>
          </p>
          <div className="flex gap-2">
            <Input 
              placeholder="new-admin@email.com" 
              value={adminEmail} 
              onChange={(e) => setAdminEmail(e.target.value)} 
              className="bg-bg border-warning/20 focus:ring-warning/20 h-10"
            />
            <Button variant="destructive" onClick={promptTransfer} disabled={loading !== null || !adminEmail} className="h-10 px-6 font-bold uppercase tracking-tighter text-xs shadow-lg shadow-danger/20">
              {loading === 'admin' ? <Loader2 className="h-4 w-4 animate-spin" /> : "Transfer"}
            </Button>
          </div>
        </div>
      </div>

      {/* Transfer Confirmation */}
      <AlertDialog open={transferConfirmOpen} onOpenChange={setTransferConfirmOpen}>
          <AlertDialogContent className="bg-panel border-border">
              <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-warning">
                      <AlertTriangle className="h-5 w-5" />
                      Transfer Organization Ownership
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3">
                      <p>You are about to transfer primary ownership to <strong>{adminEmail.trim()}</strong>.</p>
                      <ul className="text-xs list-disc pl-5 space-y-1">
                          <li>The current admin will be demoted to Program Manager.</li>
                          <li>The target user will become the Organization Admin.</li>
                          <li>They will gain FULL control over all organization data.</li>
                      </ul>
                      <p className="font-bold text-fg">This action is permanent. Do you wish to proceed?</p>
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel className="bg-bg border-border text-fg">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAssignAdmin} className="bg-warning text-black hover:bg-warning/90">
                      Confirm Transfer
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
