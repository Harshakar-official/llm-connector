"use client"

import { Check, Shield, Zap, Building2, Loader2, Sparkles, CreditCard, Lock, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { upgradeOrganizationPlan } from "@/lib/supabase/billing-actions"
import { PlanGrid, type PlanTier } from "@/components/shared/PricingCards"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { CheckoutSimulationModal } from "./CheckoutSimulationModal"

interface BillingClientProps {
  currentPlan: string
  orgId: string
  userRole?: string
}

export function BillingClient({ currentPlan, orgId, userRole }: BillingClientProps) {
  const router = useRouter()

  // Normalize "free" to "starter" for UI consistency
  const getNormalizedTier = (tier: string | null | undefined) => {
    if (!tier || tier === "free") return "starter"
    return tier
  }

  const [activeTier, setActiveTier] = useState(getNormalizedTier(currentPlan))
  const [loading, setLoading] = useState<string | null>(null)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  
  // Simulation States
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState(0)
  const [targetTier, setTargetTier] = useState<PlanTier | null>(null)

  useEffect(() => {
    setActiveTier(getNormalizedTier(currentPlan))
  }, [currentPlan])

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

  const startUpgradeSimulation = async (tier: PlanTier) => {
    setTargetTier(tier)
    setIsCheckoutOpen(true)
    setCheckoutStep(1)
    
    // Step 1: Gateway Connection (1s)
    setTimeout(() => {
      setCheckoutStep(2)
      // Step 2: Processing Payment (1.5s)
      setTimeout(() => {
        setCheckoutStep(3)
        // Step 3: Finalizing in Database
        handleActualUpgrade(tier)
      }, 1500)
    }, 1000)
  }

  const handleActualUpgrade = async (tier: PlanTier) => {
    try {
      const result = await upgradeOrganizationPlan(orgId, tier)
      if (result.success) {
        setCheckoutStep(4) // Success State
        setActiveTier(tier)
        playSuccessSound()
        setTimeout(() => {
            setIsCheckoutOpen(false)
            toast.success(`Account Upgraded to ${tier}!`, {
                icon: <Sparkles className="h-4 w-4 text-warning" />
            })
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
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-fg">Subscription & Plans</h1>
        <p className="text-fg-muted mt-2 max-w-xl text-sm leading-relaxed">
          Unlock the full potential of VAPTShield. Switch between tiers to scale your security infrastructure instantly.
        </p>
      </div>

      <PlanGrid 
        currentTier={activeTier} 
        onUpgrade={startUpgradeSimulation} 
        isLoading={loading} 
        userRole={userRole}
      />

      <div className="bg-panel border border-border rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="flex items-center gap-5">
              <div className="h-14 w-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Shield className="h-7 w-7 text-primary" />
              </div>
              <div>
                  <h4 className="font-bold text-lg text-fg">Custom Enterprise Deployment?</h4>
                  <p className="text-sm text-fg-muted">Dedicated scanner clusters, custom OIDC integration, and priority 24/7 support.</p>
              </div>
          </div>
          <Button variant="outline" className="border-primary/20 text-primary hover:bg-primary/10 px-10 h-11 font-bold">
              Contact Sales
          </Button>
      </div>

      <CheckoutSimulationModal
        open={isCheckoutOpen}
        onOpenChange={setIsCheckoutOpen}
        step={checkoutStep}
        targetTier={targetTier}
      />
    </div>
  )
}
