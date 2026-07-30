"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip"
import {
  GitBranch, ShieldAlert, Bug, Key, ScanLine, History, Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import ToolCard3d from "@/components/scanner/cicd/ToolCard3d"
import { useCicdScan } from "@/hooks/useCicdScan"
import { useCicdSse, type PipelineStage } from "@/hooks/useCicdSse"
import { RepoConfigPanel } from "@/components/scanner/cicd/RepoConfigPanel"
import { PipelineStages } from "@/components/scanner/cicd/PipelineStages"
import { FindingsPanel } from "@/components/scanner/cicd/FindingsPanel"

const CICD_STAGES: Omit<PipelineStage, "status" | "duration">[] = [
  { id: "clone", label: "Clone", icon: <GitBranch className="w-3.5 h-3.5" /> },
  { id: "semgrep", label: "Semgrep", icon: <Bug className="w-3.5 h-3.5" /> },
  { id: "trivy", label: "Trivy", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  { id: "gitleaks", label: "Gitleaks", icon: <Key className="w-3.5 h-3.5" /> },
]


export default function CicdConfigPage() {
  const router = useRouter()

  // ── SSE hook (must come first so useCicdScan can wire into it)
  const sse = useCicdSse({ CICD_STAGES })

  const {
    activeScanId,
    activeRepoName,
    streamLogs,
    streamStatus,
    streamFindings,
    streamToolBreakdown,
    streamProgress,
    streamError,
    pipelineStages,
    logExpanded,
    logCollapsed,
    toolCardsStatus,
    scanResult,
    scanStartTime,
    scanElapsed,
    sseConnectedRef,
    setActiveScanId,
    setActiveRepoName,
    setLogExpanded,
    setLogCollapsed,
    connectSse,
    disconnectSse,
  } = sse

  // ── Scan/business logic hook
  const scan = useCicdScan({
    connectSse: sse.connectSse,
    disconnectSse: sse.disconnectSse,
    sseConnectedRef: sse.sseConnectedRef,
    streamStatus: sse.streamStatus,
    setStreamFindings: sse.setStreamFindings,
    setActiveRepoName: sse.setActiveRepoName,
  })

  const {
    configs,
    loading,
    addOpen,
    setAddOpen,
    repoUrl,
    setRepoUrl,
    pat,
    setPat,
    saving,
    newConfig,
    setNewConfig,
    detecting,
    detectResult,
    setDetectResult,
    userRole,
    roleLoading,
    scanning,
    activeConfigId,
    selectedBranch,
    setSelectedBranch,
    branchInputOpen,
    setBranchInputOpen,
    postPrComment,
    setPostPrComment,
    scanAllBusy,
    quota,
    quotaLoading,
    cancelling,
    expandedFindings,
    setExpandedFindings,
    viewFinding,
    setViewFinding,
    projects,
    projectsLoading,
    selectedProjectId,
    setSelectedProjectId,
    projectDropdownOpen,
    setProjectDropdownOpen,
    addRepo,
    removeRepo,
    scanPublicRepo,
    scanAll,
    detectRepo,
    cancelScan,
    toggleFinding,
    approveFinding,
    deleteFinding,
    isPublicGitHub,
    isPrivateUrl,
    autoDetectedPublic,
    canManage,
    autoFixPr,
    isAutoFixing,
    retryScan,
  } = scan

  const showPipeline = sse.activeScanId !== null

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    const origin = window.location.origin
    return `${origin}/api/cicd/webhook`
  }, [])

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  // ── Role-based redirect
  if (!roleLoading && !canManage) {
    router.replace("/dashboard")
    return null
  }

  if (roleLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-16 w-full" />
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const quotaUsed = quota?.ci_scans_today ?? 0
  const quotaMax = quota?.max_ci_scans_per_day ?? 0
  const quotaPct = quotaMax > 0 ? Math.round((quotaUsed / quotaMax) * 100) : 0

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
      {/* ═══════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ScanLine className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">CI/CD Security Scanner</h1>
            <p className="text-sm text-fg-muted">
              Scan repositories with Semgrep, Trivy, and Gitleaks — inline live pipeline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!quotaLoading && quota && (
            <div className="flex items-center gap-2 text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-mono cursor-help ${
                      quotaPct >= 90
                        ? "text-severity-critical border-severity-critical-border bg-severity-critical-bg/30"
                        : quotaPct >= 70
                        ? "text-severity-high border-severity-high-border bg-severity-high-bg/30"
                        : "text-fg-muted border-border"
                    }`}
                  >
                    {quotaUsed}/{quotaMax} scans today
                    {quotaPct >= 70 && <span className="ml-1">({quotaPct}%)</span>}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                  <p className="font-medium">CI/CD Scan Quota</p>
                  <p className="text-fg-subtle mt-1">
                    {quota.plan_tier === "free"
                      ? "Free plan: 3 scans/day. Upgrade to Pro for unlimited scans."
                      : `Your ${quota.plan_tier.replace("_", " ")} plan allows ${quotaMax} scans per day.`}
                  </p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-mono cursor-help ${
                      quota.active_docker_containers >= (quota.max_docker_containers + quota.paid_extra_docker)
                        ? "text-severity-critical border-severity-critical-border bg-severity-critical-bg/30"
                        : "text-fg-muted border-border"
                    }`}
                  >
                    {quota.active_docker_containers}/{quota.max_docker_containers + quota.paid_extra_docker} slots
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                  <p className="font-medium">Active Docker Containers</p>
                  <p className="text-fg-subtle mt-1">
                    Number of currently running concurrent scans. You can run up to {quota.max_docker_containers + quota.paid_extra_docker} at a time.
                  </p>
                </TooltipContent>
              </Tooltip>
              <span className="text-fg-subtle">
                {quota.plan_tier.replace("_", " ")} plan
              </span>
            </div>
          )}
          {canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Repository
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.push("/scanner/history")} className="text-xs">
            <History className="w-3.5 h-3.5 mr-1.5" /> Scan History
          </Button>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          CONNECTED REPOSITORIES — Full-width below header
          ═══════════════════════════════════════════════════════════ */}
      <RepoConfigPanel
        configs={configs}
        loading={loading}
        canManage={canManage}
        addOpen={addOpen}
        setAddOpen={setAddOpen}
        repoUrl={repoUrl}
        setRepoUrl={setRepoUrl}
        pat={pat}
        setPat={setPat}
        saving={saving}
        newConfig={newConfig}
        setNewConfig={setNewConfig}
        detecting={detecting}
        detectResult={detectResult}
        setDetectResult={setDetectResult}
        scanning={scanning}
        scanActive={showPipeline}
        activeScanId={sse.activeScanId}
        selectedBranch={selectedBranch}
        setSelectedBranch={setSelectedBranch}
        branchInputOpen={branchInputOpen}
        setBranchInputOpen={setBranchInputOpen}
        postPrComment={postPrComment}
        setPostPrComment={setPostPrComment}
        scanAllBusy={scanAllBusy}
        quota={quota}
        projects={projects}
        projectsLoading={projectsLoading}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        projectDropdownOpen={projectDropdownOpen}
        setProjectDropdownOpen={setProjectDropdownOpen}
        addRepo={addRepo}
        removeRepo={removeRepo}
        scanPublicRepo={scanPublicRepo}
        scanAll={scanAll}
        detectRepo={detectRepo}
        connectSse={sse.connectSse}
        isPublicGitHub={isPublicGitHub}
        isPrivateUrl={isPrivateUrl}
        autoDetectedPublic={autoDetectedPublic}
        webhookUrl={webhookUrl}
        autoFixPr={autoFixPr}
        isAutoFixing={isAutoFixing}
      />



      {/* ═══════════════════════════════════════════════════════════
          LIVE PIPELINE VIEW
          ═══════════════════════════════════════════════════════════ */}
      {showPipeline && (
        <PipelineStages
          activeRepoName={sse.activeRepoName}
          activeScanId={sse.activeScanId}
          streamStatus={sse.streamStatus}
          streamFindings={sse.streamFindings}
          streamLogs={sse.streamLogs}
          streamProgress={sse.streamProgress}
          streamError={sse.streamError}
          pipelineStages={sse.pipelineStages}
          logExpanded={sse.logExpanded}
          logCollapsed={sse.logCollapsed}
          toolCardsStatus={sse.toolCardsStatus}
          scanResult={sse.scanResult}
          scanElapsed={sse.scanElapsed}
          cancelling={cancelling}
          onLogExpandedChange={sse.setLogExpanded}
          onLogCollapsedChange={sse.setLogCollapsed}
          onCancel={cancelScan}
          onDisconnect={sse.disconnectSse}
          formatElapsed={formatElapsed}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          FINDINGS PANEL
          ═══════════════════════════════════════════════════════════ */}
      {showPipeline && (
        <FindingsPanel
          streamStatus={sse.streamStatus}
          streamFindings={sse.streamFindings}
          streamToolBreakdown={sse.streamToolBreakdown}
          streamError={sse.streamError}
          activeRepoName={sse.activeRepoName}
          activeScanId={sse.activeScanId}
          toolCardsStatus={sse.toolCardsStatus}
          streamProgress={sse.streamProgress}
          configs={configs}
          expandedFindings={expandedFindings}
          viewFinding={viewFinding}
          onToggleFinding={toggleFinding}
          onApproveFinding={approveFinding}
          onDeleteFinding={deleteFinding}
          onViewFinding={setViewFinding}
          onDisconnect={sse.disconnectSse}
          onRetry={() => {
            if (sse.activeScanId) {
              scan.retryScan(sse.activeScanId)
            }
          }}
        />
      )}
    </div>
    </TooltipProvider>
  )
}
