"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import SeverityCount from "@/components/scanner/cicd/SeverityCount"
import { AIPatchInline } from "./AIPatchInline"
import type { ToolStatusMap, StreamProgress } from "@/hooks/useCicdSse"
import type { RepoConfig, QuotaInfo } from "@/hooks/useCicdScan"
import {
  XCircle, CheckCircle, ShieldAlert, Bug, Key, ChevronDown, ChevronUp,
  Eye, ThumbsUp, Trash2, Sparkles, ExternalLink, FileJson, RefreshCw,
} from "lucide-react"

interface FindingsPanelProps {
  streamStatus: "idle" | "running" | "completed" | "failed" | "cancelled"
  streamFindings: any[]
  streamToolBreakdown: Record<string, number>
  streamError: string | null
  activeRepoName: string
  activeScanId: string | null
  toolCardsStatus: ToolStatusMap
  streamProgress: StreamProgress
  configs: RepoConfig[]
  expandedFindings: Record<string, boolean>
  viewFinding: any
  onToggleFinding: (id: string) => void
  onApproveFinding: (id: string) => Promise<void>
  onDeleteFinding: (id: string) => Promise<void>
  onViewFinding: (v: any) => void
  onDisconnect: () => void
  onRetry: () => void
}

export function FindingsPanel({
  streamStatus,
  streamFindings,
  streamToolBreakdown,
  streamError,
  activeRepoName,
  activeScanId,
  toolCardsStatus,
  streamProgress,
  configs,
  expandedFindings,
  viewFinding,
  onToggleFinding,
  onApproveFinding,
  onDeleteFinding,
  onViewFinding,
  onDisconnect,
  onRetry,
}: FindingsPanelProps) {
  const router = useRouter()
  const [showAIPatchFor, setShowAIPatchFor] = useState<string | null>(null)
  const [localPatches, setLocalPatches] = useState<Record<string, any>>({})

  // Empty state — completed with no findings
  if (streamStatus === "completed" && streamFindings.length === 0) {
    return (
      <Card className="border-severity-low-border bg-success-bg/30">
        <CardContent className="p-8 flex flex-col items-center justify-center gap-3">
          <CheckCircle className="w-10 h-10 text-success" />
          <p className="text-sm font-medium text-success">No vulnerabilities found</p>
          <p className="text-xs text-fg-muted text-center max-w-md">
            {activeRepoName} passed all security checks — no SAST issues, no vulnerable dependencies, and no leaked secrets detected.
          </p>
          <Button variant="outline" size="sm" onClick={onDisconnect}>
            Clear
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (streamStatus === "failed" && streamError) {
    return (
      <Card className="border-severity-critical-border bg-severity-critical-bg/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-severity-critical shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-severity-critical">Scan Failed</p>
              <p className="text-xs text-fg-muted mt-1">{streamError}</p>
              <div className="flex items-center gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={onDisconnect}>
                  Dismiss
                </Button>
                <Button variant="default" size="sm" onClick={onRetry}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // No findings to show yet
  if (streamFindings.length === 0) return null

  return (
    <div className="space-y-4">
      {/* Severity Summary Bar */}
      <div className="flex items-center gap-8 p-4 bg-bg-subtle border border-border rounded-md">
        <SeverityCount label="Critical" count={streamFindings.filter((f: any) => f.severity === 'critical').length} color="text-severity-critical" />
        <SeverityCount label="High" count={streamFindings.filter((f: any) => f.severity === 'high').length} color="text-severity-high" />
        <SeverityCount label="Medium" count={streamFindings.filter((f: any) => f.severity === 'medium').length} color="text-severity-medium" />
        <SeverityCount label="Low" count={streamFindings.filter((f: any) => f.severity === 'low').length} color="text-severity-low" />
        <SeverityCount label="Info" count={streamFindings.filter((f: any) => f.severity === 'informational' || f.severity === 'info').length} color="text-fg-muted" />
        <div className="border-l border-border pl-6 flex-1">
          <div className="text-xl font-semibold font-mono tabular-nums">{streamFindings.length}</div>
          <div className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">Total</div>
        </div>
        {streamStatus === "completed" && activeScanId && (
          <div className="shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-xs font-mono border-primary/20 hover:bg-primary/5 text-primary" asChild>
              <a href={`/api/scan/cicd/${activeScanId}/pdf`} download={`VAPTShield-Report-${activeRepoName || 'scan'}.pdf`} target="_blank">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Download PDF Report
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Tool Breakdown Grid */}
      {Object.keys(streamToolBreakdown).filter(k => streamToolBreakdown[k] > 0).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {["semgrep", "trivy", "gitleaks"].map(tool => {
            const count = streamToolBreakdown[tool] || 0
            const toolFindings = streamFindings.filter((f: any) => (f.tool || f.raw_data?.tool) === tool)
            if (count === 0 && toolFindings.length === 0) return null
            const icons: Record<string, React.ReactNode> = {
              semgrep: <Bug className="w-4 h-4 text-white" />,
              trivy: <ShieldAlert className="w-4 h-4 text-white" />,
              gitleaks: <Key className="w-4 h-4 text-white" />,
            }
            const colors: Record<string, string> = {
              semgrep: "bg-severity-high",
              trivy: "bg-severity-critical",
              gitleaks: "bg-severity-low",
            }
            const labels: Record<string, string> = {
              semgrep: "SAST",
              trivy: "SCA",
              gitleaks: "Secrets",
            }
            return (
              <Card key={tool} className="border-border">
                <CardHeader className="px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center ${colors[tool]}`}>
                      {icons[tool]}
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold capitalize">{tool}</CardTitle>
                      <p className="text-[10px] text-fg-subtle">{labels[tool]} — {count} finding{count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 max-h-72 overflow-y-auto divide-y divide-border">
                  {toolFindings.map((f: any) => (
                    <div key={f.id} className="px-4 py-2.5 hover:bg-panel-hover">
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                          f.severity === 'critical' ? 'bg-severity-critical' :
                          f.severity === 'high' ? 'bg-severity-high' :
                          f.severity === 'medium' ? 'bg-severity-medium' :
                          'bg-severity-low'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold truncate">{f.title}</span>
                            <span className={`text-[9px] font-mono px-1 py-0.5 rounded uppercase ${
                              f.severity === 'critical' ? 'bg-severity-critical-bg text-severity-critical border border-severity-critical-border' :
                              f.severity === 'high' ? 'bg-severity-high-bg text-severity-high border border-severity-high-border' :
                              f.severity === 'medium' ? 'bg-severity-medium-bg text-severity-medium border border-severity-medium-border' :
                              'bg-severity-low-bg text-severity-low border border-severity-low-border'
                            }`}>{f.severity}</span>
                            {f.is_new && (
                              <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 text-[9px] px-1.5 py-0 h-4 ml-1 shrink-0">
                                NEW
                              </Badge>
                            )}
                          </div>
                          {f.description && (
                            <p className="text-[10px] text-fg-muted mt-0.5 line-clamp-2">{f.description}</p>
                          )}
                          <button
                            onClick={() => { onViewFinding(f); setShowAIPatchFor(f.id); }}
                            className="mt-1 text-[10px] text-primary hover:text-primary-hover font-mono flex items-center gap-1"
                          >
                            <FileJson className="w-3 h-3" /> {(localPatches[f.id] || f.ai_normalized?.ai_patch) ? "View AI Patch" : "Generate AI Patch"}
                          </button>
                        </div>
                        {(localPatches[f.id] || f.ai_normalized?.ai_patch) && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[9px] px-1.5 py-0 h-4 ml-2 shrink-0">
                            <Sparkles className="w-2.5 h-2.5 mr-0.5" /> AI Patched
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Detailed Findings Expandable Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Detailed Findings</h3>
          <span className="text-xs text-fg-muted font-mono">{streamFindings.length} total</span>
        </div>
        {streamFindings.map((f: any) => {
          const raw = f.raw_data || {}
          const isExpanded = expandedFindings[f.id]
          const isTrivy = (f.tool || raw.tool) === "trivy"
          return (
            <Card key={f.id} className="border-border overflow-hidden">
              <div
                className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-panel-hover transition-colors"
                onClick={() => onToggleFinding(f.id)}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  f.severity === 'critical' ? 'bg-severity-critical' :
                  f.severity === 'high' ? 'bg-severity-high' :
                  f.severity === 'medium' ? 'bg-severity-medium' : 'bg-severity-low'
                }`} />
                <span className={`text-[10px] font-mono uppercase font-medium ${
                  f.severity === 'critical' ? 'text-severity-critical' :
                  f.severity === 'high' ? 'text-severity-high' :
                  f.severity === 'medium' ? 'text-severity-medium' : 'text-severity-low'
                }`}>{f.severity}</span>
                {f.is_new && (
                  <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 text-[9px] px-1.5 py-0 h-4 shrink-0">
                    NEW
                  </Badge>
                )}
                <span className="text-xs font-medium flex-1 truncate">{f.title || raw.Title || raw.VulnerabilityID || "Unknown"}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(localPatches[f.id] || f.ai_normalized?.ai_patch) && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[9px] px-1.5 py-0 h-4 mr-1">
                      <Sparkles className="w-2.5 h-2.5 mr-0.5" /> Patched
                    </Badge>
                  )}
                  <span className="text-[10px] text-fg-subtle font-mono">{f.tool || raw.tool || "—"}</span>
                  {isExpanded ? <ChevronUp className="w-3 h-3 text-fg-muted" /> : <ChevronDown className="w-3 h-3 text-fg-muted" />}
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  {/* Trivy-specific rich data */}
                  {isTrivy && raw.VulnerabilityID && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                      <div><span className="text-fg-subtle">Vulnerability ID:</span><span className="ml-1.5 font-mono text-severity-critical">{raw.VulnerabilityID}</span></div>
                      <div><span className="text-fg-subtle">Severity:</span><span className="ml-1.5 font-mono">{raw.Severity || f.severity}</span></div>
                      <div><span className="text-fg-subtle">Package:</span><span className="ml-1.5 font-mono">{raw.PkgName || "—"}</span></div>
                      <div><span className="text-fg-subtle">Installed:</span><span className="ml-1.5 font-mono">{raw.InstalledVersion || "—"}</span></div>
                      <div><span className="text-fg-subtle">Fixed:</span><span className="ml-1.5 font-mono text-success">{raw.FixedVersion || "—"}</span></div>
                      <div><span className="text-fg-subtle">Status:</span><span className="ml-1.5">{f.status || "open"}</span></div>
                      {raw.Title && <div className="col-span-full"><span className="text-fg-subtle">Title:</span><p className="mt-0.5 text-fg">{raw.Title}</p></div>}
                      {raw.Description && <div className="col-span-full"><span className="text-fg-subtle">Description:</span><p className="mt-0.5 text-fg-muted text-[11px]">{raw.Description}</p></div>}
                      {raw.CVSS && (
                        <div className="col-span-full">
                          <span className="text-fg-subtle">CVSS Scores:</span>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {Object.entries(raw.CVSS).map(([src, scores]: [string, any]) => (
                              <span key={src} className="text-[10px] font-mono bg-bg-muted border border-border rounded px-1.5 py-0.5">
                                {src}: {scores.V3Score || "—"} {scores.V3Vector ? `(${scores.V3Vector})` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {raw.CweIDs && raw.CweIDs.length > 0 && <div><span className="text-fg-subtle">CWE:</span><span className="ml-1.5 font-mono">{raw.CweIDs.join(", ")}</span></div>}
                      {raw.PublishedDate && <div><span className="text-fg-subtle">Published:</span><span className="ml-1.5 font-mono">{new Date(raw.PublishedDate).toLocaleDateString()}</span></div>}
                      {raw.LastModifiedDate && <div><span className="text-fg-subtle">Modified:</span><span className="ml-1.5 font-mono">{new Date(raw.LastModifiedDate).toLocaleDateString()}</span></div>}
                      {raw.VendorSeverity && (
                        <div className="col-span-full">
                          <span className="text-fg-subtle">Vendor Severity:</span>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {Object.entries(raw.VendorSeverity).map(([vendor, sev]: [string, any]) => (
                              <span key={vendor} className="text-[10px] font-mono bg-bg-muted border border-border rounded px-1.5 py-0.5">{vendor}: {sev}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {raw.References && raw.References.length > 0 && (
                        <div className="col-span-full">
                          <span className="text-fg-subtle">References:</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {raw.References.slice(0, 5).map((ref: string, ri: number) => (
                              <a key={ri} href={ref} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline font-mono truncate max-w-[200px] block">{ref}</a>
                            ))}
                            {raw.References.length > 5 && <span className="text-[10px] text-fg-disabled">+{raw.References.length - 5} more</span>}
                          </div>
                        </div>
                      )}
                      {raw.PrimaryURL && (
                        <div className="col-span-full">
                          <a href={raw.PrimaryURL} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline font-mono flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View on NVD
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Non-trivy generic finding */}
                  {!isTrivy && (
                    <div className="space-y-2 text-xs">
                      {f.description && <div><span className="text-fg-subtle">Description:</span><p className="mt-0.5 text-fg-muted">{f.description}</p></div>}
                      {raw && Object.keys(raw).length > 0 && (
                        <details className="group">
                          <summary className="text-[10px] text-fg-subtle cursor-pointer hover:text-fg font-mono flex items-center gap-1">
                            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                            Raw Data
                          </summary>
                          <pre className="mt-1 p-2 bg-bg-subtle border border-border rounded text-[10px] font-mono text-fg-muted overflow-x-auto max-h-48">{JSON.stringify(raw, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  )}
                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => onViewFinding(f)}>
                      <Eye className="w-3 h-3 mr-1" /> View
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-success hover:text-success" onClick={() => onApproveFinding(f.id)}>
                      <ThumbsUp className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-severity-critical hover:text-severity-critical" onClick={() => onDeleteFinding(f.id)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { onViewFinding(f); setShowAIPatchFor(f.id); }}>
                      <Sparkles className="w-3 h-3 mr-1" /> {(localPatches[f.id] || f.ai_normalized?.ai_patch) ? "View AI Patch" : "AI Patch"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Raw Data JSON fallback */}
      <details className="group">
        <summary className="text-xs text-fg-muted cursor-pointer hover:text-fg font-mono flex items-center gap-2 px-1 py-1.5">
          <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
          Raw Data ({streamFindings.length})
        </summary>
        <pre className="mt-2 p-3 bg-bg-subtle border border-border rounded-md text-[10px] font-mono text-fg-muted overflow-x-auto max-h-64 overflow-y-auto">
          {JSON.stringify(streamFindings, null, 2)}
        </pre>
      </details>

      {/* ─── Finding Detail View Dialog ───────────────── */}
      <Dialog open={!!viewFinding} onOpenChange={(open) => { if (!open) { onViewFinding(null); setShowAIPatchFor(null); } }}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto transition-all duration-300 ${showAIPatchFor === viewFinding?.id ? 'max-w-[1400px] w-[95vw]' : 'max-w-4xl'}`}>
          {viewFinding && (() => {
            const raw = viewFinding.raw_data || {}
            const isTrivy = (viewFinding.tool || raw.tool) === "trivy"
            const isSemgrep = (viewFinding.tool || raw.tool) === "semgrep"
            const isGitleaks = (viewFinding.tool || raw.tool) === "gitleaks"

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 pr-10">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      viewFinding.severity === 'critical' ? 'bg-severity-critical' :
                      viewFinding.severity === 'high' ? 'bg-severity-high' :
                      viewFinding.severity === 'medium' ? 'bg-severity-medium' : 'bg-severity-low'
                    }`} />
                    <span className="text-base">{viewFinding.title || raw.Title || raw.VulnerabilityID || "Finding Detail"}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${
                      viewFinding.severity === 'critical' ? 'bg-severity-critical-bg text-severity-critical border border-severity-critical-border' :
                      viewFinding.severity === 'high' ? 'bg-severity-high-bg text-severity-high border border-severity-high-border' :
                      viewFinding.severity === 'medium' ? 'bg-severity-medium-bg text-severity-medium border border-severity-medium-border' :
                      'bg-severity-low-bg text-severity-low border border-severity-low-border'
                    }`}>{viewFinding.severity}</span>
                    {viewFinding.tool && <span className="text-[10px] font-mono text-fg-subtle ml-auto">{viewFinding.tool}</span>}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {(viewFinding.description || raw.Title || raw.Description) && (
                    <div><label className="text-xs text-fg-subtle font-medium">Description</label><p className="text-sm text-fg mt-0.5">{viewFinding.description || raw.Title || raw.Description}</p></div>
                  )}
                  {isTrivy && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {raw.VulnerabilityID && <div><label className="text-xs text-fg-subtle font-medium">CVE ID</label><p className="text-sm font-mono text-severity-critical mt-0.5">{raw.VulnerabilityID}</p></div>}
                      {raw.Severity && <div><label className="text-xs text-fg-subtle font-medium">Severity (Vendor)</label><p className="text-sm font-mono mt-0.5">{raw.Severity}</p></div>}
                      {raw.PkgName && <div><label className="text-xs text-fg-subtle font-medium">Package</label><p className="text-sm font-mono mt-0.5">{raw.PkgName}</p></div>}
                      {raw.InstalledVersion && <div><label className="text-xs text-fg-subtle font-medium">Installed Version</label><p className="text-sm font-mono text-severity-high mt-0.5">{raw.InstalledVersion}</p></div>}
                      {raw.FixedVersion && <div><label className="text-xs text-fg-subtle font-medium">Fixed Version</label><p className="text-sm font-mono text-success mt-0.5">{raw.FixedVersion}</p></div>}
                      {raw.Status && <div><label className="text-xs text-fg-subtle font-medium">Status</label><p className="text-sm font-mono mt-0.5">{raw.Status}</p></div>}
                      {raw.SeveritySource && <div><label className="text-xs text-fg-subtle font-medium">Severity Source</label><p className="text-sm font-mono mt-0.5">{raw.SeveritySource}</p></div>}
                      {raw.PkgPath && <div><label className="text-xs text-fg-subtle font-medium">Package Path</label><p className="text-sm font-mono mt-0.5 text-fg-muted truncate" title={raw.PkgPath}>{raw.PkgPath}</p></div>}
                      {raw.PublishedDate && <div><label className="text-xs text-fg-subtle font-medium">Published</label><p className="text-sm font-mono mt-0.5">{new Date(raw.PublishedDate).toLocaleDateString()}</p></div>}
                      {raw.LastModifiedDate && <div><label className="text-xs text-fg-subtle font-medium">Last Modified</label><p className="text-sm font-mono mt-0.5">{new Date(raw.LastModifiedDate).toLocaleDateString()}</p></div>}
                      {raw.CVSS && (
                        <div className="col-span-full">
                          <label className="text-xs text-fg-subtle font-medium">CVSS Scores</label>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {Object.entries(raw.CVSS).map(([src, scores]: [string, any]) => (
                              <span key={src} className="text-[10px] font-mono bg-bg-muted border border-border rounded px-1.5 py-0.5">{src}: {scores.V3Score || "—"} {scores.V3Vector ? `(${scores.V3Vector})` : ""}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {raw.CweIDs && raw.CweIDs.length > 0 && <div className="col-span-full"><label className="text-xs text-fg-subtle font-medium">CWE IDs</label><p className="text-sm font-mono mt-0.5">{raw.CweIDs.join(", ")}</p></div>}
                      {raw.References && raw.References.length > 0 && (
                        <div className="col-span-full">
                          <label className="text-xs text-fg-subtle font-medium">References</label>
                          <div className="mt-1 space-y-1">
                            {raw.References.map((ref: string, ri: number) => (
                              <a key={ri} href={ref} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline block truncate">{ref}</a>
                            ))}
                          </div>
                        </div>
                      )}
                      {raw.PrimaryURL && (
                        <div className="col-span-full">
                          <a href={raw.PrimaryURL} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline font-mono flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View on NVD
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  {isSemgrep && (
                    <div className="space-y-3">
                      {raw.check_id && <div><label className="text-xs text-fg-subtle font-medium">Check ID</label><p className="text-sm font-mono mt-0.5">{raw.check_id}</p></div>}
                      {raw.path && <div><label className="text-xs text-fg-subtle font-medium">File</label><p className="text-sm font-mono text-fg-muted mt-0.5">{raw.path}{raw.start?.line ? `:${raw.start.line}` : ""}</p></div>}
                      {raw.extra?.message && <div><label className="text-xs text-fg-subtle font-medium">Message</label><p className="text-sm mt-0.5">{raw.extra.message}</p></div>}
                      {raw.extra?.metadata?.impact && <div><label className="text-xs text-fg-subtle font-medium">Impact</label><p className="text-sm mt-0.5">{raw.extra.metadata.impact}</p></div>}
                      {raw.extra?.lines && <div><label className="text-xs text-fg-subtle font-medium">Code</label><pre className="mt-0.5 p-2 bg-bg-muted rounded text-[10px] font-mono whitespace-pre-wrap break-all">{raw.extra.lines}</pre></div>}
                    </div>
                  )}
                  {isGitleaks && (
                    <div className="space-y-3">
                      {raw.Description && <div><label className="text-xs text-fg-subtle font-medium">Description</label><p className="text-sm mt-0.5">{raw.Description}</p></div>}
                      {raw.File && <div><label className="text-xs text-fg-subtle font-medium">File</label><p className="text-sm font-mono text-fg-muted mt-0.5">{raw.File}{raw.StartLine ? `:${raw.StartLine}` : ""}</p></div>}
                      {raw.RuleID && <div><label className="text-xs text-fg-subtle font-medium">Rule ID</label><p className="text-sm font-mono mt-0.5">{raw.RuleID}</p></div>}
                      {raw.SecretHash && <div><label className="text-xs text-fg-subtle font-medium">Secret Hash</label><p className="text-sm font-mono text-fg-muted mt-0.5 truncate" title={raw.SecretHash}>{raw.SecretHash}</p></div>}
                      {raw.Match && <div><label className="text-xs text-fg-subtle font-medium">Match</label><pre className="mt-0.5 p-2 bg-bg-muted rounded text-[10px] font-mono whitespace-pre-wrap break-all">{raw.Match}</pre></div>}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Button variant="default" size="sm" onClick={() => setShowAIPatchFor(viewFinding.id)}>
                      <Sparkles className="w-3 h-3 mr-1" /> {(localPatches[viewFinding.id] || viewFinding.ai_normalized?.ai_patch) ? "View AI Patch" : "Generate AI Patch"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onApproveFinding(viewFinding.id)}>
                      <ThumbsUp className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button variant="outline" size="sm" className="text-severity-critical" onClick={() => onDeleteFinding(viewFinding.id)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                  </div>
                  {showAIPatchFor === viewFinding.id && (
                    <div className="mt-6 border-t border-border pt-6 animate-in slide-in-from-top-4 duration-500">
                      <AIPatchInline 
                        findingId={viewFinding.id}
                        findingTitle={viewFinding.title || raw.Title || "Vulnerability"}
                        vulnerableCode={raw.extra?.lines || raw.Match || ""}
                        existingPatch={localPatches[viewFinding.id] || viewFinding.ai_normalized?.ai_patch}
                        onPatchGenerated={async (id, patch) => {
                          setLocalPatches(p => ({ ...p, [id]: patch }))
                          try {
                            await fetch(`/api/findings/${id}/patch`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ patch })
                            })
                          } catch (e) {
                            console.error("Failed to save patch to DB", e)
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}