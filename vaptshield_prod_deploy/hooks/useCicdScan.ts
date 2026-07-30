"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export interface RepoStats {
  critical: number
  high: number
  medium: number
  low: number
  info: number
  lastScanId: string | null
  activeScanId?: string | null
}

export interface QuotaInfo {
  ci_scans_today: number
  max_ci_scans_per_day: number
  plan_tier: string
  ci_scans_reset_at: string | null
  active_docker_containers: number
  max_docker_containers: number
  paid_extra_docker: number
}

export interface RepoConfig {
  id: string
  repo_url: string
  repo_name: string
  repo_owner: string | null
  branch: string
  is_active: boolean
  last_scan_at: string | null
  last_scan_status: string | null
  is_private: boolean
  created_at: string
  stats?: RepoStats
}

export interface ProjectOption {
  id: string
  name: string
  project_type: string
}

export interface UseCicdScanOptions {
  connectSse: (scanId: string) => void
  disconnectSse: () => void
  sseConnectedRef: React.MutableRefObject<string | null>
  streamStatus: "idle" | "running" | "completed" | "failed" | "cancelled"
  setStreamFindings?: React.Dispatch<React.SetStateAction<any[]>>
  setActiveRepoName?: (name: string) => void
}

export interface UseCicdScanReturn {
  // Config state
  configs: RepoConfig[]
  loading: boolean
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
  userRole: string | null
  roleLoading: boolean
  scanning: string | null
  activeConfigId: string | null
  setActiveConfigId: (v: string | null) => void
  selectedBranch: Record<string, string>
  setSelectedBranch: React.Dispatch<React.SetStateAction<Record<string, string>>>
  branchInputOpen: string | null
  setBranchInputOpen: (v: string | null) => void
  postPrComment: boolean
  setPostPrComment: (v: boolean) => void
  scanAllBusy: boolean
  quota: QuotaInfo | null
  quotaLoading: boolean
  cancelling: boolean
  expandedFindings: Record<string, boolean>
  setExpandedFindings: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  viewFinding: any
  setViewFinding: (v: any) => void

  // Project selector
  projects: ProjectOption[]
  projectsLoading: boolean
  selectedProjectId: string
  setSelectedProjectId: (v: string) => void
  projectDropdownOpen: boolean
  setProjectDropdownOpen: (v: boolean) => void

  // Actions
  fetchConfigs: () => Promise<void>
  addRepo: () => Promise<void>
  removeRepo: (id: string) => Promise<void>
  scanPublicRepo: (cfg: RepoConfig) => Promise<void>
  scanAll: () => Promise<void>
  detectRepo: () => Promise<void>
  cancelScan: () => Promise<void>
  toggleFinding: (id: string) => void
  approveFinding: (id: string) => Promise<void>
  deleteFinding: (id: string) => Promise<void>
  isPublicGitHub: boolean
  isPrivateUrl: boolean
  autoDetectedPublic: boolean
  canManage: boolean
  autoFixPr: (scanId: string) => Promise<void>
  isAutoFixing: boolean
  retryScan: (scanId: string) => Promise<void>
}

