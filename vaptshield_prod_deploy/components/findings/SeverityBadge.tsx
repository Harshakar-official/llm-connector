"use client"

import { cn } from "@/lib/utils"

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'informational'

interface SeverityBadgeProps {
  severity: SeverityLevel | string
  size?: 'sm' | 'md'
  variant?: 'pill' | 'dot'
  className?: string
}

const SEVERITY_MAP: Record<string, { label: string; code: string; color: string; bg: string; border: string; dotColor: string }> = {
  critical: {
    label: "Critical",
    code: "CR",
    color: "text-severity-critical",
    bg: "bg-severity-critical-bg",
    border: "border-severity-critical-border",
    dotColor: "bg-severity-critical",
  },
  high: {
    label: "High",
    code: "HI",
    color: "text-severity-high",
    bg: "bg-severity-high-bg",
    border: "border-severity-high-border",
    dotColor: "bg-severity-high",
  },
  medium: {
    label: "Medium",
    code: "ME",
    color: "text-severity-medium",
    bg: "bg-severity-medium-bg",
    border: "border-severity-medium-border",
    dotColor: "bg-severity-medium",
  },
  low: {
    label: "Low",
    code: "LO",
    color: "text-severity-low",
    bg: "bg-severity-low-bg",
    border: "border-severity-low-border",
    dotColor: "bg-severity-low",
  },
  informational: {
    label: "Informational",
    code: "IN",
    color: "text-severity-info",
    bg: "bg-severity-info-bg",
    border: "border-severity-info-border",
    dotColor: "bg-severity-info",
  },
  // Fallback for database 'info' vs 'informational'
  info: {
    label: "Informational",
    code: "IN",
    color: "text-severity-info",
    bg: "bg-severity-info-bg",
    border: "border-severity-info-border",
    dotColor: "bg-severity-info",
  },
}

export function SeverityBadge({ 
  severity, 
  size = 'sm', 
  variant = 'pill',
  className 
}: SeverityBadgeProps) {
  const level = severity.toLowerCase()
  const config = SEVERITY_MAP[level] || SEVERITY_MAP.informational

  if (variant === 'dot') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1.5 font-bold leading-none tracking-tight",
        size === 'sm' ? "text-[10px]" : "text-xs",
        config.color,
        className
      )}>
        <div className={cn(
            "rounded-full",
            size === 'sm' ? "h-1.5 w-1.5" : "h-2 w-2",
            config.dotColor,
            level === 'critical' && "animate-pulse"
        )} />
        {config.label}
      </div>
    )
  }

  return (
    <div className={cn(
      "inline-flex items-center justify-center rounded font-bold uppercase tracking-tight border",
      config.bg,
      config.color,
      config.border,
      size === 'sm' ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
      level === 'critical' && "shadow-[0_0_8px_rgba(220,38,38,0.2)]",
      className
    )}>
      {config.label}
    </div>
  )
}
