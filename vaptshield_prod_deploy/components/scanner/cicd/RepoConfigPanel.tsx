"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { RepoConfig, QuotaInfo } from "@/hooks/useCicdScan"
import {
  Plus, ScanLine, Unlock, Lock, Globe, GitBranch, Trash2, CheckCircle,
  XCircle, ShieldAlert, Clock, Loader2, Copy, Shield, AlertTriangle,
  ChevronDown, FolderGit2, Terminal, Eye, EyeOff, ChevronUp, Activity, Sparkles, ExternalLink, History, Webhook, Check
} from "lucide-react"

interface RepoConfigPanelProps {
  configs: RepoConfig[]
  loading: boolean
  canManage: boolean
  addOpen: boolean
  setAddOpen: (v: boolean) => void
  repoUrl: string
  setRepoUrl: (v: string) => void
  pat: string
  setPat: (v: string) => void
  saving: boolean
  newConfig: { id: string; repo_url: string; repo_name: string; webhook_secret: string; is_private: boolean } | null
  setNewConfig: (v: any) => void
  detecting: boolean
  detectResult: { status: "public" | "private" | "invalid" | null; message: string }
  setDetectResult: (v: any) => void
  scanning: string | null
  scanActive: boolean
  activeScanId: string | null
  selectedBranch: Record<string, string>
  setSelectedBranch: React.Dispatch<React.SetStateAction<Record<string, string>>>
  branchInputOpen: string | null
  setBranchInputOpen: (v: string | null) => void
  postPrComment: boolean
  setPostPrComment: (v: boolean) => void
  scanAllBusy: boolean
  quota: QuotaInfo | null
  projects: { id: string; name: string; project_type: string }[]
  projectsLoading: boolean
  selectedProjectId: string
  setSelectedProjectId: (v: string) => void
  projectDropdownOpen: boolean
  setProjectDropdownOpen: (v: boolean) => void
  addRepo: () => Promise<void>
  removeRepo: (id: string) => Promise<void>
  scanPublicRepo: (cfg: RepoConfig) => Promise<void>
  scanAll: () => Promise<void>
  detectRepo: () => Promise<void>
  connectSse: (scanId: string) => void
  isPublicGitHub: boolean
  isPrivateUrl: boolean
  autoDetectedPublic: boolean
  webhookUrl: string
  autoFixPr: (scanId: string) => Promise<void>
  isAutoFixing: boolean
}

