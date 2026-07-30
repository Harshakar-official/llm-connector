"use client"

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Container, Cpu } from "lucide-react"

interface QuotaData {
  available: boolean
  active: number
  maxSlots: number
  planTier: string
  queueLength: number
}

export function DockerQuotaBadge({ orgId }: { orgId?: string }) {
  const [quota, setQuota] = useState<QuotaData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/cicd/quota")
      if (!res.ok) return
      const data = await res.json()
      setQuota({
        available: data.active_docker_containers < (data.max_docker_containers + (data.paid_extra_docker || 0)),
        active: data.active_docker_containers ?? 0,
        maxSlots: (data.max_docker_containers ?? 1) + (data.paid_extra_docker ?? 0),
        planTier: data.plan_tier ?? "free",
        queueLength: 0,
      })
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchQuota()
    const interval = setInterval(fetchQuota, 30000)
    return () => clearInterval(interval)
  }, [fetchQuota])

  if (loading) {
    return <Badge variant="outline" className="text-[11px] font-mono text-fg-subtle border-border animate-pulse">...</Badge>
  }
  if (!quota) return null

  const pct = quota.maxSlots > 0 ? Math.round((quota.active / quota.maxSlots) * 100) : 0
  const isFull = !quota.available

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`text-[11px] font-mono cursor-help gap-1.5 ${
              isFull
                ? "text-severity-critical border-severity-critical-border bg-severity-critical-bg/40"
                : pct >= 70
                ? "text-severity-high border-severity-high-border bg-severity-high-bg/30"
                : "text-fg-muted border-border"
            }`}
          >
            <Cpu className="w-3 h-3" />
            {quota.active}/{quota.maxSlots} slots
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px] text-xs">
          <p className="font-medium flex items-center gap-1.5">
            <Container className="w-3 h-3" /> Docker Container Quota
          </p>
          <p className="text-fg-subtle mt-1">
            {quota.active} of {quota.maxSlots} slots in use
            {isFull && " — all slots busy"}
          </p>
          <p className="text-fg-subtle mt-0.5">
            {quota.planTier === "free"
              ? "Free plan: 1 container. Upgrade for more."
              : `${quota.planTier.replace("_", " ")} plan`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
