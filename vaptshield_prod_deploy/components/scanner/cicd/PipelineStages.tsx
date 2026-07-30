"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import PipelineStageBadge from "@/components/scanner/cicd/PipelineStageBadge"
import SeverityCount from "@/components/scanner/cicd/SeverityCount"
import type { PipelineStage, StreamProgress, ToolStatusMap } from "@/hooks/useCicdSse"
import {
  XCircle, CheckCircle, Workflow, FileText, X, StopCircle,
  Terminal, ChevronDown, Eye, EyeOff, AlertOctagon, ListChecks,
} from "lucide-react"
import { useRef, useMemo } from "react"

interface PipelineStagesProps {
  activeRepoName: string
  activeScanId: string | null
  streamStatus: "idle" | "running" | "completed" | "failed" | "cancelled"
  streamFindings: any[]
  streamLogs: { line: string; index: number }[]
  streamProgress: StreamProgress
  streamError: string | null
  pipelineStages: PipelineStage[]
  logExpanded: boolean
  logCollapsed: boolean
  toolCardsStatus: ToolStatusMap
  scanResult: "passed" | "failed" | null
  scanElapsed: number
  cancelling: boolean
  onLogExpandedChange: (v: boolean) => void
  onLogCollapsedChange: (v: boolean) => void
  onCancel: () => void
  onDisconnect: () => void
  formatElapsed: (s: number) => string
}