export function RepoConfigPanel({
  configs, loading, canManage, addOpen, setAddOpen, repoUrl, setRepoUrl, pat, setPat,
  saving, newConfig, setNewConfig, detecting, detectResult, setDetectResult,
  scanning, scanActive, activeScanId, selectedBranch, setSelectedBranch,
  branchInputOpen, setBranchInputOpen, postPrComment, setPostPrComment,
  scanAllBusy, quota, projects, projectsLoading, selectedProjectId,
  setSelectedProjectId, projectDropdownOpen, setProjectDropdownOpen,
  addRepo, removeRepo, scanPublicRepo, scanAll, detectRepo, connectSse,
  isPublicGitHub, isPrivateUrl, autoDetectedPublic, webhookUrl,
  autoFixPr, isAutoFixing
}: RepoConfigPanelProps) {
  const router = useRouter()
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [webhookSetupConfig, setWebhookSetupConfig] = useState<RepoConfig | null>(null)

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(label)
    setTimeout(() => setCopiedText(null), 2000)
  }

  const statusIcon = (status: string | null) => {
    switch (status) {
      case "completed": case "Good": return <CheckCircle className="w-3 h-3 text-success" />
      case "Warning": return <ShieldAlert className="w-3 h-3 text-severity-high" />
      case "failed": return <XCircle className="w-3 h-3 text-severity-critical" />
      case "cancelled": return <XCircle className="w-3 h-3 text-severity-medium" />
      case "running": return <Loader2 className="w-3 h-3 text-primary animate-spin" />
      case "queued": return <Clock className="w-3 h-3 text-fg-muted" />
      default: return <span className="w-3 h-3 rounded-full bg-fg-disabled inline-block" />
    }
  }

  const statusColor = (status: string | null): string => {
    switch (status) {
      case "Good": return "text-success"
      case "Warning": return "text-severity-high"
      case "failed": return "text-severity-critical"
      case "cancelled": return "text-severity-medium"
      case "running": return "text-primary"
      default: return "text-fg-muted"
    }
  }

  return (
    <>
      {/* Add Repository Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Add Repository</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="repo-url">Repository URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="repo-url"
                    value={repoUrl}
                    onChange={e => {
                      setRepoUrl(e.target.value)
                      setDetectResult({ status: null, message: "" })
                    }}
                    placeholder="https://github.com/org/repo"
                    className="font-mono text-sm flex-1"
                    autoFocus
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={detectRepo}
                    disabled={detecting || !repoUrl.trim()}
                    className="shrink-0 h-9"
                  >
                    {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              {detectResult.status === "public" && (
                <div className="bg-success-bg border border-severity-low-border rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <Unlock className="w-4 h-4 text-success shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-fg">Public repository</p>
                      <p className="text-[11px] text-fg-muted">{detectResult.message}</p>
                    </div>
                  </div>
                </div>
              )}
              {detectResult.status === "private" && (
                <div className="bg-severity-high-bg/50 border border-severity-high-border rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-severity-high shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-fg">Private repository detected</p>
                      <p className="text-[11px] text-fg-muted">{detectResult.message}</p>
                    </div>
                  </div>
                </div>
              )}
              {detectResult.status === "invalid" && (
                <div className="bg-severity-critical-bg/50 border border-severity-critical-border rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-severity-critical shrink-0" />
                    <p className="text-xs text-fg-muted">{detectResult.message}</p>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pat">GitHub Personal Access Token</Label>
                    {repoUrl.trim() && (
                      <Badge variant="outline" className={`text-[10px] font-mono ${pat.trim() ? 'bg-severity-high-bg text-severity-high border-severity-high-border' : 'bg-bg-muted text-fg-muted border-border'}`}>
                        {pat.trim() ? <><Lock className="w-2.5 h-2.5 mr-1" /> Private</> : <><Globe className="w-2.5 h-2.5 mr-1" /> Public (?)</>}
                      </Badge>
                    )}
                  </div>
                  <Input id="pat" type="password" value={pat} onChange={e => setPat(e.target.value)} placeholder="ghp_..." className="font-mono text-sm" />
                  <p className="text-[11px] text-fg-subtle leading-relaxed">
                    {pat.trim() ? "PAT is set — this will be configured as a Private repository." : "Enter a PAT for Private repositories, or leave blank for public repos."}
                  </p>
                </div>


              {/* Project Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Project</Label>
                {projectsLoading ? (
                  <div className="h-9 bg-bg-muted rounded-md animate-pulse" />
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                      className="w-full flex items-center justify-between gap-2 h-9 px-3 py-2 rounded-md border border-border bg-bg text-sm hover:border-severity-low-border/50 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <FolderGit2 className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                        <span className="truncate">
                          {selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name || "Unknown Project" : "Select a project..."}
                        </span>
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 text-fg-muted shrink-0 transition-transform ${projectDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {projectDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-panel border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {projects.length === 0 ? (
                          <div className="px-3 py-4 text-center">
                            <p className="text-xs text-fg-muted mb-2">No projects found</p>
                            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setProjectDropdownOpen(false); setAddOpen(false); router.push("/projects?action=new") }}>
                              <Plus className="w-3 h-3 mr-1" /> Create Project
                            </Button>
                          </div>
                        ) : (
                          <>
                            {projects.map(p => (
                              <button key={p.id} type="button" onClick={() => { setSelectedProjectId(p.id); setProjectDropdownOpen(false) }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-panel-hover transition-colors ${selectedProjectId === p.id ? 'bg-primary/10 text-primary' : 'text-fg'}`}>
                                <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{p.name}</span>
                                <span className="text-[10px] text-fg-subtle ml-auto capitalize">{p.project_type.replace(/_/g, " ")}</span>
                              </button>
                            ))}
                            <div className="border-t border-border px-2 py-1.5">
                              <button type="button" onClick={() => { setProjectDropdownOpen(false); setAddOpen(false); router.push("/projects?action=new") }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-panel-hover rounded transition-colors">
                                <Plus className="w-3 h-3" /> Create New Project
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PR Comment Toggle */}
              <div className="flex items-center justify-between py-2 px-3 bg-bg-muted/50 border border-border rounded-md">
                <div>
                  <Label htmlFor="post-pr-comment" className="text-xs font-medium cursor-pointer">Post scan summary as PR comment</Label>
                  <p className="text-[10px] text-fg-subtle">When enabled, VAPTShield will post a summary comment on the PR after each scan completes.</p>
                </div>
                <input id="post-pr-comment" type="checkbox" checked={postPrComment} onChange={(e) => setPostPrComment(e.target.checked)} className="h-4 w-4 shrink-0" />
              </div>

              {detectResult.status === "public" && !pat.trim() && (
                <Button onClick={addRepo} disabled={saving || !repoUrl.trim()} className="w-full" variant="default">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlock className="w-4 h-4 mr-2" />}
                  {saving ? "Connecting..." : "Add Public Repository"}
                </Button>
              )}
              {!["public", "private"].includes(detectResult.status || "") && (
                <Button onClick={addRepo} disabled={saving || !repoUrl.trim()} className="w-full" variant={pat.trim() ? "default" : "outline"}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitBranch className="w-4 h-4 mr-2" />}
                  {saving ? "Connecting..." : pat.trim() ? "Connect Private Repository" : "Add Repository"}
                </Button>
              )}
            </div>
        </DialogContent>
      </Dialog>

      {/* Quick Start hint */}
      {configs.filter(c => !c.is_private).length > 0 && (
        <div className="flex items-center gap-2 text-xs text-fg-muted bg-success-bg border border-severity-low-border rounded-md px-4 py-2.5">
          <Unlock className="w-3.5 h-3.5 text-success shrink-0" />
          <span>
            <strong className="text-fg">{configs.filter(c => !c.is_private).length} public {configs.filter(c => !c.is_private).length === 1 ? "repo" : "repos"} connected.</strong> Click <strong>Scan Now</strong> to run SAST + SCA + secrets scanning. Live results stream inline.
          </span>
        </div>
      )}

      {/* Connected Repositories */}
      <Card className="border-border">
        <CardHeader className="px-5 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Connected Repositories
              {configs.length > 0 && <span className="text-fg-muted font-normal ml-1.5">({configs.length})</span>}
            </CardTitle>
            {configs.length > 1 && canManage && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={scanAll} 
                disabled={scanAllBusy || configs.some(c => c.last_scan_status === "running" || c.last_scan_status === "queued")} 
                className="text-xs h-7"
              >
                {(scanAllBusy || configs.some(c => c.last_scan_status === "running" || c.last_scan_status === "queued")) 
                  ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scanning ({configs.filter(c => c.last_scan_status === "running" || c.last_scan_status === "queued").length}/{configs.length})</> 
                  : <><ScanLine className="w-3 h-3 mr-1" /> Scan All ({configs.length})</>
                }
              </Button>
            )}
          </div>
        </CardHeader>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="border border-border rounded-lg p-4 space-y-3 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-bg-muted" />
                  <div className="h-4 bg-bg-muted rounded w-2/3" />
                </div>
                <div className="h-3 bg-bg-muted rounded w-1/2" />
                <div className="flex gap-2 mt-2">
                  <div className="h-5 w-10 bg-bg-muted rounded-full" />
                  <div className="h-5 w-10 bg-bg-muted rounded-full" />
                  <div className="h-5 w-10 bg-bg-muted rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : configs.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center h-48 gap-3">
            <GitBranch className="w-10 h-10 text-fg-disabled" />
            <p className="text-sm text-fg-muted font-medium">No repositories connected</p>
            <p className="text-xs text-fg-subtle text-center max-w-sm">
              Connect a GitHub repository to automatically scan code for vulnerabilities,<br />
              dependency CVEs, and secrets — on push, pull request, or on demand.
            </p>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Connect your first repository
              </Button>
            )}
          </CardContent>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {configs.map(cfg => {
              const isPublic = !(cfg as any).encrypted_pat
              const stats = cfg.stats || { critical: 0, high: 0, medium: 0, low: 0, info: 0, lastScanId: null }
              const totalFindings = stats.critical + stats.high + stats.medium + stats.low + stats.info
              return (
                <div key={cfg.id} className="border border-border rounded-lg p-4 hover:border-severity-low-border/50 hover:bg-panel-hover transition-all space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isPublic ? <Globe className="w-4 h-4 text-success shrink-0" /> : <Lock className="w-4 h-4 text-severity-high shrink-0" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{cfg.repo_name}</span>
                          {isPublic ? <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono text-success border-severity-low-border bg-success-bg/50">PUBLIC</Badge>
                            : <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono text-severity-high border-severity-high-border bg-severity-high-bg/50">PRIVATE</Badge>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-mono text-fg-muted truncate max-w-[200px]" title={cfg.repo_url}>{cfg.repo_url}</span>
                          <span className="text-fg-disabled">·</span>
                          {branchInputOpen === cfg.id ? (
                            <Input value={selectedBranch[cfg.id] || (cfg.branch === 'main' ? 'default' : cfg.branch) || "default"} onChange={(e) => setSelectedBranch(prev => ({ ...prev, [cfg.id]: e.target.value }))}
                              placeholder="branch" className="w-20 h-5 text-[9px] font-mono px-1.5 py-0 bg-bg-muted border-border"
                              onKeyDown={(e) => { if (e.key === "Enter") setBranchInputOpen(null) }}
                              onBlur={() => setTimeout(() => setBranchInputOpen(null), 150)} autoFocus />
                          ) : (
                            <button onClick={() => { setSelectedBranch(prev => ({ ...prev, [cfg.id]: prev[cfg.id] || (cfg.branch === 'main' ? 'default' : cfg.branch) || "default" })); setBranchInputOpen(cfg.id) }}
                              className="text-[10px] font-mono text-fg-subtle hover:text-fg-muted flex items-center gap-1 whitespace-nowrap bg-bg-subtle px-1.5 py-0.5 rounded border border-border/50" title="Click to change branch">
                              <GitBranch className="w-2.5 h-2.5" />
                              <span className="max-w-[80px] truncate">{selectedBranch[cfg.id] || (cfg.branch === 'main' ? 'default' : cfg.branch) || "default"}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 ml-2 flex flex-col items-end gap-1.5">
                      {cfg.last_scan_at ? (
                        <div className={`flex items-center gap-1 text-[10px] font-mono ${statusColor(cfg.last_scan_status)}`}>
                          {statusIcon(cfg.last_scan_status)}
                          <span>{cfg.last_scan_status}</span>
                        </div>
                      ) : <span className="text-[10px] font-mono text-fg-disabled">No scans</span>}
                      
                      <div className="flex items-center gap-2">
                        {(cfg as any).encrypted_pat && (
                          <button onClick={() => setWebhookSetupConfig(cfg)} className="text-[10px] font-mono text-fg-muted hover:text-fg flex items-center gap-1" title="Webhook Setup">
                            <Webhook className="w-3 h-3"/>
                          </button>
                        )}
                        <button onClick={() => router.push(`/scanner/history?repo=${encodeURIComponent(cfg.repo_url)}`)} className="text-[10px] font-mono text-primary hover:text-primary-hover flex items-center gap-1" title="Scan History">
                          <History className="w-3 h-3"/>
                        </button>
                        {canManage && <button onClick={() => removeRepo(cfg.id)} className="text-[10px] font-mono text-severity-critical hover:opacity-80 flex items-center gap-1" title="Remove repository"><Trash2 className="w-3 h-3" /></button>}
                      </div>
                    </div>
                  </div>

                  {totalFindings > 0 ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      {stats.critical > 0 && <span className="text-[10px] font-mono bg-severity-critical-bg/50 text-severity-critical border border-severity-critical-border rounded-full px-2 py-0.5">🔴 {stats.critical} Critical</span>}
                      {stats.high > 0 && <span className="text-[10px] font-mono bg-severity-high-bg/50 text-severity-high border border-severity-high-border rounded-full px-2 py-0.5">🟠 {stats.high} High</span>}
                      {stats.medium > 0 && <span className="text-[10px] font-mono bg-severity-medium-bg/50 text-severity-medium border border-severity-medium-border rounded-full px-2 py-0.5">🟡 {stats.medium} Medium</span>}
                      {stats.low > 0 && <span className="text-[10px] font-mono bg-bg-muted text-fg-muted border border-border rounded-full px-2 py-0.5">🔵 {stats.low} Low</span>}
                      {stats.info > 0 && <span className="text-[10px] font-mono bg-bg-muted text-fg-muted border border-border rounded-full px-2 py-0.5">{stats.info} Info</span>}
                      <span className="text-[9px] text-fg-disabled ml-auto">org data</span>
                    </div>
                  ) : cfg.last_scan_at ? (
                    <p className="text-[10px] text-fg-disabled">No findings in last scan</p>
                  ) : (
                    <p className="text-[10px] text-fg-disabled">No scans yet — click "Scan" to run your first scan</p>
                  )}

                  {canManage && (
                    <div className="flex flex-wrap items-center gap-2 pt-3 mt-1 border-t border-border/50">
                      {/* View Live State button (for completed scans) */}
                      {["Warning", "Good", "failed"].includes(cfg.last_scan_status || "") && cfg.stats?.lastScanId && (
                        <>
                          <Button variant="outline" size="sm" className="h-7 text-xs font-mono" onClick={() => connectSse(cfg.stats!.lastScanId!)}>
                            <Activity className="w-3.5 h-3.5 mr-1" /> Live State
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs font-mono" asChild>
                            <a href={`/report/${cfg.stats!.lastScanId}`} target="_blank">
                              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Report
                            </a>
                          </Button>
                        </>
                      )}
                      
                      {/* View Live Progress button for active scans */}
                      {(cfg.last_scan_status === "running" || cfg.last_scan_status === "queued" || scanning === cfg.id) && cfg.stats?.activeScanId && (
                         <Button variant="default" size="sm" className="h-7 text-xs font-mono animate-pulse" onClick={() => connectSse(cfg.stats!.activeScanId!)}>
                           <Activity className="w-3.5 h-3.5 mr-1" /> Live
                         </Button>
                      )}
                      
                      {/* Auto-Fix PR button */}
                      {cfg.last_scan_status === "Warning" && (cfg.stats?.lastScanId || cfg.stats?.activeScanId) && (
                        <Button variant="secondary" size="sm" className="h-7 text-xs font-mono" onClick={() => { const scanId = cfg.stats?.lastScanId || cfg.stats?.activeScanId; if (scanId) autoFixPr(scanId); }} disabled={isAutoFixing}>
                          {isAutoFixing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} 
                          Auto-Fix
                        </Button>
                      )}
                      
                      {/* Scan Now / Re-scan button */}
                      <Button variant="default" size="sm" className="h-7 text-xs font-mono ml-auto" onClick={() => scanPublicRepo(cfg)} disabled={scanning === cfg.id || (scanActive && activeScanId !== null)} title={["Warning", "Good", "failed"].includes(cfg.last_scan_status || "") ? "Re-scan this repository" : "Start a new scan"}>
                        {cfg.last_scan_status === "running" || cfg.last_scan_status === "queued" ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> In Progress</>
                          : scanning === cfg.id ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Scanning...</>
                          : ["Warning", "Good", "failed"].includes(cfg.last_scan_status || "") ? <><ScanLine className="w-3.5 h-3.5 mr-1" /> Re-scan</>
                          : <><ScanLine className="w-3.5 h-3.5 mr-1" /> Scan</>}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* New Config: Private repo webhook setup */}
      {(newConfig as any)?.encrypted_pat && (
        <Card className="border-severity-low-border bg-severity-low-bg/30">
          <CardHeader className="px-5 py-3 border-b border-severity-low-border flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-severity-low flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Repository Connected — Webhook Setup
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setNewConfig(null)} className="text-xs h-7">Dismiss</Button>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <p className="text-sm text-fg-muted">Add the following webhook to your GitHub repository to enable automatic scanning on push and pull requests.</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-fg-muted font-mono">Webhook URL</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-bg border border-border rounded px-2 py-1.5 break-all">{webhookUrl}</code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl, "Webhook URL")} className="shrink-0 h-7 text-[11px]"><Copy className="w-3 h-3 mr-1" /> Copy</Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-fg-muted font-mono">Webhook Secret</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-bg border border-border rounded px-2 py-1.5 break-all">{newConfig?.webhook_secret}</code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(newConfig?.webhook_secret || "", "Webhook secret")} className="shrink-0 h-7 text-[11px]"><Copy className="w-3 h-3 mr-1" /> Copy</Button>
                </div>
              </div>
            </div>
            <Alert className="border-border bg-bg">
              <AlertDescription className="text-xs text-fg-muted space-y-1">
                <p className="font-medium text-fg">GitHub Setup Instructions:</p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Go to your repository on GitHub: <code className="text-[10px] font-mono bg-bg-muted px-1 rounded">{newConfig?.repo_name}</code></li>
                  <li>Navigate to <strong>Settings → Webhooks → Add webhook</strong></li>
                  <li>Paste the <strong>Webhook URL</strong> in the "Payload URL" field</li>
                  <li>Set <strong>Content type</strong> to <code className="text-[10px] font-mono bg-bg-muted px-1 rounded">application/json</code></li>
                  <li>Paste the <strong>Secret</strong> in the "Secret" field</li>
                  <li>Select <strong>"Send me everything"</strong> or choose <strong>"Let me select individual events"</strong> and check <strong>Pushes</strong> and <strong>Pull requests</strong></li>
                  <li>Click <strong>Add webhook</strong></li>
                </ol>
                <p className="mt-2 text-fg-subtle">Once configured, VAPTShield will automatically scan every push and pull request for security issues.</p>
              </AlertDescription>
            </Alert>
            <div className="flex items-center gap-2 text-xs text-fg-muted bg-bg border border-border rounded-md p-3">
              <Shield className="w-4 h-4 text-primary shrink-0" />
              <span>Webhook is active and ready. Push to your repository or open a pull request to trigger your first scan.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Config: Public repo info */}
      {newConfig && !newConfig.is_private && (
        <Card className="border-severity-low-border bg-success-bg/30">
          <CardHeader className="px-5 py-3 border-b border-severity-low-border flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-success flex items-center gap-2">
              <Globe className="w-4 h-4" /> Public Repository Added
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setNewConfig(null)} className="text-xs h-7">Dismiss</Button>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm text-fg-muted"><strong className="text-fg">{newConfig.repo_name}</strong> is a public repository. No webhook or PAT needed.</p>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => { const cfg = configs.find(c => c.id === newConfig.id); if (cfg) scanPublicRepo(cfg) }} disabled={scanning === newConfig.id || (scanActive && activeScanId !== null)}>
                {scanning === newConfig.id ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...</> : <><ScanLine className="w-4 h-4 mr-2" /> Scan Now</>}
              </Button>
              <span className="text-xs text-fg-subtle">Cloned to an isolated ephemeral environment, all 3 scanners run sequentially, then code is securely wiped.</span>
            </div>
            <Alert className="border-border bg-bg mt-2">
              <AlertDescription className="text-xs text-fg-muted flex items-start gap-2">
                <Shield className="w-3.5 h-3.5 text-severity-high shrink-0 mt-0.5" />
                <span><strong>Security:</strong> Code is cloned to an isolated, ephemeral environment, scanned, and securely wiped immediately after completion. No code persists after the scan.</span>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Existing Config: Webhook Setup Dialog */}
      <Dialog open={webhookSetupConfig !== null} onOpenChange={(open) => !open && setWebhookSetupConfig(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-primary" /> Webhook Setup
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-fg-muted">Add the following webhook to your GitHub repository to enable automatic scanning on push and pull requests for <strong>{webhookSetupConfig?.repo_name}</strong>.</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-fg-muted font-mono">Webhook URL</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-bg border border-border rounded px-2 py-1.5 break-all">{webhookUrl}</code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl, "Webhook URL")} className="shrink-0 h-7 text-[11px]"><Copy className="w-3 h-3 mr-1" /> Copy</Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-fg-muted font-mono">Webhook Secret</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-bg border border-border rounded px-2 py-1.5 break-all text-fg-muted italic">Hidden for security (Rotate secret in API to get a new one)</code>
                </div>
              </div>
            </div>
            <Alert className="border-border bg-bg">
              <AlertDescription className="text-xs text-fg-muted space-y-1">
                <p className="font-medium text-fg">GitHub Setup Instructions:</p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Go to your repository on GitHub: <code className="text-[10px] font-mono bg-bg-muted px-1 rounded">{webhookSetupConfig?.repo_name}</code></li>
                  <li>Navigate to <strong>Settings → Webhooks → Add webhook</strong></li>
                  <li>Paste the <strong>Webhook URL</strong> in the "Payload URL" field</li>
                  <li>Set <strong>Content type</strong> to <code className="text-[10px] font-mono bg-bg-muted px-1 rounded">application/json</code></li>
                  <li>Select <strong>"Send me everything"</strong> or choose <strong>"Let me select individual events"</strong> and check <strong>Pushes</strong> and <strong>Pull requests</strong></li>
                  <li>Click <strong>Add webhook</strong></li>
                </ol>
              </AlertDescription>
            </Alert>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
