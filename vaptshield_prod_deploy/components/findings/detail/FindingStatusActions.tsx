"use client"

import { History, Target, Users, ShieldCheck, RefreshCw, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface StatusStep {
  id: string
  label: string
  icon: any
  color: string
}

interface Props {
  statusSteps: StatusStep[]
  displayStatus: string
  processingStatus: string | null
  canModify: boolean
  isLocked: boolean
  onStatusTransition: (status: string) => void
}

export function FindingStatusActions({ 
  statusSteps, 
  displayStatus, 
  processingStatus, 
  canModify, 
  isLocked, 
  onStatusTransition 
}: Props) {
  return (
    <div className="bg-panel border border-border p-3 rounded-2xl flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-1">
        {statusSteps.map((step) => {
          const isActive = displayStatus === step.id
          const isThisProcessing = processingStatus === step.id
          
          // Z+ Logic: Action-specific hover colors
          let hoverClass = "hover:bg-primary/10 hover:text-primary"
          if (step.id === 'resolved') hoverClass = "hover:bg-success/10 hover:text-success"
          if (step.id === 'accepted_risk') hoverClass = "hover:bg-warning/10 hover:text-warning"
          if (step.id === 'false_positive') hoverClass = "hover:bg-blue-500/10 hover:text-blue-500"

          return (
            <Button
              key={step.id}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              onClick={() => onStatusTransition(step.id)}
              disabled={processingStatus !== null || isActive || !canModify || isLocked}
              className={cn(
                "h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-tight gap-1.5 transition-all",
                isActive ? "shadow-lg shadow-primary/20" : cn("text-fg-muted", hoverClass)
              )}
            >
              {isThisProcessing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <step.icon className={cn("h-3 w-3", isActive ? "text-white" : step.color)} />
              )}
              {step.label}
            </Button>
          )
        })}
      </div>
      {processingStatus && <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />}
    </div>
  )
}
