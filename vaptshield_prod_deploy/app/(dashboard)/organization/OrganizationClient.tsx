"use client"

import { Building2, Users, FolderKanban, HardDrive, Zap, CreditCard, Sparkles, Loader2, Lock, CheckCircle2, Save, Tag, Globe } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PlanGrid, PLAN_DETAILS, type PlanTier } from "@/components/shared/PricingCards"
import { upgradeOrganizationPlan } from "@/lib/supabase/billing-actions"
import { updateOrganizationAction, uploadOrganizationLogoAction } from "@/lib/supabase/organization-actions"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { DynamicTeamManagement } from "@/components/organization/DynamicTeamManagement"
import { CheckoutSimulationModal } from "@/components/organization/billing/CheckoutSimulationModal"

interface Org {
  id: string
  name: string
  slug: string
  logo_url: string | null
  website: string | null
  industry: string | null
}

interface Quotas {
  max_docker_containers: number
  active_docker_containers: number
  max_ci_scans_per_day: number
  ci_scans_today: number
  max_projects: number
  max_users: number
  storage_limit_gb: number
  storage_used_gb: number
  plan_tier: string
}

interface Props {
  org: Org
  quotas: Quotas
  userCount: number
  projectCount: number
  userRole: string
}

export function OrganizationClient({ org, quotas, userCount, projectCount, userRole }: Props) {
  const router = useRouter()
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [logoUrl, setLogoUrl] = useState(org.logo_url || null)
  
  // Z+ STABILITY: Derive tier from server props (Audit Fix A7)
  const activeTier = quotas.plan_tier

  // Form States
  const [formData, setFormData] = useState({
    name: org.name,
    industry: org.industry || "Other",
    website: org.website || ""
  })

  // Simulation States
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState(0)
  const [targetTier, setTargetTier] = useState<PlanTier | null>(null)

  const industries = ["Technology", "Finance", "Healthcare", "Government", "E-commerce", "Education", "Other"]

  const hasChanges = 
    formData.name !== org.name || 
    formData.industry !== (org.industry || "Other") || 
    formData.website !== (org.website || "")

  useEffect(() => {
    const snd = new Audio("https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3")
    setAudio(snd)
  }, [])

  const playSuccessSound = () => {
    if (audio) {
      audio.volume = 0.5
      audio.play().catch(e => console.log("Sound play blocked"))
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingLogo(true)
    const formData = new FormData()
    formData.append("logo", file)

    try {
      const result = await uploadOrganizationLogoAction(org.id, formData)
      if (result.success) {
        toast.success("Logo updated successfully")
        setLogoUrl(result.logoUrl || null)
        window.dispatchEvent(new CustomEvent("vaptshield:org-updated"))
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (err) {
      toast.error("Failed to upload logo")
    } finally {
      setIsUploadingLogo(false)
      // Reset input
      e.target.value = ""
    }
  }

  const handleUpdateOrg = async () => {
    setIsSaving(true)
    try {
      const result = await updateOrganizationAction(org.id, formData)
      if (result.success) {
        toast.success("Organization profile updated")
        window.dispatchEvent(new CustomEvent("vaptshield:org-updated"))
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error("Failed to save changes")
    } finally {
      setIsSaving(false)
    }
  }

  const startUpgradeSimulation = async (tier: PlanTier) => {
    setTargetTier(tier)
    setIsCheckoutOpen(true)
    setCheckoutStep(1)

    setTimeout(() => {
      setCheckoutStep(2)
      setTimeout(() => {
        setCheckoutStep(3)
        handleActualUpgrade(tier)
      }, 1500)
    }, 1000)
  }
  const handleActualUpgrade = async (tier: PlanTier) => {
    try {
      const result = await upgradeOrganizationPlan(org.id, tier)
      if (result.success) {
        setCheckoutStep(4)
        playSuccessSound()
        setTimeout(() => {
            setIsCheckoutOpen(false)
            toast.success(`Account Upgraded to ${tier}!`, {
                icon: <Sparkles className="h-4 w-4 text-warning" />
            })
            window.dispatchEvent(new CustomEvent("vaptshield:org-updated"))
            router.refresh()
        }, 2000)
      } else {
        toast.error(result.error)
        setIsCheckoutOpen(false)
      }
    } catch (error) {
      toast.error("Critical failure during provisioning")
      setIsCheckoutOpen(false)
    }
  }

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="relative group">
            <div className="h-16 w-16 rounded-xl bg-bg-subtle border border-border flex items-center justify-center overflow-hidden shadow-inner">
                {logoUrl ? (
                    <img src={logoUrl} alt={org.name} className="h-full w-full object-contain p-2" />
                ) : (
                    <Building2 className="h-8 w-8 text-fg-disabled" />
                )}
                {isUploadingLogo && (
                    <div className="absolute inset-0 bg-bg/60 backdrop-blur-[1px] flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                )}
            </div>
            <label className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-panel border border-border flex items-center justify-center cursor-pointer hover:bg-bg-subtle transition-colors shadow-sm opacity-0 group-hover:opacity-100">
                <Save className="h-3 w-3 text-primary" />
                <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={isUploadingLogo} />
            </label>
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-fg uppercase italic leading-none">{org.name}</h1>
          <Badge variant="outline" className="mt-2 bg-primary/5 text-primary border-primary/20 font-black uppercase text-[10px]">
            {activeTier} Tier
          </Badge>
        </div>
        <Button 
            onClick={handleUpdateOrg} 
            disabled={isSaving || !hasChanges}
            className="font-bold"
        >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
        </Button>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="bg-panel border border-border">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="teams">Functional Teams</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="billing">Plans & Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 animate-in fade-in duration-500 pt-4">
          <Card className="bg-panel border-border">
            <CardHeader>
              <CardTitle className="text-lg">Organization Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label className="text-xs text-fg-muted uppercase font-bold">Organization Name</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-fg-muted uppercase font-bold">Slug (Permanent)</Label>
                  <Input value={org.slug} disabled className="bg-bg-subtle font-mono text-xs opacity-70" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-fg-muted uppercase font-bold flex items-center gap-2">
                    <Tag className="h-3 w-3" /> Industry
                  </Label>
                  <Select value={formData.industry} onValueChange={(val) => setFormData({...formData, industry: val})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-panel border-border">
                        {industries.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-fg-muted uppercase font-bold flex items-center gap-2">
                    <Globe className="h-3 w-3" /> Website
                  </Label>
                  <Input value={formData.website} onChange={(e) => setFormData({...formData, website: e.target.value})} placeholder="https://company.com" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="pt-4">
          <DynamicTeamManagement orgId={org.id} />
        </TabsContent>

        <TabsContent value="resources" className="space-y-6 animate-in fade-in duration-500 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-panel border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase text-fg-muted">Docker Slots</CardTitle>
                <Zap className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-fg">
                  {quotas.active_docker_containers} / {quotas.max_docker_containers}
                </div>
                <p className="text-[10px] text-fg-subtle mt-1 italic">Active scanner instances</p>
              </CardContent>
            </Card>

            <Card className="bg-panel border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase text-fg-muted">Projects</CardTitle>
                <FolderKanban className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-fg">
                  {projectCount} / {quotas.max_projects}
                </div>
                <p className="text-[10px] text-fg-subtle mt-1 italic">VAPT targets</p>
              </CardContent>
            </Card>

            <Card className="bg-panel border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase text-fg-muted">User Seats</CardTitle>
                <Users className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-fg">
                  {userCount} / {quotas.max_users}
                </div>
                <p className="text-[10px] text-fg-subtle mt-1 italic">Team members</p>
              </CardContent>
            </Card>

            <Card className="bg-panel border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase text-fg-muted">Cloud Storage</CardTitle>
                <HardDrive className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-fg">
                  {quotas.storage_used_gb.toFixed(1)} / {quotas.storage_limit_gb} GB
                </div>
                <p className="text-[10px] text-fg-subtle mt-1 italic">Findings & data</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6 animate-in fade-in duration-500 pt-4">
          <PlanGrid 
            currentTier={activeTier} 
            onUpgrade={startUpgradeSimulation} 
            isLoading={null} 
            userRole={userRole}
          />
        </TabsContent>
      </Tabs>

      <CheckoutSimulationModal
        open={isCheckoutOpen}
        onOpenChange={setIsCheckoutOpen}
        step={checkoutStep}
        targetTier={targetTier}
        isSuccessMessageOrg={true}
      />
    </div>
  )
}
