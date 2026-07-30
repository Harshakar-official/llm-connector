"use client"

import { cn } from "@/lib/utils"

interface ActiveDotProps {
  lastSeen?: string | null
  presenceStatus?: string | null
  size?: "sm" | "md" | "lg"
  showTooltip?: boolean
}

export function ActiveDot({ lastSeen, presenceStatus, size = "md", showTooltip = true }: ActiveDotProps) {
  // Compute display state
  let status: "active" | "away" | "offline" = "offline"

  if (presenceStatus) {
    status = presenceStatus as "active" | "away" | "offline"
  } else if (lastSeen) {
    const now = new Date()
    const last = new Date(lastSeen)
    const diffMinutes = (now.getTime() - last.getTime()) / (1000 * 60)

    if (diffMinutes < 1) status = "active"
    else if (diffMinutes < 10) status = "away"
    else status = "offline"
  }

  const colors = {
    active: "bg-success",
    away: "bg-warning",
    offline: "bg-fg-disabled",
  }

  const sizes = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  }

  const tooltips = {
    active: "Active now",
    away: `Away ${lastSeen ? formatLastSeen(lastSeen) : ""}`,
    offline: `Offline ${lastSeen ? formatLastSeen(lastSeen) : ""}`,
  }

  return (
    <div className="relative inline-flex">
      <span
        className={cn(
          "rounded-full flex-shrink-0",
          colors[status],
          sizes[size]
        )}
      />
      {showTooltip && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-panel border border-border rounded text-xs whitespace-nowrap opacity-0 hover:opacity-100 pointer-events-none z-50">
          {tooltips[status]}
        </span>
      )}
    </div>
  )
}

function formatLastSeen(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)

  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString()
}