export function PipelineStages({
  activeRepoName,
  activeScanId,
  streamStatus,
  streamFindings,
  streamLogs,
  streamProgress,
  streamError,
  pipelineStages,
  logExpanded,
  logCollapsed,
  scanResult,
  scanElapsed,
  cancelling,
  onLogExpandedChange,
  onLogCollapsedChange,
  onCancel,
  onDisconnect,
  formatElapsed,
}: PipelineStagesProps) {
  const router = useRouter()
  const terminalRef = useRef<HTMLDivElement>(null)

  const dedupedLogs = useMemo(() => {
    if (logCollapsed) {
      const seen = new Set<string>()
      return streamLogs.filter(log => {
        const clean = log.line.trim()
        if (seen.has(clean)) return false
        seen.add(clean)
        return true
      })
    }
    return streamLogs
  }, [streamLogs, logCollapsed])

  return (
    <Card className="border-border overflow-hidden">
      {/* Pipeline Header */}
      <CardHeader className="px-5 py-3 border-b border-border bg-bg-subtle">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Workflow className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Pipeline: {activeRepoName}
                {streamStatus === "running" && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Running
                  </span>
                )}
                {streamStatus === "completed" && (
                  <span className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    scanResult === "failed" || streamFindings.length > 0
                      ? "bg-severity-critical/10 text-severity-critical"
                      : "bg-success/10 text-success"
                  }`}>
                    {scanResult === "failed" || streamFindings.length > 0
                      ? <><XCircle className="w-3 h-3" /> Vulnerability Found</>
                      : <><CheckCircle className="w-3 h-3" /> Passed</>
                    }
                  </span>
                )}
                {streamStatus === "failed" && (
                  <span className="flex items-center gap-1 text-[10px] font-mono bg-severity-critical/10 text-severity-critical px-1.5 py-0.5 rounded-full">
                    <XCircle className="w-3 h-3" />
                    Failed
                  </span>
                )}
              </CardTitle>
              <p className="text-[11px] text-fg-muted flex items-center gap-2">
                {streamStatus === "running" && (
                  <>{`Scanning ${streamProgress.completed_phases}/${streamProgress.total_phases} stages`}
                    {scanElapsed > 0 && <span className="font-mono text-fg-disabled">· {formatElapsed(scanElapsed)}</span>}
                  </>
                )}
                {streamStatus === "completed" && `${streamProgress.findings_found} findings`}
                {streamStatus === "failed" && streamError}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {streamStatus === "completed" && (
              <>
                <Button variant="outline" size="sm" onClick={() => router.push(`/scanner/history?scan=${activeScanId}`)} className="text-xs h-7">
                  <FileText className="w-3 h-3 mr-1" /> View Full Report
                </Button>
                <Button variant="outline" size="sm" onClick={onDisconnect} className="text-xs h-7">
                  <X className="w-3 h-3 mr-1" /> Clear
                </Button>
              </>
            )}
            {streamStatus === "failed" && (
              <Button variant="outline" size="sm" onClick={onDisconnect} className="text-xs h-7">
                <X className="w-3 h-3 mr-1" /> Dismiss
              </Button>
            )}
            {streamStatus === "running" && (
              <Button variant="destructive" size="sm" onClick={onCancel} disabled={cancelling} className="text-xs h-7">
                <StopCircle className="w-3 h-3 mr-1" /> {cancelling ? "Cancelling..." : "Cancel Scan"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        {/* Jenkins-style Pipeline Stages */}
        <div className="flex items-center gap-0">
          {pipelineStages.map((stage, i) => (
            <PipelineStageBadge key={stage.id} stage={stage} isLast={i === pipelineStages.length - 1} />
          ))}
        </div>

        {/* Progress bar */}
        {streamStatus === "running" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-muted font-mono">
                {pipelineStages.find(s => s.status === "running")?.label ?? "Starting"}...
              </span>
              <span className="text-fg-subtle font-mono text-[10px]">
                {Math.round((streamProgress.completed_phases / streamProgress.total_phases) * 100)}%
              </span>
            </div>
            <div className="h-1.5 bg-bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                style={{ width: `${(streamProgress.completed_phases / streamProgress.total_phases) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Finding counters (during scan) */}
        {streamStatus === "running" && streamProgress.findings_found > 0 && (
          <div className="flex items-center gap-6 p-3 bg-severity-high-bg/30 border border-severity-high-border/50 rounded-md">
            <AlertOctagon className="w-4 h-4 text-severity-high shrink-0" />
            <div className="flex items-center gap-6">
              <SeverityCount label="Critical" count={streamFindings.filter(f => f.severity === 'critical').length} color="text-severity-critical" />
              <SeverityCount label="High" count={streamFindings.filter(f => f.severity === 'high').length} color="text-severity-high" />
              <SeverityCount label="Medium" count={streamFindings.filter(f => f.severity === 'medium').length} color="text-severity-medium" />
              <SeverityCount label="Low" count={streamFindings.filter(f => f.severity === 'low').length} color="text-severity-low" />
              <span className="text-[10px] text-fg-muted font-mono border-l border-border pl-4">
                {streamFindings.length} total
              </span>
            </div>
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center gap-4 text-[10px] font-mono text-fg-subtle border-b border-border pb-3">
          <span>{streamLogs.length} log lines</span>
          <span>·</span>
          <span>{streamFindings.length} findings</span>
          {streamStatus === "running" && (
            <>
              <span>·</span>
              <span className="text-primary flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Streaming live
              </span>
            </>
          )}
        </div>

        {/* Live Log Panel (collapsible, inline) */}
        <div className="border border-border rounded-md overflow-hidden">
          {/* Log header */}
          <div
            className="flex items-center justify-between px-3 py-1.5 bg-bg-subtle border-b border-border cursor-pointer select-none hover:bg-panel-hover transition-colors"
            onClick={() => onLogExpandedChange(!logExpanded)}
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-fg-muted" />
              <span className="text-xs font-medium text-fg-muted">Console Output</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onLogCollapsedChange(!logCollapsed) }}
                className="text-[10px] text-fg-subtle hover:text-fg flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-panel-hover"
                title={logCollapsed ? "Show all lines" : "Collapse duplicate lines"}
              >
                {logCollapsed ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {logCollapsed ? "Show all" : "Dedup"}
              </button>
              <ChevronDown className={`w-3.5 h-3.5 text-fg-muted transition-transform duration-200 ${logExpanded ? '' : '-rotate-90'}`} />
            </div>
          </div>

          {/* Log body */}
          {logExpanded && (
            <div
              ref={terminalRef}
              className="h-48 overflow-y-auto p-3 text-[11px] leading-relaxed font-mono bg-[#0d1117]"
              style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)" }}
            >
              {dedupedLogs.length === 0 && streamStatus === "running" && (
                <div className="text-fg-disabled">Waiting for scan to start...</div>
              )}
              {dedupedLogs.length === 0 && streamStatus === "completed" && (
                <div className="text-success">Scan completed successfully. No log output captured.</div>
              )}
              {(() => {
                let currentPhase: string | null = null
                const phasePerLog: (string | null)[] = []
                for (const logEntry of dedupedLogs) {
                  const line = logEntry.line
                  if (line.includes("=== CLONE") || line.includes("__PHASE__:clone")) currentPhase = "clone"
                  else if (line.includes("=== SEMGREP") || line.includes("__PHASE__:semgrep")) currentPhase = "semgrep"
                  else if (line.includes("=== TRIVY") || line.includes("__PHASE__:trivy")) currentPhase = "trivy"
                  else if (line.includes("=== GITLEAKS") || line.includes("__PHASE__:gitleaks")) currentPhase = "gitleaks"
                  else if (line.includes("__PHASE__:complete")) currentPhase = null
                  phasePerLog.push(currentPhase)
                }
                const phaseColors: Record<string, { text: string; bg: string; phase: string; alert: string; complete: string }> = {
                  semgrep: { text: "#a78bfa", bg: "rgba(167,139,250,0.08)", phase: "#c084fc", alert: "#f472b6", complete: "#34d399" },
                  trivy: { text: "#fb923c", bg: "rgba(251,146,60,0.08)", phase: "#f97316", alert: "#ef4444", complete: "#34d399" },
                  gitleaks: { text: "#fbbf24", bg: "rgba(251,191,36,0.08)", phase: "#f59e0b", alert: "#ef4444", complete: "#34d399" },
                  clone: { text: "#22d3ee", bg: "rgba(34,211,238,0.08)", phase: "#0891b2", alert: "#ef4444", complete: "#34d399" },
                }
                return dedupedLogs.map((log, i) => {
                  const clean = log.line.replace(/[\u0000-\u001F]/g, '').trimEnd()
                  if (!clean) return null
                  const isError = clean.toLowerCase().includes('error') || clean.toLowerCase().includes('fail')
                  const isWarning = clean.toLowerCase().includes('warn')
                  const isPhase = clean.startsWith('===')
                  const phase = phasePerLog[i]
                  const pc = phase ? phaseColors[phase] : null
                  let color = '#8b949e'
                  let borderColor = 'transparent'
                  if (isPhase && pc) {
                    color = pc.phase
                  } else if (isError && pc) {
                    color = pc.alert
                  } else if (isError) {
                    color = '#f85149'
                  } else if (isWarning) {
                    color = '#d29922'
                  } else if (pc) {
                    color = pc.text
                  }
                  if (pc) borderColor = pc.text
                  return (
                    <div
                      key={log.index}
                      className="whitespace-pre-wrap break-all pl-2"
                      style={{
                        color,
                        borderLeft: `2px solid ${borderColor}`,
                        backgroundColor: pc?.bg || 'transparent',
                        fontWeight: isPhase ? 600 : undefined,
                        paddingTop: isPhase ? 2 : undefined,
                        paddingBottom: isPhase ? 2 : undefined,
                      }}
                    >
                      {clean}
                    </div>
                  )
                })
              })()}
              {streamStatus === "running" && (
                <span className="text-fg-disabled animate-pulse">▊</span>
              )}
            </div>
          )}
        </div>

        {/* Live Findings Mini-List */}
        {streamStatus === "running" && streamFindings.length > 0 && (
          <div className="border border-border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-bg-subtle border-b border-border">
              <div className="flex items-center gap-2">
                <ListChecks className="w-3.5 h-3.5 text-severity-high" />
                <span className="text-xs font-medium text-fg-muted">Live Findings ({streamFindings.length})</span>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto divide-y divide-border/50">
              {streamFindings.slice(-10).map((f: any) => (
                <div key={f.id} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    f.severity === 'critical' ? 'bg-severity-critical' :
                    f.severity === 'high' ? 'bg-severity-high' :
                    f.severity === 'medium' ? 'bg-severity-medium' : 'bg-severity-low'
                  }`} />
                  <span className={`text-[9px] font-mono uppercase font-medium ${
                    f.severity === 'critical' ? 'text-severity-critical' :
                    f.severity === 'high' ? 'text-severity-high' :
                    f.severity === 'medium' ? 'text-severity-medium' : 'text-severity-low'
                  }`}>{f.severity}</span>
                  <span className="text-fg-muted truncate">{f.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}