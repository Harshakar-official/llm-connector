"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  History, Radar, Terminal, GitBranch, Shield, AlertTriangle,
  CheckCircle, Search, ChevronLeft, ChevronRight, Eye,
  RefreshCw, XCircle, Sparkles, ExternalLink, Trash2,
} from "lucide-react"
import { AIPatchInline } from "@/components/scanner/cicd/AIPatchInline"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { toast } from "sonner"

interface ScanRecord {
  id: string
  scan_type: string
  scan_target: string | null
  status: string
  findings_found: number
  findings_approved: number
  started_by: string | null
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  error_message: string | null
  raw_output: string | null
  raw_output_json?: {
    results?: Record<string, { status: string; count: number }>
    summary?: { critical: number; high: number; medium: number; low: number }
  } | null
  branch_name?: string | null
  commit_hash?: string | null
  project_name?: string
  user_name?: string
}

interface PendingAlert {
  id: string
  title: string | null
  severity: string | null
  description: string | null
  url: string | null
  status: string
  created_at: string
  raw_data: Record<string, unknown> | null
  project_id?: string | null
  source: "zap" | "cicd" | "kali" | "vulnerability"
}

function scanDisplayName(scan: ScanRecord): string {
  if (scan.scan_type === "cicd") return "CI/CD Scan"
  if (scan.scan_type === "zap") return "ZAP Scan"
  return scan.scan_type ? scan.scan_type.charAt(0).toUpperCase() + scan.scan_type.slice(1) : "Unknown"
}

const SCAN_ICONS: Record<string, typeof Radar> = {
  zap: Radar,
  kali: Terminal,
  semgrep: Shield,
  trivy: Shield,
  gitleaks: Shield,
  cicd: GitBranch,
  novasec: Radar,
  manual: Terminal,
}

function severityColor(sev: string | null): string {
  switch (sev) {
    case "critical": return "text-severity-critical border-severity-critical-border bg-severity-critical-bg"
    case "high": return "text-severity-high border-severity-high-border bg-severity-high-bg"
    case "medium": return "text-severity-medium border-severity-medium-border bg-severity-medium-bg"
    case "low": return "text-severity-low border-severity-low-border bg-severity-low-bg"
    default: return "text-fg-muted"
  }
}

