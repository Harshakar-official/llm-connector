"use client"

import {
  Clock,
  Activity,
  UserPlus,
  LayoutGrid,
  Shield,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { SeverityBadge } from "@/components/findings/SeverityBadge"
import { formatRelativeTime, cn } from "@/lib/utils"
import {
  Tooltip as TooltipBase,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface Props {
  finding: any
  displayStatus: string
}

export function FindingSidebar({ finding, displayStatus }: Props) {
  return (
    <aside className="space-y-6 bg-panel border border-border p-6 rounded-2xl shadow-sm sticky top-20">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SeverityBadge severity={finding.severity} size="md" variant="pill" className="w-full justify-start h-8 px-3" />
        </div>

        <div className="bg-bg p-4 rounded-xl border border-border text-center relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
          <p className="text-[10px] font-black uppercase text-fg-muted tracking-widest mb-1">CVSS 4.0 Score</p>
          <TooltipProvider>
            <TooltipBase>
              <TooltipTrigger asChild>
                <div className={cn(
                  "text-4xl font-black font-mono cursor-help transition-transform group-hover:scale-105",
                  (finding.cvss_score ?? 0) >= 7 ? "text-severity-high" : "text-primary"
                )}>
                  {finding.cvss_score?.toFixed(1) || "N/A"}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-panel border-border p-3 shadow-xl max-w-[240px]">
                <p className="text-[10px] font-bold text-fg-muted uppercase mb-1">Vector String</p>
                <code className="text-[10px] break-all text-primary font-mono bg-primary/5 p-1 rounded">
                  {finding.cvss_vector || "No vector available"}
                </code>
              </TooltipContent>
            </TooltipBase>
          </TooltipProvider>
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-fg-muted font-bold uppercase tracking-tight">Status</span>
            <Badge variant="outline" className="bg-bg-subtle text-fg-muted border-border capitalize text-[10px] font-bold">
              {displayStatus.replace("_", " ")}
            </Badge>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-fg-muted font-bold uppercase tracking-tight">CVE ID</span>
            <div className="flex items-center gap-1.5">
              {finding.cve_id ? (
                <>
                  <span className="font-mono text-fg font-bold">{finding.cve_id}</span>
                  <Badge className="bg-success/10 text-success border-success/20 text-[8px] h-4 px-1 leading-none uppercase font-black tracking-tighter">NVD Verified</Badge>
                </>
              ) : <span className="text-fg-disabled italic">N/A</span>}
            </div>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-fg-muted font-bold uppercase tracking-tight">CWE</span>
            <span className="font-mono text-fg">{finding.cwe_id || "Unassigned"}</span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-fg-muted font-bold uppercase tracking-tight">OWASP</span>
            <span className="text-fg truncate max-w-[120px] text-right">{finding.owasp_category || "N/A"}</span>
          </div>

          <div className="bg-border h-px my-2" />

          <div className="pt-4 space-y-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Detected By</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-fg">{finding.profiles?.full_name || "System Scanner"}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Lead / Assigned To</span>
              <div className="flex items-center gap-2">
                {finding.assigned_to_profile ? (
                  <>
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={finding.assigned_to_profile.avatar_url || undefined} />
                      <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                        {finding.assigned_to_profile.full_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-bold text-fg">{finding.assigned_to_profile.full_name}</span>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-fg-disabled italic text-[11px] bg-bg-muted/50 px-2 py-1 rounded-lg w-full">
                    <UserPlus className="h-3 w-3" />
                    <span>Not assigned yet</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase text-fg-muted tracking-widest">Timestamps</span>
              <div className="flex items-center gap-2 text-[10px] text-fg-subtle">
                <Clock className="h-3 w-3" />
                <span>Created {new Date(finding.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-fg-subtle">
                <Activity className="h-3 w-3" />
                <span>Updated {formatRelativeTime(finding.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl flex items-center justify-between group cursor-pointer hover:bg-primary/10 transition-colors">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Target Project</span>
          <span className="text-xs font-black text-fg truncate max-w-[150px]">{finding.projects?.name}</span>
        </div>
        <LayoutGrid className="h-5 w-5 text-primary opacity-50 group-hover:opacity-100 transition-all" />
      </div>
    </aside>
  )
}
