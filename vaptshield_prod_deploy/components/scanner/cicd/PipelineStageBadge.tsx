"use client"

interface PipelineStage {
  id: string
  label: string
  icon: React.ReactNode
  status: "pending" | "running" | "passed" | "failed" | "skipped" | "warning" | "cancelled"
  duration?: string
}

interface PipelineStageBadgeProps {
  stage: PipelineStage
  isLast?: boolean
}

export default function PipelineStageBadge({ stage, isLast }: PipelineStageBadgeProps) {
  const statusConfig = {
    pending: { bg: "bg-bg-muted", fg: "text-fg-disabled", icon: "○", border: "border-border", pulse: false },
    running: { bg: "bg-primary/10", fg: "text-primary", icon: "▶", border: "border-primary/30", pulse: true },
    passed: { bg: "bg-success/10", fg: "text-success", icon: "✓", border: "border-success/30", pulse: false },
    warning: { bg: "bg-severity-high/10", fg: "text-severity-high", icon: "!", border: "border-severity-high/30", pulse: false },
    failed: { bg: "bg-severity-critical/10", fg: "text-severity-critical", icon: "✗", border: "border-severity-critical/30", pulse: false },
    cancelled: { bg: "bg-fg-muted/10", fg: "text-fg-muted", icon: "∅", border: "border-border", pulse: false },
    skipped: { bg: "bg-bg-muted", fg: "text-fg-disabled", icon: "—", border: "border-border", pulse: false },
  }
  const cfg = statusConfig[stage.status]

  return (
    <div className="flex items-center gap-0 flex-1 min-w-0">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-md border ${cfg.border} ${cfg.bg} transition-all duration-500 flex-1 min-w-0 ${cfg.pulse ? "animate-pulse" : ""}`}>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${cfg.fg}`}>
          {cfg.icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium ${cfg.fg}`}>{stage.label}</span>
            {stage.duration && (
              <span className="text-[9px] font-mono text-fg-disabled">{stage.duration}</span>
            )}
          </div>
        </div>
      </div>
      {!isLast && (
        <div className="w-4 flex items-center justify-center shrink-0">
          <div className={`w-1.5 h-0.5 rounded-full ${stage.status === "passed" ? "bg-success/40" : stage.status === "warning" ? "bg-severity-high/40" : stage.status === "running" ? "bg-primary/40" : "bg-border"}`} />
        </div>
      )}
    </div>
  )
}