export default function ScanHistoryPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [scans, setScans] = useState<ScanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [typeFilter, setTypeFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [search, setSearch] = useState("")
  const [selectedScan, setSelectedScan] = useState<ScanRecord | null>(null)
  const [pendingAlerts, setPendingAlerts] = useState<PendingAlert[]>([])
  const [pendingAlertsLoading, setPendingAlertsLoading] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<PendingAlert | null>(null)
  const [showAIPatchFor, setShowAIPatchFor] = useState<string | null>(null)
  const [selectedScansForDelete, setSelectedScansForDelete] = useState<Set<string>>(new Set())
  const [isAutoFixing, setIsAutoFixing] = useState<Record<string, boolean>>({})
  const limit = 20

  const autoFixPr = async (scanId: string) => {
    try {
      setIsAutoFixing(prev => ({ ...prev, [scanId]: true }))
      const res = await fetch("/api/ai/autofix-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Auto-Fix failed")
      
      toast.success("Auto-Fix PR Created!", {
        description: "AI has successfully fixed the vulnerabilities and raised a PR.",
        action: { label: "View PR", onClick: () => window.open(data.prUrl, "_blank") }
      })
    } catch (err: any) {
      toast.error("Auto-Fix PR Failed", { description: err.message })
    } finally {
      setIsAutoFixing(prev => ({ ...prev, [scanId]: false }))
    }
  }

  // Handle query params: ?scan=SCAN_ID auto-opens that scan, ?repo=URL filters by repo
  const [autoOpenScanId, setAutoOpenScanId] = useState<string | null>(null)
  const [autoFilterRepo, setAutoFilterRepo] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => setUserRole(d.profile?.role || "guest"))
      .catch(() => setUserRole("guest"))
  }, [])

  useEffect(() => {
    const scanId = searchParams.get("scan")
    const repoUrl = searchParams.get("repo")
    if (scanId) {
      setAutoOpenScanId(scanId)
      // Fetch single scan
      fetch(`/api/scans?scan_id=${scanId}&limit=1`)
        .then(r => r.json())
        .then(data => {
          if (data.scans?.length > 0) {
            setSelectedScan(data.scans[0])
          }
        })
        .catch(() => {})
      // Clear URL param
      router.replace("/scanner/history", { scroll: false })
    }
    if (repoUrl) {
      setAutoFilterRepo(repoUrl)
      setSearch(repoUrl)
      // Clear URL param
      router.replace("/scanner/history", { scroll: false })
    }
  }, [searchParams, router])

  const fetchScans = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (typeFilter) params.set("scan_type", typeFilter)
      if (statusFilter) params.set("status", statusFilter)
      if (search) params.set("search", search)
      const res = await fetch(`/api/scans?${params}`)
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to fetch scans")
      setScans(result.scans || [])
      setTotalCount(result.total || 0)
    } catch {
      // silently ignore
    }
    setLoading(false)
  }, [page, typeFilter, statusFilter, search])

  useEffect(() => {
    fetchScans()
  }, [fetchScans])

  // Fetch findings from scan_findings for the selected scan
  useEffect(() => {
    if (!selectedScan) {
      setPendingAlerts([])
      return
    }
    setPendingAlertsLoading(true)
    const fetchAll = async () => {
      try {
        const res = await fetch(`/api/scan-findings/by-scan/${selectedScan.id}`)
        const data = await res.json()
        const alerts: PendingAlert[] = (data.findings || []).map((f: any) => ({
          id: f.id,
          title: f.title,
          severity: f.severity,
          description: f.description,
          url: f.url || f.raw_data?.Target || f.raw_data?.location || null,
          status: f.status,
          created_at: f.created_at,
          raw_data: f.raw_data,
          project_id: f.project_id,
          source: (f.source === "kali" || f.source === "zap" || f.source === "vulnerability" ? f.source : "cicd") as PendingAlert["source"],
        }))
        setPendingAlerts(alerts)
      } catch { /* ignore */ }
      setPendingAlertsLoading(false)
    }
    fetchAll()
  }, [selectedScan])

  const handleApprove = async (alert: PendingAlert) => {
    try {
      const res = await fetch(`/api/scan-findings/${alert.id}/approve`, { method: "POST" })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Approve failed"); return }
      toast.success("Finding approved")
      setPendingAlerts(prev => prev.filter(a => a.id !== alert.id))
      // Refresh scan counts
      fetchScans()
      setSelectedAlert(null)
    } catch { toast.error("Failed to approve finding") }
  }

  const handleReject = async (alert: PendingAlert) => {
    try {
      const res = await fetch(`/api/scan-findings/${alert.id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by analyst" }),
      })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Reject failed"); return }
      toast.success("Finding rejected")
      setPendingAlerts(prev => prev.filter(a => a.id !== alert.id))
      setSelectedAlert(null)
    } catch { toast.error("Failed to reject finding") }
  }

  const fixStaleScans = useCallback(async () => {
    if (!confirm("Mark all 'running' scans older than 30 minutes as failed?")) return
    try {
      const res = await fetch("/api/scans/fix-stale", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      toast.success(`Fixed ${data.fixed} stale scans`)
      fetchScans()
    } catch {
      toast.error("Failed to fix stale scans")
    }
  }, [fetchScans])

  const clearAllScans = useCallback(async () => {
    if (!confirm("Are you SURE you want to delete ALL scan history? This action cannot be undone.")) return
    try {
      const res = await fetch("/api/scans?all=true", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to clear history")
      toast.success("All scan history cleared")
      setPage(1)
      setSelectedScansForDelete(new Set())
      fetchScans()
    } catch {
      toast.error("Failed to clear scan history")
    }
  }, [fetchScans])

  const deleteSelectedScans = useCallback(async () => {
    if (selectedScansForDelete.size === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedScansForDelete.size} selected scans?`)) return
    try {
      const idsParam = Array.from(selectedScansForDelete).join(",")
      const res = await fetch(`/api/scans?ids=${idsParam}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to delete selected")
      toast.success(`Deleted ${selectedScansForDelete.size} scans`)
      setSelectedScansForDelete(new Set())
      fetchScans()
    } catch {
      toast.error("Failed to delete selected scans")
    }
  }, [selectedScansForDelete, fetchScans])

  const toggleSelectScan = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedScansForDelete(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedScansForDelete.size === scans.length) {
      setSelectedScansForDelete(new Set())
    } else {
      setSelectedScansForDelete(new Set(scans.map(s => s.id)))
    }
  }, [scans, selectedScansForDelete.size])

  const totalPages = Math.ceil(totalCount / limit)
  const IconComponent = (type: string) => SCAN_ICONS[type] || Radar

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scan History</h1>
          <p className="text-sm text-fg-muted">View all security scans across your organization</p>
        </div>
        <div className="flex gap-2">
          {(userRole === "admin" || userRole === "security_engineer") && selectedScansForDelete.size > 0 && (
            <Button variant="outline" size="sm" onClick={deleteSelectedScans} className="text-severity-critical border-severity-critical/30 hover:bg-severity-critical-bg">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Selected ({selectedScansForDelete.size})
            </Button>
          )}
          {(userRole === "admin" || userRole === "security_engineer") && (
            <Button variant="outline" size="sm" onClick={clearAllScans} className="text-severity-critical border-severity-critical/30 hover:bg-severity-critical-bg">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Clear All History
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fixStaleScans}>
            <RefreshCw className="w-3.5 h-3.5 mr-2" /> Fix Stale
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
              <Input
                placeholder="Search scans..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="zap">ZAP</SelectItem>
                <SelectItem value="cicd">CI/CD</SelectItem>
                <SelectItem value="kali">Kali</SelectItem>
                <SelectItem value="semgrep">Semgrep</SelectItem>
                <SelectItem value="trivy">Trivy</SelectItem>
                <SelectItem value="gitleaks">Gitleaks</SelectItem>
                <SelectItem value="novasec">NovaSec</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : scans.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-fg-muted">
              <History className="w-12 h-12 text-fg-disabled" />
              <p className="text-sm font-medium">No scan history</p>
              <p className="text-xs">Run your first scan to see results here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scans.length > 0 && (userRole === "admin" || userRole === "security_engineer") && (
                <div className="flex items-center gap-3 px-3 py-1">
                  <input
                    type="checkbox"
                    checked={selectedScansForDelete.size === scans.length && scans.length > 0}
                    onChange={(e) => toggleSelectAll(e as any)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-xs text-fg-muted font-medium">Select All</span>
                </div>
              )}
              {scans.map(scan => {
                const Icon = IconComponent(scan.scan_type)
                return (
                  <div
                    key={scan.id}
                    className="flex items-center gap-4 p-3 rounded-md border border-border hover:bg-panel-hover cursor-pointer transition-colors"
                    onClick={() => setSelectedScan(scan)}
                  >
                    {(userRole === "admin" || userRole === "security_engineer") && (
                      <div className="shrink-0" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedScansForDelete.has(scan.id)}
                          onChange={(e) => toggleSelectScan(e as any, scan.id)}
                          className="w-4 h-4 rounded border-border"
                        />
                      </div>
                    )}
                    <Icon className="w-5 h-5 text-fg-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{scanDisplayName(scan)}</span>
                        <Badge variant="outline" className={`text-xs ${scan.status === "completed"
                            ? "text-success border-success/30"
                            : scan.status === "running"
                              ? "text-primary"
                              : scan.status === "cancelled"
                                ? "text-fg-muted"
                                : scan.status === "failed"
                                  ? "text-severity-critical border-severity-critical/30"
                                  : ""
                          }`}>
                          {scan.status}
                        </Badge>
                        {scan.findings_found > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {scan.findings_found} findings
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-fg-muted flex-wrap">
                        <span>{scan.scan_target || "—"}</span>
                        {scan.project_name && <span>· {scan.project_name}</span>}
                        {scan.branch_name && (
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" /> {scan.branch_name}
                          </span>
                        )}
                        {scan.started_at && (
                          <span>· {new Date(scan.started_at).toLocaleDateString()} {new Date(scan.started_at).toLocaleTimeString()}</span>
                        )}
                        {scan.duration_seconds && (
                          <span>· {(scan.duration_seconds / 60).toFixed(0)}m</span>
                        )}
                      </div>
                    </div>
                    {scan.user_name && (
                      <span className="text-xs text-fg-muted font-mono shrink-0">{scan.user_name}</span>
                    )}
                    {/* Delete Scan button */}
                    {(userRole === "admin" || userRole === "security_engineer") && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Are you sure you want to delete this scan and all its findings?")) {
                            fetch(`/api/scans?id=${scan.id}`, { method: "DELETE" })
                              .then(r => r.json())
                              .then(d => {
                                if (d.success) {
                                  toast.success("Scan deleted");
                                  fetchScans();
                                } else {
                                  toast.error(d.error || "Failed to delete");
                                }
                              })
                              .catch(() => toast.error("Failed to delete scan"));
                          }
                        }}
                        className="p-2 text-fg-disabled hover:text-severity-critical transition-colors"
                        title="Delete Scan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <span className="text-xs text-fg-muted">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan Detail Dialog */}
      <Dialog open={!!selectedScan} onOpenChange={() => { setSelectedScan(null); setPendingAlerts([]) }}>
        <DialogContent className="sm:max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] overflow-y-auto">
          {selectedScan && (
            <>
              <DialogHeader className="pr-8">
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-2">
                    <span className="capitalize">{scanDisplayName(selectedScan)}</span>
                    <Badge variant="outline">{selectedScan.status}</Badge>
                  </DialogTitle>
                  {selectedScan.scan_type === "cicd" && selectedScan.status === "completed" && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" asChild variant="outline" className="text-[11px] font-mono text-primary hover:text-primary-hover border-primary/30 shrink-0">
                        <a href={`/report/${selectedScan.id}`} target="_blank">
                          <ExternalLink className="w-3 h-3 mr-1" /> View Report
                        </a>
                      </Button>
                      {selectedScan.findings_found > 0 && (
                        <Button size="sm" onClick={() => autoFixPr(selectedScan.id)} disabled={isAutoFixing[selectedScan.id]} className="text-[11px] font-mono text-primary hover:text-primary-hover border border-primary/30 shrink-0" variant="outline">
                          {isAutoFixing[selectedScan.id] ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />} 
                          Auto-Fix All
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </DialogHeader>
              <div className="space-y-4">
                {/* Scan metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-fg-muted text-xs">Target:</span>
                    <span className="font-mono text-xs block mt-0.5 break-all">{selectedScan.scan_target || "—"}</span>
                  </div>
                  <div>
                    <span className="text-fg-muted text-xs">Project:</span>
                    <span className="font-mono text-xs block mt-0.5">{selectedScan.project_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-fg-muted text-xs">Started:</span>
                    <span className="font-mono text-xs block mt-0.5">{selectedScan.started_at ? new Date(selectedScan.started_at).toLocaleString() : "—"}</span>
                  </div>
                  <div>
                    <span className="text-fg-muted text-xs">Completed:</span>
                    <span className="font-mono text-xs block mt-0.5">{selectedScan.completed_at ? new Date(selectedScan.completed_at).toLocaleString() : "—"}</span>
                  </div>
                  <div>
                    <span className="text-fg-muted text-xs">Duration:</span>
                    <span className="font-mono text-xs block mt-0.5">{selectedScan.duration_seconds ? `${(selectedScan.duration_seconds / 60).toFixed(1)}m` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-fg-muted text-xs">Started by:</span>
                    <span className="font-mono text-xs block mt-0.5">{selectedScan.user_name || "—"}</span>
                  </div>
                  {selectedScan.branch_name && (
                    <div>
                      <span className="text-fg-muted text-xs">Branch:</span>
                      <span className="font-mono text-xs block mt-0.5">{selectedScan.branch_name}</span>
                    </div>
                  )}
                  {selectedScan.commit_hash && (
                    <div>
                      <span className="text-fg-muted text-xs">Commit:</span>
                      <span className="font-mono text-xs block mt-0.5 truncate">{selectedScan.commit_hash.substring(0, 10)}</span>
                    </div>
                  )}
                </div>

                {/* Error message */}
                {selectedScan.error_message && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-severity-critical-bg border border-severity-critical-border text-severity-critical text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {selectedScan.error_message}
                  </div>
                )}

                {/* Raw output */}
                {selectedScan.raw_output && (
                  <div>
                    <p className="text-sm font-medium mb-2">Raw Output</p>
                    <pre className="text-xs font-mono bg-bg-muted p-3 rounded-md overflow-x-auto max-h-36 whitespace-pre-wrap">{selectedScan.raw_output}</pre>
                  </div>
                )}

                {/* CI/CD Results Summary from raw_output_json */}
                {selectedScan.raw_output_json?.results && (
                  <div>
                    <p className="text-sm font-medium mb-2">Tool Results</p>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(selectedScan.raw_output_json.results).map(([tool, result]) => (
                        <div key={tool} className={`p-3 rounded-md border text-center ${result.status === "pass"
                            ? "border-success/30 bg-success-bg text-success"
                            : result.status === "fail"
                              ? "border-severity-high-border bg-severity-high-bg text-severity-high"
                              : "border-border bg-bg-muted text-fg-muted"
                          }`}>
                          <p className="text-xs font-medium capitalize mb-1">{tool}</p>
                          <p className="text-xs font-mono">{result.status === "pass" ? "Pass" : result.status === "fail" ? "Failed" : result.status}</p>
                          {result.count > 0 && <p className="text-xs mt-1">{result.count} finding{result.count !== 1 ? "s" : ""}</p>}
                        </div>
                      ))}
                    </div>
                    {selectedScan.raw_output_json.summary && (
                      <div className="flex gap-3 mt-2">
                        {selectedScan.raw_output_json.summary.critical > 0 && (
                          <span className="text-xs text-severity-critical font-mono">{selectedScan.raw_output_json.summary.critical} critical</span>
                        )}
                        {selectedScan.raw_output_json.summary.high > 0 && (
                          <span className="text-xs text-severity-high font-mono">{selectedScan.raw_output_json.summary.high} high</span>
                        )}
                        {selectedScan.raw_output_json.summary.medium > 0 && (
                          <span className="text-xs text-severity-medium font-mono">{selectedScan.raw_output_json.summary.medium} medium</span>
                        )}
                        {selectedScan.raw_output_json.summary.low > 0 && (
                          <span className="text-xs text-severity-low font-mono">{selectedScan.raw_output_json.summary.low} low</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Findings */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">
                      Findings
                      <span className="text-fg-muted font-normal ml-1">({pendingAlerts.length})</span>
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {selectedScan.findings_found} found / {selectedScan.findings_approved} approved
                    </Badge>
                  </div>
                  {pendingAlertsLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : pendingAlerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 gap-2 text-fg-muted text-sm">
                      <CheckCircle className="w-6 h-6 text-fg-disabled" />
                      <p className="text-xs">No findings recorded for this scan</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingAlerts.map(alert => (
                        <div key={alert.id} className="flex items-start gap-3 p-3 rounded-md border border-border">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {alert.severity && (
                                <Badge variant="outline" className={`text-xs ${severityColor(alert.severity)}`}>
                                  {alert.severity}
                                </Badge>
                              )}
                              {(() => {
                                let toolName = alert.raw_data?.tool as string || "Unknown"
                                if (toolName === "Unknown" && alert.raw_data) {
                                  if ('check_id' in alert.raw_data) toolName = 'Semgrep'
                                  else if ('RuleID' in alert.raw_data && 'SecretHash' in alert.raw_data) toolName = 'Gitleaks'
                                  else if ('VulnerabilityID' in alert.raw_data && 'PkgName' in alert.raw_data) toolName = 'Trivy'
                                }
                                return toolName !== "Unknown" ? (
                                  <Badge variant="secondary" className="text-[10px] font-mono capitalize">
                                    {toolName}
                                  </Badge>
                                ) : null
                              })()}
                              <span className="text-sm font-medium truncate">{alert.title || "Untitled finding"}</span>
                              <Badge variant="outline" className="text-xs">{alert.status}</Badge>
                            </div>
                            {alert.description && (
                              <p className="text-xs text-fg-muted mt-1 line-clamp-2">{alert.description}</p>
                            )}
                            {alert.url && (
                              <p className="text-xs font-mono text-fg-muted mt-0.5 truncate">{alert.url}</p>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0 items-start pt-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setSelectedAlert(alert)}
                              title="View details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {alert.status === "pending" && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleApprove(alert)}>
                                  <Sparkles className="w-3 h-3 mr-1" /> Approve
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-fg-muted" onClick={() => handleReject(alert)}>
                                  <XCircle className="w-3 h-3 mr-1" /> Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Alert Detail Sheet */}
      <Sheet open={!!selectedAlert} onOpenChange={(open) => { if (!open) { setSelectedAlert(null); setShowAIPatchFor(null); } }}>
        <SheetContent className={`overflow-y-auto transition-all duration-300 ${showAIPatchFor ? 'sm:max-w-[1200px] w-[95vw]' : 'sm:max-w-[540px]'}`}>
          {selectedAlert && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="text-base">Finding Details</SheetTitle>
              </SheetHeader>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-fg-muted font-medium mb-1">Title</p>
                  <p className="text-sm font-medium">{selectedAlert.title || "Untitled"}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedAlert.severity && (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <Badge variant="outline" className={severityColor(selectedAlert.severity)}>
                        {selectedAlert.severity}
                      </Badge>
                    </div>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {selectedAlert.status}
                  </Badge>
                </div>
                {selectedAlert.url && (
                  <div>
                    <p className="text-xs text-fg-muted font-medium mb-1">URL / Location</p>
                    <p className="text-xs font-mono break-all">{selectedAlert.url}</p>
                  </div>
                )}
                {selectedAlert.description && (
                  <div>
                    <p className="text-xs text-fg-muted font-medium mb-1">Description</p>
                    <p className="text-sm whitespace-pre-wrap">{selectedAlert.description}</p>
                  </div>
                )}
                {selectedAlert.raw_data && (
                  <div>
                    <p className="text-xs text-fg-muted font-medium mb-1">Raw Data</p>
                    <pre className="text-xs font-mono bg-bg-muted p-3 rounded-md overflow-x-auto max-h-48 whitespace-pre-wrap">
                      {JSON.stringify(selectedAlert.raw_data, null, 2)}
                    </pre>
                  </div>
                )}
                {selectedAlert.created_at && (
                  <div>
                    <p className="text-xs text-fg-muted font-medium mb-1">Created</p>
                    <p className="text-xs font-mono">{new Date(selectedAlert.created_at).toLocaleString()}</p>
                  </div>
                )}
                {selectedAlert.status === "pending" && (
                  <div className="flex gap-2 pt-2 flex-wrap">
                    <Button size="sm" onClick={() => handleApprove(selectedAlert)}>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleReject(selectedAlert)}>
                      <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                    </Button>
                    {selectedAlert.source === "cicd" && (
                      <Button size="sm" variant="default" onClick={() => setShowAIPatchFor(selectedAlert.id)}>
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate AI Patch
                      </Button>
                    )}
                  </div>
                )}
                {showAIPatchFor === selectedAlert.id && (
                  <div className="mt-4 border-t border-border pt-4 animate-in slide-in-from-top-4 duration-500">
                    <AIPatchInline 
                      findingTitle={selectedAlert.title || "Vulnerability"}
                      vulnerableCode={(selectedAlert.raw_data as any)?.extra?.lines || (selectedAlert.raw_data as any)?.Match || ""}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}