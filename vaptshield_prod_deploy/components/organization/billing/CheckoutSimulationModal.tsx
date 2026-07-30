"use client"

import { Loader2, Lock, CheckCircle2, CreditCard, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface CheckoutSimulationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  step: number
  targetTier: string | null
  isSuccessMessageOrg?: boolean
}

export function CheckoutSimulationModal({ 
  open, 
  onOpenChange, 
  step, 
  targetTier,
  isSuccessMessageOrg = false
}: CheckoutSimulationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-panel border-border text-fg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            VAPTShield Secure Checkout
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-8 flex flex-col items-center justify-center space-y-6">
          {step < 4 ? (
            <>
              <div className="relative">
                  <Loader2 className="h-16 w-14 animate-spin text-primary opacity-20" />
                  <div className="absolute inset-0 flex items-center justify-center">
                      <Lock className="h-6 w-6 text-primary" />
                  </div>
              </div>
              <div className="space-y-3 w-full max-w-xs">
                  {[
                      { id: 1, label: "Initializing Secure Connection" },
                      { id: 2, label: "Processing Payment Simulation" },
                      { id: 3, label: `Provisioning ${targetTier || 'Resources'} Resources` }
                  ].map((s) => (
                      <div key={s.id} className={cn(
                          "flex items-center gap-3 text-sm transition-all duration-300",
                          step >= s.id ? "text-fg font-medium" : "text-fg-subtle opacity-40"
                      )}>
                          <div className={cn(
                              "h-2 w-2 rounded-full",
                              step > s.id ? "bg-success" : step === s.id ? "bg-primary animate-pulse" : "bg-border"
                          )} />
                          {s.label}
                      </div>
                  ))}
              </div>
            </>
          ) : (
            <div className="text-center animate-in zoom-in-95 duration-500">
                <div className="h-20 w-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="h-12 w-12 text-success" />
                </div>
                <h3 className="text-xl font-bold text-fg">Payment Confirmed!</h3>
                {isSuccessMessageOrg ? (
                   <p className="text-sm text-fg-muted mt-2">Organization upgraded to <strong>{targetTier}</strong>.</p>
                ) : (
                   <>
                     <p className="text-sm text-fg-muted mt-2">Welcome to the <strong>{targetTier}</strong> tier.</p>
                     <div className="mt-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary animate-pulse">
                         <Sparkles className="h-3 w-3" /> Resource Syncing...
                     </div>
                   </>
                )}
            </div>
          )}
        </div>

        <div className="text-[10px] text-center text-fg-subtle uppercase font-bold tracking-widest pt-4 border-t border-border/50">
          Developer Sandbox Mode 2026
        </div>
      </DialogContent>
    </Dialog>
  )
}
