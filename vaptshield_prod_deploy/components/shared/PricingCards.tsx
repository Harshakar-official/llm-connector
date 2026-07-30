"use client"

import { Check, Shield, Zap, Building2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type PlanTier = 'starter' | 'pro' | 'enterprise';

export const PLAN_DETAILS = {
  starter: {
    name: "Starter",
    price: "Free",
    description: "Ideal for startups and individual security enthusiasts.",
    features: ["Unlimited User seats", "Unlimited projects", "1 Docker slot", "3 Scans / day", "2GB Data limit"],
    icon: Building2,
    color: "text-fg-muted",
    cta: "Basic Protection"
  },
  pro: {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "Advanced security for growing organizations and teams.",
    features: ["Unlimited User seats", "Unlimited projects", "3 Docker slots", "20 Scans / day", "20GB Data limit", "Priority scan queue", "Email alerts"],
    icon: Zap,
    color: "text-primary",
    recommended: true,
    cta: "Go Professional"
  },
  enterprise: {
    name: "Enterprise",
    price: "Custom",
    description: "Maximum scale and security for large corporations.",
    features: ["Unlimited User seats", "Unlimited projects", "10+ Docker slots", "Unlimited scans", "100GB+ Data limit", "Dedicated Support", "Custom Scan Profiles"],
    icon: Shield,
    color: "text-success",
    cta: "Talk to Sales"
  }
}

interface PlanGridProps {
  currentTier: string
  onUpgrade: (tier: PlanTier) => Promise<void>
  isLoading: string | null
  isAdminView?: boolean
  userRole?: string
}

export function PlanGrid({ currentTier, onUpgrade, isLoading, isAdminView = false, userRole }: PlanGridProps) {
  const canUpgrade = !userRole || userRole === 'admin' || userRole === 'super_admin'
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {Object.entries(PLAN_DETAILS).map(([tier, plan]) => {
        const isCurrent = currentTier === tier
        const Icon = plan.icon

        return (
          <div 
            key={tier} 
            className={cn(
              "relative bg-panel border rounded-xl overflow-hidden transition-all duration-300 flex flex-col hover:border-primary/50 group",
              ('recommended' in plan && plan.recommended) ? 'border-primary ring-1 ring-primary/20 shadow-lg shadow-primary/5' : 'border-border',
              isCurrent && 'ring-2 ring-primary/40'
            )}
          >
            {('recommended' in plan && plan.recommended) && (
              <div className="bg-primary text-primary-fg text-[10px] font-bold uppercase tracking-widest py-1.5 text-center w-full">
                {isAdminView ? "High Conversion Plan" : "Recommended for Teams"}
              </div>
            )}

            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2.5 rounded-lg bg-bg-subtle transition-colors group-hover:bg-primary/5", plan.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                {isCurrent && (
                  <Badge className="bg-success/10 text-success border-success/20">Current</Badge>
                )}
              </div>

              <h3 className="text-lg font-bold text-fg mb-1">{plan.name}</h3>
              <p className="text-xs text-fg-muted h-10 line-clamp-2">{plan.description}</p>
              
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold tracking-tight text-fg">{plan.price}</span>
                {('period' in plan && plan.period) && <span className="text-fg-muted text-xs">{plan.period}</span>}
              </div>

              <div className="mt-6 space-y-3 flex-1">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2.5 text-xs text-fg-muted">
                    <Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                    <span className="group-hover:text-fg transition-colors">{feature}</span>
                  </div>
                ))}
              </div>

              <Button 
                size="sm"
                variant={isCurrent ? "secondary" : ('recommended' in plan && plan.recommended) ? "default" : "outline"}
                className={cn(
                  "w-full mt-8 font-bold text-xs uppercase tracking-tighter transition-all",
                  !isCurrent && "group-hover:scale-[1.01]"
                )}
                disabled={isCurrent || isLoading !== null || !canUpgrade}
                onClick={() => onUpgrade(tier as PlanTier)}
              >
                {isLoading === tier ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  "Active Tier"
                ) : !canUpgrade ? (
                    "Admin Only"
                ) : (
                  isAdminView ? `Provision ${plan.name}` : plan.cta
                )}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