export function useCicdScan({
  connectSse,
  disconnectSse,
  sseConnectedRef,
  streamStatus,
  setStreamFindings,
  setActiveRepoName,
}: UseCicdScanOptions): UseCicdScanReturn {
  const router = useRouter()

  const [configs, setConfigs] = useState<RepoConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [repoUrl, setRepoUrl] = useState("")
  const [pat, setPat] = useState("")
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newConfig, setNewConfig] = useState<{ id: string; repo_url: string; repo_name: string; webhook_secret: string; is_private: boolean } | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState<{ status: "public" | "private" | "invalid" | null; message: string }>({ status: null, message: "" })
  const [userRole, setUserRole] = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)
  const [scanning, setScanning] = useState<string | null>(null)
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<Record<string, string>>({})
  const [branchInputOpen, setBranchInputOpen] = useState<string | null>(null)
  const [postPrComment, setPostPrComment] = useState(false)
  const [scanAllBusy, setScanAllBusy] = useState(false)
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({})
  const [viewFinding, setViewFinding] = useState<any>(null)
  const [isAutoFixing, setIsAutoFixing] = useState(false)

  // Project selector
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false)

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects")
      const data = await res.json()
      if (data.projects) {
        setProjects(data.projects)
        if (!selectedProjectId && data.projects.length > 0) {
          setSelectedProjectId(data.projects[0].id)
        }
      }
    } catch {} finally {
      setProjectsLoading(false)
    }
  }, [selectedProjectId])

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/cicd/config")
      const data = await res.json()
      if (data.configs) setConfigs(data.configs)
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/cicd/quota")
      const data = await res.json()
      if (!data.error) setQuota(data)
    } catch {} finally {
      setQuotaLoading(false)
    }
  }, [])

  const repoUrlParts = (url: string) => {
    const clean = url.replace(/\.git$/, "").replace(/\/$/, "")
    const parts = clean.split("/")
    return { owner: parts[parts.length - 2] || "", repo: parts[parts.length - 1] || "", full: clean }
  }

  const isPublicGitHub = /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[^\/]+\/[^\/]+(\.git)?$/.test(repoUrl.trim())
  const isPrivateUrl = !!pat.trim()
  const autoDetectedPublic = isPublicGitHub && !pat.trim()

  const canManage = userRole === "admin" || userRole === "security_engineer"

  useEffect(() => {
    if (!roleLoading && !canManage) {
      router.replace("/dashboard")
    }
  }, [roleLoading, canManage, router])

  // Poll configs while any scan is active
  const anyRunning = configs.some(c => c.last_scan_status === "running" || c.last_scan_status === "queued")
  useEffect(() => {
    if (!anyRunning && (!sseConnectedRef.current || streamStatus === "idle" || streamStatus === "completed")) return
    const interval = setInterval(() => {
      fetchConfigs()
      fetchQuota()
    }, 3000)
    return () => clearInterval(interval)
  }, [anyRunning, sseConnectedRef, streamStatus, fetchConfigs, fetchQuota])

  // Auto-refresh findings and quota on complete
  useEffect(() => {
    if (streamStatus === "completed" || streamStatus === "failed") {
      fetchConfigs()
      fetchQuota()
      setScanning(null)
    }
  }, [streamStatus, fetchConfigs, fetchQuota])

  // Init
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        setUserRole(d.profile?.role || null)
        setRoleLoading(false)
      })
      .catch(() => setRoleLoading(false))
    fetchConfigs()
    fetchQuota()
    fetchProjects()
  }, [fetchConfigs, fetchQuota, fetchProjects])

  const addRepo = async () => {
    if (!repoUrl.trim()) { toast.error("Repository URL is required"); return }
    setSaving(true)
    try {
      const { owner: detectedOwner } = repoUrlParts(repoUrl.trim())
      const res = await fetch("/api/cicd/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_url: repoUrl.trim(),
          pat: pat.trim() || undefined,
          repo_owner: detectedOwner || undefined,
          project_id: selectedProjectId || undefined,
          post_pr_comment: postPrComment,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          toast.info(data.error || "Repository is already connected")
          setAddOpen(false)
          setRepoUrl("")
          setPat("")
          setDetectResult({ status: null, message: "" })
          await fetchConfigs()
          return
        }
        toast.error(data.error || "Failed to save")
        return
      }
      setAddOpen(false)
      setNewConfig({ ...data.config, is_private: isPrivateUrl })
      if (!isPrivateUrl) {
        toast.success("Public repository added")
      } else {
        toast.success("Private repository connected")
      }
      setRepoUrl("")
      setPat("")
      await fetchConfigs()
    } catch {
      toast.error("Failed to save repository config")
    } finally {
      setSaving(false)
    }
  }

  const removeRepo = async (id: string) => {
    try {
      const res = await fetch(`/api/cicd/config?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (!res.ok) { toast.error("Failed to remove"); return }
      toast.success("Repository disconnected")
      setNewConfig(null)
      await fetchConfigs()
    } catch {
      toast.error("Failed to remove repository")
    }
  }

  const scanPublicRepo = async (cfg: RepoConfig) => {
    // If there's truly an active SSE connection running, block
    if (sseConnectedRef.current && streamStatus === "running") {
      toast.error("A scan is already in progress. Wait for it to complete or click 'Stop'.")
      return
    }
    // If stale state detected, clean up so user can start a new scan
    if (sseConnectedRef.current && streamStatus !== "running") {
      disconnectSse()
    }
    setActiveConfigId(cfg.id)
    setScanning(cfg.id)
    try {
      const res = await fetch("/api/cicd/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cfg.id, action: "scan", branch: selectedBranch[cfg.id] || (cfg.branch === 'main' ? 'default' : cfg.branch) || "default" }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Scan failed"); setScanning(null); return }
      
      // Set active repo name for SSE UI
      if (setActiveRepoName) {
        setActiveRepoName(cfg.repo_name)
      }
      
      connectSse(data.scanId)
      await fetchConfigs()
    } catch {
      toast.error("Failed to start scan")
      setScanning(null)
    } finally {
      // Don't clear scanning here — it gets cleared when SSE completes
    }
  }

  const scanAll = async () => {
    setScanAllBusy(true)
    try {
      const res = await fetch("/api/cicd/scan-all", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Scan All failed")
        return
      }
      toast.success(data.message || "Triggered scan on all repos", {
        description: data.results?.map((r: any) => 
          r.scanId ? `✓ ${r.repoName}: Started` : `✕ ${r.repoName}: ${r.error || 'Failed'}`
        ).join('\n')
      })
      await fetchConfigs()
    } catch {
      toast.error("Scan All failed")
    } finally {
      setScanAllBusy(false)
    }
  }

  const detectRepo = async () => {
    if (!repoUrl.trim()) { toast.error("Enter a repository URL first"); return }
    const match = repoUrl.trim().match(/^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/([^\/]+)\/([^\/]+?)(?:\.git)?\/?$/)
    if (!match) { toast.error("Invalid Repository URL format"); return }
    const [, domain, owner, repo] = match
    
    if (domain !== "github.com") {
      setDetectResult({ status: "public", message: `Valid ${domain} repository. Enter PAT if it is private.` })
      return
    }

    setDetecting(true)
    setDetectResult({ status: null, message: "" })
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`)
      if (res.ok) {
        const data = await res.json()
        if (data.private) {
          setDetectResult({ status: "private", message: `Private repository — PAT required to scan` })
        } else {
          setDetectResult({ status: "public", message: `Public repository detected` })
        }
      } else if (res.status === 404) {
        setDetectResult({ status: "invalid", message: "Repository not found or is private" })
      } else {
        setDetectResult({ status: "invalid", message: "Unable to detect — enter a PAT if it's private" })
      }
    } catch {
      setDetectResult({ status: "invalid", message: "Network error — check the URL and try again" })
    } finally {
      setDetecting(false)
    }
  }

  const cancelScan = async () => {
    if (!sseConnectedRef.current) return
    setCancelling(true)
    try {
      const res = await fetch("/api/cicd/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: sseConnectedRef.current }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to cancel scan")
        return
      }
      toast.success("Scan cancelled")
      disconnectSse()
      await fetchConfigs()
    } catch {
      toast.error("Failed to cancel scan")
    } finally {
      setCancelling(false)
    }
  }

  const toggleFinding = useCallback((id: string) => {
    setExpandedFindings(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const retryScan = async (scanId: string) => {
    if (sseConnectedRef.current && streamStatus === "running") {
      toast.error("A scan is already in progress.")
      return
    }
    
    // Clean up current SSE if it's connected but not running
    if (sseConnectedRef.current) {
      disconnectSse()
    }
    
    setScanning(scanId) // Temporary feedback
    try {
      const res = await fetch("/api/cicd/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to retry scan")
        setScanning(null)
        return
      }
      toast.success("Retrying scan without decrementing quota...")
      connectSse(data.scanId)
      await fetchConfigs()
    } catch {
      toast.error("Failed to retry scan")
      setScanning(null)
    }
  }

  const approveFinding = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/scan-findings/${id}/approve`, { method: "POST" })
      if (!res.ok) { toast.error("Failed to approve finding"); return }
      toast.success("Finding approved")
    } catch { toast.error("Failed to approve finding") }
  }, [])

  const deleteFinding = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/findings/${id}`, { method: "DELETE" })
      if (!res.ok) { toast.error("Failed to delete finding"); return }
      toast.success("Finding deleted")
      if (setStreamFindings) {
        setStreamFindings(prev => prev.filter(f => f.id !== id))
      }
    } catch { toast.error("Failed to delete finding") }
  }, [setStreamFindings])

  const autoFixPr = async (scanId: string) => {
    setIsAutoFixing(true)
    try {
      const res = await fetch("/api/ai/autofix-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId })
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Failed to generate Auto-Fix PR")
        return
      }
      toast.success("Auto-Fix PR Created Successfully!", {
        action: {
          label: "View PR",
          onClick: () => window.open(data.prUrl, "_blank")
        }
      })
    } catch {
      toast.error("Failed to generate Auto-Fix PR")
    } finally {
      setIsAutoFixing(false)
    }
  }

  return {
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
    setActiveConfigId,
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
    fetchConfigs,
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
  }
}