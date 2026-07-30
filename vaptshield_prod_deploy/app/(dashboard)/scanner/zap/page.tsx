"use client"

import { Suspense, useState, useEffect, useCallback, useMemo, useRef, UIEvent } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Radar, Play, Square, AlertTriangle, CheckCircle, Loader2,
  ExternalLink, ShieldAlert, Activity, ScanLine, Globe, Info,
  Search, Settings2, ShieldCheck, Zap, Eye, Bug, KeyRound, Lock, User, AtSign, EyeOff,
  ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Server,
  Terminal, Crosshair, Target, Radio, SlidersHorizontal, ListChecks,
  AlertOctagon, Siren, Scan, ArrowRight, Shield, Copy, ChevronUp, ArrowDownToLine, PieChart as PieChartIcon, RotateCcw
} from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { ZapAlertDetail } from "@/components/findings/ZapAlertDetail"
import { FindingForm } from "@/components/findings/FindingForm"
import type { InitialFindingData } from "@/components/findings/FindingForm"

interface Project {
  id: string
  name: string
  scope: string | null
}

interface ScanFinding {
  id: string
  title: string | null
  severity: string | null
  description: string | null
  url?: string | null
  method?: string | null
  statusCode?: number | null
  raw_data: Record<string, unknown> | null
  confidence?: string | null
  cweid?: string | null
  instances_count?: number | null
  riskcode?: string | null
  param?: string | null
  attack?: string | null
  evidence?: string | null
  solution?: string | null
  reference?: string | null
  other?: string | null
  wascid?: string | null
}

const PHASE_LABELS: Record<string, string> = {
  spawning_playwright: "Spawning Browser",
  playwright_crawl: "JS Crawl",
  js_crawl_done: "JS Crawl Complete",
  authenticating: "Authenticating",
  auth_testing: "Testing Auth Methods",
  inserting_auth_findings: "Inserting Auth Findings",
  importing_session: "Importing Session",
  importing_urls: "Importing URLs",
  importing_cookies: "Importing Cookies",
  auth_done_starting_spider: "Auth Complete, Starting Spider",
  spider: "Spider Crawl",
  passive_scan: "Passive Scan",
  starting_spider: "Starting Spider",
  ajax_spider: "AJAX Spider",
  ajax_spider_done: "AJAX Spider Complete",
  ajax_spider_fallback: "AJAX Spider Fallback",
  skip_ajax_spider: "Skipping AJAX Spider",
  collecting_endpoints: "Collecting Endpoints",
  spider_collecting_endpoints: "Collecting Endpoints",
  spider_complete_starting_ascan: "Starting Active Scan",
  active_scan: "Active Scanning",
  finalizing_auth_scan: "Finalizing",
}

const PHASE_ICONS: Record<string, typeof Activity> = {
  spawning_playwright: Radio,
  playwright_crawl: Globe,
  js_crawl_done: CheckCircle,
  authenticating: Lock,
  auth_testing: Scan,
  inserting_auth_findings: ListChecks,
  importing_session: KeyRound,
  importing_urls: Globe,
  importing_cookies: Shield,
  auth_done_starting_spider: Shield,
  spider: ScanLine,
  passive_scan: Eye,
  starting_spider: ArrowRight,
  ajax_spider: Radio,
  ajax_spider_done: CheckCircle,
  ajax_spider_fallback: AlertTriangle,
  skip_ajax_spider: ArrowRight,
  collecting_endpoints: Globe,
  spider_collecting_endpoints: Globe,
  spider_complete_starting_ascan: ArrowRight,
  active_scan: Activity,
  finalizing_auth_scan: CheckCircle,
}

// Ordered phase groups for the timeline — scans advance through these
// Phase milestone groups per scan mode — only shows steps relevant to the selected mode
const SCAN_PHASE_SEQUENCE: Record<string, Array<{ key: string; label: string; phases: string[] }>> = {
  spider: [
    { key: "init", label: "Init", phases: ["spawning_playwright", "playwright_crawl", "js_crawl_done", "importing_urls", "importing_cookies", "starting_spider"] },
    { key: "crawl", label: "Spider Crawl", phases: ["zap_spider_started", "spider"] },
    { key: "endpoints", label: "Endpoints", phases: ["spider_collecting_endpoints", "collecting_endpoints"] },
    { key: "finalize", label: "Finalize", phases: ["finalizing_auth_scan"] },
  ],
  active: [
    { key: "init", label: "Init", phases: ["spawning_playwright", "playwright_crawl", "js_crawl_done", "importing_urls", "importing_cookies", "starting_spider"] },
    { key: "spider", label: "Spider", phases: ["zap_spider_started", "spider", "spider_collecting_endpoints"] },
    { key: "active", label: "Active Scan", phases: ["collecting_endpoints", "spider_complete_starting_ascan", "active_scan"] },
    { key: "finalize", label: "Finalize", phases: ["finalizing_auth_scan"] },
  ],
  full: [
    { key: "init", label: "Init", phases: ["spawning_playwright", "playwright_crawl", "js_crawl_done", "importing_urls", "importing_cookies", "starting_spider"] },
    { key: "spider", label: "Spider", phases: ["zap_spider_started", "spider", "spider_collecting_endpoints"] },
    { key: "ajax", label: "AJAX Spider", phases: ["ajax_spider", "ajax_spider_done", "ajax_spider_fallback"] },
    { key: "active", label: "Active Scan", phases: ["collecting_endpoints", "spider_complete_starting_ascan", "active_scan"] },
    { key: "finalize", label: "Finalize", phases: ["finalizing_auth_scan"] },
  ],
  "ajax-spider": [
    { key: "init", label: "Init", phases: ["spawning_playwright", "playwright_crawl", "js_crawl_done"] },
    { key: "ajax", label: "AJAX Spider", phases: ["ajax_spider", "ajax_spider_done", "ajax_spider_fallback", "skip_ajax_spider"] },
    { key: "finalize", label: "Finalize", phases: ["finalizing_auth_scan"] },
  ],
  "auth-scan": [
    { key: "init", label: "Init", phases: ["authenticating", "spawning_playwright"] },
    { key: "auth", label: "Auth", phases: ["auth_testing", "inserting_auth_findings", "importing_session", "importing_urls", "importing_cookies"] },
    { key: "crawl", label: "Discover", phases: ["playwright_crawl", "js_crawl_done", "starting_spider"] },
    { key: "spider", label: "Spider", phases: ["zap_spider_started", "spider", "spider_collecting_endpoints"] },
    { key: "active", label: "Active", phases: ["collecting_endpoints", "spider_complete_starting_ascan", "active_scan"] },
    { key: "finalize", label: "Finalize", phases: ["finalizing_auth_scan"] },
  ],
}

const SCAN_TYPE_META = {
  spider: {
    label: "Spider Only",
    desc: "Crawl the target to discover URLs and endpoints",
    icon: Search,
  },
  active: {
    label: "Active Scan",
    desc: "Actively test for vulnerabilities with payloads",
    icon: Zap,
  },
  full: {
    label: "Full Scan",
    desc: "Spider + Active scan combined",
    icon: Bug,
  },
  "ajax-spider": {
    label: "AJAX Spider",
    desc: "Headless browser crawl — discover JS-rendered routes and SPA endpoints",
    icon: Radio,
  },
  "auth-scan": {
    label: "Auth Scan",
    desc: "Test all auth methods — form, OAuth, Keycloak, SSO, header for vulnerabilities",
    icon: Lock,
  },
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return ""
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function PhaseIcon({ phase }: { phase: string }) {
  const Icon = PHASE_ICONS[phase] || Activity
  return <Icon className="w-4 h-4" />
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-severity-critical",
    high: "bg-severity-high",
    medium: "bg-severity-medium",
    low: "bg-severity-low",
    informational: "bg-severity-info",
  }
  return (
    <span className={`w-2 h-2 rounded-full shrink-0 ${colors[severity] || "bg-fg-disabled"}`} />
  )
}

export default function ZapPage() {
  return (
    <Suspense fallback={
      <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
        <div className="h-8 w-48 animate-pulse bg-bg-muted rounded" />
      </div>
    }>
      <ZapPageInner />
    </Suspense>
  )
}

const SCAN_STATE_KEY = "zap_scan_state"

function ZapPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState(searchParams.get("project") || "")
  const [targetUrl, setTargetUrl] = useState("")
  const [authType, setAuthType] = useState("none")
  const [authConfig, setAuthConfig] = useState({
    type: "none",
    login_url: "",
    username_field: "username",
    password_field: "password",
    username: "",
    password: "",
    logged_in_indicator: "",
    header_name: "Authorization",
    header_value: "",
    token_url: "",
    client_id: "",
    client_secret: "",
    scope: "",
  })
  const [scanType, setScanType] = useState("spider")
  const [scanning, setScanning] = useState(false)
  const [scanId, setScanId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("idle")
  const [findings, setFindings] = useState<ScanFinding[]>([])
  const [findingsCount, setFindingsCount] = useState(0)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedFinding, setSelectedFinding] = useState<ScanFinding | null>(null)
  const [findingFormOpen, setFindingFormOpen] = useState(false)
  const [findingFormAlert, setFindingFormAlert] = useState<ScanFinding | null>(null)
  const [progressPct, setProgressPct] = useState<number | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [uptimeSeconds, setUptimeSeconds] = useState<number | null>(null)
  const [lastLogLine, setLastLogLine] = useState<string | null>(null)
  const [logEntries, setLogEntries] = useState<string[]>([])
  const [authVerified, setAuthVerified] = useState<boolean | null>(null)
  const [authTokens, setAuthTokens] = useState<Record<string, unknown> | null>(null)
  const [containerRunning, setContainerRunning] = useState<boolean | null>(null)
  const [visitedPhases, setVisitedPhases] = useState<Set<string>>(new Set())
  const [scanTypeLabel, setScanTypeLabel] = useState("")
  const [enableJsCrawl, setEnableJsCrawl] = useState(false)
  const [enableAjaxSpider, setEnableAjaxSpider] = useState(false)
  const [methodFilter, setMethodFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [sizeFilter, setSizeFilter] = useState("")
  const prevScanType = useRef(scanType)
  const [activeAuthTab, setActiveAuthTab] = useState<string | null>(null)
  const [authMethods, setAuthMethods] = useState({
    form: { enabled: false, login_url: "", username_field: "username", password_field: "password", username: "", password: "", logged_in_indicator: "" },
    header: { enabled: false, header_name: "Authorization", header_value: "" },
    oauth2: { enabled: false, token_url: "", client_id: "", client_secret: "", scope: "" },
    keycloak: { enabled: false, base_url: "", realm: "", admin_username: "", admin_password: "", test_client_id: "" },
    sso: { enabled: false, saml_metadata_url: "", assertion_consumer_url: "", entity_id: "" },
  })
  const [restored, setRestored] = useState(false)
  const [authTokensRevealed, setAuthTokensRevealed] = useState(true)
  const [authWarning, setAuthWarning] = useState(false)
  const [autoScrollLogs, setAutoScrollLogs] = useState(true)
  const [endpointPage, setEndpointPage] = useState(1)
  const ENDPOINTS_PER_PAGE = 100
  const logContainerRef = useRef<HTMLDivElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const lastLogLineRef = useRef<string | null>(null)
  const esRetryCountRef = useRef<Map<EventSource, number>>(new Map())
  const [userRole, setUserRole] = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)
  const canScan = userRole === "admin" || userRole === "security_engineer"

  // Restore previous scan results from localStorage on mount.
  // Validates running/queued scans against DB to prevent phantom scan state
  // (where localStorage says "running" but the scan was cleaned up).
  // Reconnects EventSource for active scans.
  useEffect(() => {
    const saved = localStorage.getItem(SCAN_STATE_KEY)
    if (saved) {
      try {
        const state = JSON.parse(saved)
        if (state.scanId) {
          setScanId(state.scanId)
          setStatus(state.status || "completed")
          if (state.targetUrl) setTargetUrl(state.targetUrl)
          if (state.scanType) setScanType(state.scanType)
          if (state.scanTypeLabel) setScanTypeLabel(state.scanTypeLabel)
          if (state.selectedProject) setSelectedProject(state.selectedProject)
          if (state.error) setError(state.error)
          if (state.findingsCount) setFindingsCount(state.findingsCount)
          if (state.queuePosition) setQueuePosition(state.queuePosition)

          // Validate running/queued against DB — if no active scan exists,
          // reset to idle to prevent phantom scan state.
          if (state.status === "running" || state.status === "queued") {
            const checkActive = async () => {
              try {
                const res = await fetch(`/api/scan/zap/active?scanId=${state.scanId}`)
                const active = await res.json()
                if (!active.scanId || active.scanId !== state.scanId) {
                  // No active scan or different scan — our restored state is stale
                  localStorage.removeItem(SCAN_STATE_KEY)
                  setScanId(null)
                  setStatus("idle")
                  setScanning(false)
                  setFindings([])
                  return
                }
                // Active scan confirmed — reconnect EventSource
                setLogEntries([`[*] Reconnecting to ${state.status} scan...`])
                const es = new EventSource(`/api/scan/zap/${state.scanId}/stream`)
                attachStreamHandlers(es)
              } catch {
                // API unavailable — keep restored state but setRestored(true)
                // so the UI doesn't hang forever
              }
            }
            checkActive().finally(() => setRestored(true))
          } else {
            // Fetch pending alerts from completed/failed scans
            fetch(`/api/scan-findings?task_id=${state.scanId}&status=all`)
              .then(r => r.json())
              .then(data => {
                if (data.alerts?.length > 0) {
                  const mapped: ScanFinding[] = data.alerts.map((a: any) => ({
                    id: a.id,
                    title: a.alert_name || a.title,
                    severity: a.severity,
                    description: a.description,
                    url: a.url,
                    raw_data: a.raw_data || null,
                    confidence: a.confidence ?? null,
                    cweid: a.cweid ?? null,
                    riskcode: a.riskcode ?? null,
                    attack: a.attack ?? null,
                    param: a.param ?? null,
                    evidence: a.evidence ?? null,
                    solution: a.solution ?? null,
                    reference: a.reference ?? null,
                    other: a.other ?? null,
                    wascid: a.wascid ?? null,
                  }))
                  setFindings(mapped)
                  setFindings(mapped)
                }
              })
              .catch(() => {})
              .finally(() => setRestored(true))
          }
          return // early return since we handled setRestored above
        }
      } catch {}
    }
    setRestored(true)
  }, [])

  // Persist scan state to localStorage for ALL statuses.
  // This ensures running/queued scans survive tab switches and page reloads.
  useEffect(() => {
    if (scanId && restored) {
      localStorage.setItem(SCAN_STATE_KEY, JSON.stringify({
        scanId,
        status,
        targetUrl,
        scanType,
        scanTypeLabel,
        selectedProject,
        findingsCount,
        error,
        queuePosition,
      }))
    }
  }, [scanId, status, targetUrl, scanType, scanTypeLabel, selectedProject, findingsCount, error, queuePosition, restored])

  useEffect(() => {
    if (!roleLoading && !canScan) {
      router.replace("/dashboard")
    }
  }, [roleLoading, canScan, router])

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        setUserRole(d.profile?.role || null)
        setRoleLoading(false)
      })
      .catch(() => setRoleLoading(false))
    fetch("/api/projects")
      .then(r => r.json())
      .then(data => setProjects(data.projects || []))
      .catch(() => {})
  }, [])

  // Auto-scroll log when new entries appear
  useEffect(() => {
    if (autoScrollLogs) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [logEntries, autoScrollLogs])

  const handleTerminalScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    if (autoScrollLogs !== isAtBottom) {
      setAutoScrollLogs(isAtBottom)
    }
  }, [autoScrollLogs])

  // Auto-enable JS crawl + AJAX spider for relevant scan modes.
  // Only auto-enable JS crawl when auth is configured — without credentials the
  // Playwright crawl generates false-positive auth tokens from server-issued session cookies.
  // Reset JS crawl to false when auth is removed so stale state from a previous
  // scan type selection doesn't leak into the next scan.
  useEffect(() => {
    const hasAuth = authType !== "none"
    const needsJsCrawl = scanType === "auth-scan" || scanType === "spider" || scanType === "active" || scanType === "ajax-spider"
    if (!hasAuth) {
      setEnableJsCrawl(false)
    } else if (needsJsCrawl) {
      setEnableJsCrawl(true)
    }
    if (scanType === "ajax-spider") {
      setEnableAjaxSpider(true)
    }
  }, [scanType, authType])

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
    for (const f of findings) {
      if (f.severity && counts[f.severity] !== undefined) counts[f.severity]++
    }
    return counts
  }, [findings])

  const criticalCount = severityCounts.critical + severityCounts.high

  const startScan = useCallback(async () => {
    if (!selectedProject || !targetUrl) {
      toast.error("Select a project and enter a target URL")
      return
    }

    // Check if a scan is already running in the DB (regardless of local state)
    try {
      const activeRes = await fetch("/api/scan/zap/active")
      const activeData = await activeRes.json()
      if (activeData.scanId) {
        toast.error("A scan is already running", {
          description: "Wait for the current scan to complete or stop it before starting a new one.",
        })
        return
      }
    } catch {
      // If active endpoint unavailable, proceed anyway (local state will still gate)
    }

    // Frontend validation: for auth-scan, verify enabled methods have required fields
    if (scanType === "auth-scan") {
      const enabledMethods = Object.entries(authMethods).filter(([, cfg]) => cfg.enabled)
      if (enabledMethods.length === 0) {
        toast.error("Enable at least one auth method to scan", {
          description: "Toggle on Form, Header, OAuth2, Keycloak, or SSO/SAML above",
        })
        return
      }
      const formCfg = authMethods.form
      if (formCfg.enabled && !formCfg.login_url) {
        toast.error("Form auth: Login URL is required", { description: "Enter the login page URL for form-based authentication testing." })
        return
      }
      const headerCfg = authMethods.header
      if (headerCfg.enabled && !headerCfg.header_value) {
        toast.error("Header auth: Header value is required", { description: "Enter the token or key value for header-based authentication testing." })
        return
      }
      const oauth2Cfg = authMethods.oauth2
      if (oauth2Cfg.enabled && (!oauth2Cfg.token_url || !oauth2Cfg.client_id)) {
        toast.error("OAuth2: Token URL and Client ID are required", { description: "Both fields are needed to test the OAuth2 token endpoint." })
        return
      }
      const kcCfg = authMethods.keycloak
      if (kcCfg.enabled && !kcCfg.base_url) {
        toast.error("Keycloak: Base URL is required", { description: "Enter the Keycloak server base URL to test OpenID configuration." })
        return
      }
      const ssoCfg = authMethods.sso
      if (ssoCfg.enabled && !ssoCfg.saml_metadata_url) {
        toast.error("SSO/SAML: Metadata URL is required", { description: "Enter the SAML metadata URL to test SSO configuration." })
        return
      }
    }

    localStorage.removeItem(SCAN_STATE_KEY)
    setScanning(true)
    setError(null)
    setFindings([])
    setFindingsCount(0)
    setProgressPct(null)
    setPhase(null)
    setVisitedPhases(new Set())
    setUptimeSeconds(null)
    setLastLogLine(null)
    const meta = (SCAN_TYPE_META as Record<string, { label: string }>)[scanType]
    const scanLabel = meta?.label || scanType
    setLogEntries([`[${new Date().toLocaleTimeString()}] [>] Deploying ${scanLabel} scan against ${targetUrl}`])
    const pushLog = (line: string) => setLogEntries(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`])
    setContainerRunning(null)
    setAuthVerified(null)
    setAuthTokens(null)
    setAuthTokensRevealed(false)
    setScanTypeLabel(scanType)
    try {
      const isAuthScan = scanType === "auth-scan"
      const enabledMethods = Object.entries(authMethods)
        .filter(([, cfg]) => cfg.enabled)
        .reduce((acc, [key, cfg]) => {
          const { enabled, ...rest } = cfg as any
          acc[key] = rest
          return acc
        }, {} as Record<string, any>)

      const body: Record<string, any> = {
        project_id: selectedProject,
        target_url: targetUrl,
        scan_type: scanType,
        enable_js_crawl: enableJsCrawl,
        enable_ajax_spider: enableAjaxSpider,
      }

      if (isAuthScan) {
        body.auth_methods = Object.keys(enabledMethods).length > 0 ? enabledMethods : null
        body.auth_config = null
        body.auth_type = "multi"
      } else {
        body.auth_type = authType
        body.auth_config = authType !== "none" ? authConfig : null
      }

      const res = await fetch("/api/scan/zap/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        toast.error("Scan failed to start", { description: data.error })
        setScanning(false)
        return
      }

      if (data.queued) {
        setScanId(data.scanId)
        setStatus("queued")
        setQueuePosition(data.position)
        pushLog(`[!] Queue position: ${data.position}. Waiting for a slot to open...`)
        toast.info("Scan queued", {
          description: data.message || `Position ${data.position} in queue.`,
        })
        // Open EventSource even for queued scans — stream will report
        // status transitions (queued → running → completed) via polling
        const eventSource = new EventSource(`/api/scan/zap/${data.scanId}/stream`)
        attachStreamHandlers(eventSource)
        return
      }

      setScanId(data.scanId)
      setStatus("running")

      const eventSource = new EventSource(`/api/scan/zap/${data.scanId}/stream`)
      attachStreamHandlers(eventSource)
    } catch {
      setError("Connection failed")
      setScanning(false)
    }
  }, [selectedProject, targetUrl, authType, scanType, authMethods])

  const handleApprove = useCallback((findingId: string) => {
    const finding = selectedFinding || findings.find(f => f.id === findingId)
    if (!finding) {
      toast.error("Finding not found")
      return
    }
    setFindingFormAlert(finding)
    setSelectedFinding(null)
    setFindingFormOpen(true)
  }, [selectedFinding, findings])

  const handleFindingFormSuccess = useCallback(async (vulnId: string) => {
    const alert = findingFormAlert
    if (!alert) return
    try {
      const res = await fetch(`/api/scan-findings/${alert.id}/link-vuln`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vulnId }),
      })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Link failed"); return }
      toast.success("Finding approved and linked")
      setFindings(prev => prev.filter(f => f.id !== alert.id))
      setFindingFormAlert(null)
      setFindingFormOpen(false)
    } catch { toast.error("Failed to link finding") }
  }, [findingFormAlert])

  const handleReject = useCallback(async (findingId: string) => {
    try {
      const res = await fetch(`/api/scan-findings/${findingId}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by analyst" }),
      })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Reject failed"); return }
      toast.success("Finding rejected")
      setFindings(prev => prev.filter(f => f.id !== findingId))
      setSelectedFinding(null)
    } catch { toast.error("Failed to reject finding") }
  }, [])

  const retryScan = useCallback(async () => {
    if (!scanId) return
    setScanning(true)
    setError(null)
    setFindings([])
    setFindingsCount(0)
    setQueuePosition(null)
    setLogEntries([`[${new Date().toLocaleTimeString()}] [*] Initializing scan retry...`])
    const pushLog = (line: string) => setLogEntries(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`])

    try {
      const res = await fetch(`/api/scan/zap/${scanId}/retry`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        toast.error("Retry failed", { description: data.error })
        setScanning(false)
        return
      }

      if (data.queued) {
        setStatus("queued")
        setQueuePosition(data.position)
        pushLog(`[!] Queue position: ${data.position}. Waiting for a slot to open...`)
        toast.info("Scan queued", {
          description: data.message || `Position ${data.position} in queue.`,
        })
        const eventSource = new EventSource(`/api/scan/zap/${data.scanId}/stream`)
        attachStreamHandlers(eventSource)
        return
      }

      setStatus("running")
      const eventSource = new EventSource(`/api/scan/zap/${data.scanId}/stream`)
      attachStreamHandlers(eventSource)
    } catch {
      setError("Connection failed")
      setScanning(false)
    }
  }, [scanId])

  const stopScan = useCallback(async () => {
    if (!scanId) return
    setStatus("stopping")
    try {
      const res = await fetch(`/api/scan/zap/${scanId}/stop`, { method: "POST" })
      if (!res.ok) {
        const err = await res.json()
        toast.error("Failed to stop scan", { description: err.error || "Unknown error" })
        setStatus("running")
        return
      }
      toast.success("Scan stopped")
    } catch {
      toast.error("Failed to stop scan")
      setStatus("running")
    }
  }, [scanId])

  // ── Reusable EventSource handler for scan stream ────────────────
  // Used by both immediate-start and queued scans. Handles all stream
  // events: progress, new_finding, complete, failed, error.
  const lastPhaseRef = useRef("")
  const lastPctLoggedRef = useRef(-1)
  const seenAuthVerifiedRef = useRef<boolean | null>(null)
  const seenTokensRef = useRef<string | null>(null)
  const attachStreamHandlers = useCallback((eventSource: EventSource) => {
    setLogEntries(prev => [...prev, `[${new Date().toLocaleTimeString()}] [>] Streaming live scan results...`])
    const pushLog = (line: string) => setLogEntries(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`])
    const phaseRef = lastPhaseRef
    const pctRef = lastPctLoggedRef
    const authVerifiedSeen = seenAuthVerifiedRef
    const tokensSeen = seenTokensRef

    const handleAuthData = (d: Record<string, unknown>) => {
      if (d.auth_verified === true && authVerifiedSeen.current !== true) {
        authVerifiedSeen.current = true
        setAuthVerified(true)
        setAuthTokensRevealed(true)
        pushLog("[✓] Authentication verified — authenticated session active")
        toast.success("Authentication successful — tokens extracted", { duration: 4000 })
      } else if (d.auth_verified === false && authVerifiedSeen.current === null) {
        authVerifiedSeen.current = false
        setAuthVerified(false)
        pushLog("[!] Authentication failed — all methods rejected")
      }
      if (d.auth_tokens) {
        const tokensStr = JSON.stringify(d.auth_tokens)
        if (tokensStr === tokensSeen.current) return
        tokensSeen.current = tokensStr
        const tokens = d.auth_tokens as Record<string, unknown>
        setAuthTokens(tokens)
        setAuthTokensRevealed(true)
        const cookieCount = (tokens as any).cookies?.length || 0
        const tokenMethods = Object.entries(tokens).filter(([k]) => k !== "cookies" && k !== "cookieCount")
        pushLog(`═══════════════════════════════════════════════`)
        pushLog(`  AUTH TOKENS EXTRACTED: ${tokenMethods.length} method(s), ${(tokens as any).cookieCount || cookieCount} cookie(s)`)
        for (const [method, data] of tokenMethods) {
          const d2 = data as Record<string, unknown>
          const type = d2.token_type || method
          const preview = typeof d2.token_preview === "string" ? d2.token_preview : ""
          pushLog(`  TOKEN: ${method.toUpperCase()} (${type}) → ${preview ? preview.substring(0, 500) : "(no preview)"}`)
        }
        if (cookieCount > 0) {
          for (const c of (tokens as any).cookies) {
            const flags = [c.httpOnly ? "H" : "", c.secure ? "S" : ""].filter(Boolean).join("")
            const val = c.value_preview || ""
            pushLog(`  COOKIE: ${c.name}=${val} domain=${c.domain || ""}${flags ? ` [${flags}]` : ""}`)
          }
        }
        pushLog(`═══════════════════════════════════════════════`)
      }
      if (d.auth_warning === true) {
        setAuthWarning(true)
        const errMsg = d.auth_error ? ` — ${d.auth_error as string}` : ""
        pushLog(`[!] ⚠️ Auth configured but could not verify — scan proceeding UNAUTHENTICATED${errMsg}`)
      }
    }

    eventSource.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data)
      setFindingsCount(d.findings_count || d.findings_found || 0)
      if (d.status === "queued") {
        if (d.position != null) setQueuePosition(d.position)
        pushLog(`[!] Queue position: ${d.position || 'waiting'}...`)
        return
      }
      if (d.percentage != null) setProgressPct(d.percentage)
      if (d.phase != null) {
        setPhase(d.phase)
        setVisitedPhases(prev => new Set(prev).add(d.phase!))
        if (d.phase !== phaseRef.current) {
          const label = PHASE_LABELS[d.phase] || d.phase
          pushLog(`[*] Phase: ${label}`)
          phaseRef.current = d.phase
        }
      }
      if (d.uptimeSeconds != null) setUptimeSeconds(d.uptimeSeconds)
      if (d.lastLogLine != null && d.lastLogLine !== lastLogLineRef.current) {
        lastLogLineRef.current = d.lastLogLine
        pushLog(`[+] ${d.lastLogLine}`)
      }
      if (d.containerRunning != null) setContainerRunning(d.containerRunning)
      handleAuthData(d)
      const pct = d.percentage ?? 0
      if (pct >= 100 && pctRef.current < 100) { pushLog("[✓] Scan 100% complete"); pctRef.current = 100 }
      else if (pct >= 90 && pctRef.current < 90) { pushLog("[*] Finalizing..."); pctRef.current = 90 }
      else if (pct >= 75 && pctRef.current < 75) { pushLog("[*] Active scan nearing completion"); pctRef.current = 75 }
      else if (pct >= 50 && pctRef.current < 50) { pushLog("[*] Active scan halfway"); pctRef.current = 50 }
      else if (pct >= 40 && pctRef.current < 40) { pushLog("[*] Spider complete, starting active scan"); pctRef.current = 40 }
    })
    eventSource.addEventListener("new_finding", (e) => {
      const d = JSON.parse(e.data)
      setFindings(prev => [...prev, {
        id: d.id,
        title: d.title,
        severity: d.severity,
        description: d.description,
        url: d.url,
        raw_data: d.raw_data || null,
        confidence: d.confidence ?? null,
        cweid: d.cweid ?? null,
        riskcode: d.riskcode ?? null,
        attack: d.attack ?? null,
        param: d.param ?? null,
        evidence: d.evidence ?? null,
        solution: d.solution ?? null,
        reference: d.reference ?? null,
        other: d.other ?? null,
        wascid: d.wascid ?? null,
      }])
      setFindingsCount(c => c + 1)
      const sev = (d.severity || "").toUpperCase()
      pushLog(`[+] ${sev}: ${(d.title || "Finding").substring(0, 80)}`)
    })
    eventSource.addEventListener("complete", (e) => {
      const d = JSON.parse(e.data)
      setStatus("completed")
      setFindings(d.findings || [])
      const count = d.findings_found || d.findings?.length || 0
      setFindingsCount(count)
      setProgressPct(100)
      pushLog(`[✓] Scan complete — ${count} findings`)
      handleAuthData(d)
      toast.success(`Scan complete: ${count} findings`)
      eventSource.close()
      setScanning(false)
    })
    eventSource.addEventListener("failed", (e) => {
      const d = JSON.parse(e.data)
      setStatus("failed")
      setError(d.error)
      // Show any findings discovered before the crash
      if (d.findings && d.findings.length > 0) {
        setFindings(d.findings)
        setFindingsCount(d.findings_found || d.findings.length)
      }
      pushLog(`[!] Scan failed: ${d.error || "Unknown error"}${d.findings?.length ? ` (${d.findings.length} findings preserved)` : ""}`)
      handleAuthData(d)
      toast.error("Scan failed", { description: d.error })
      eventSource.close()
      setScanning(false)
    })
    eventSource.addEventListener("error", () => {
      // EventSource auto-reconnects on connection loss, so this fires on
      // each reconnect attempt. Only mark failed after repeated failures.
      const retries = (esRetryCountRef.current.get(eventSource) || 0) + 1
      esRetryCountRef.current.set(eventSource, retries)
      if (retries >= 5) {
        pushLog(`[!] Stream reconnection failed after ${retries} attempts`)
        setError(`Stream connection lost after ${retries} reconnection attempts`)
        setStatus("failed")
        eventSource.close()
        setScanning(false)
      } else {
        pushLog(`[~] Stream reconnect attempt ${retries}...`)
      }
    })
  }, [])

  const project = projects.find(p => p.id === selectedProject)
  const scanMeta = SCAN_TYPE_META[scanType as keyof typeof SCAN_TYPE_META] || SCAN_TYPE_META.spider
  const ScanTypeIcon = scanMeta.icon

  const sevColor = (s: string) => {
    const m: Record<string, string> = { critical: "text-severity-critical border-severity-critical/30 bg-severity-critical-bg", high: "text-severity-high border-severity-high/30 bg-severity-high-bg", medium: "text-severity-medium border-severity-medium/30 bg-severity-medium-bg", low: "text-severity-low border-severity-low/30 bg-severity-low-bg", informational: "text-severity-info border-severity-info/30 bg-severity-info-bg" }
    return m[s] || "text-fg-muted border-border bg-bg-muted"
  }

  const isIdle = status === "idle" || (!scanId && status === "idle")
  const isSpiderMode = scanTypeLabel === "spider" || scanType === "spider"
  const endpointFindings = findings.filter(f =>
    f.raw_data && typeof f.raw_data === 'object' && (f.raw_data as any).type === 'endpoint'
  )
  const vulnFindings = findings.filter(f =>
    !(f.raw_data && typeof f.raw_data === 'object' && (f.raw_data as any).type === 'endpoint')
  )
  const filteredEndpoints = endpointFindings.filter(f => {
    const rd = (f.raw_data && typeof f.raw_data === 'object' ? f.raw_data as any : {}) || {}
    const m = (f.method || rd.method || "").toLowerCase()
    const sc = f.statusCode != null ? String(f.statusCode) : rd.statusCode != null ? String(rd.statusCode) : ""
    const sz = rd.responseSize != null ? Number(rd.responseSize) : null
    if (methodFilter && !m.includes(methodFilter.toLowerCase())) return false
    if (statusFilter && !sc.startsWith(statusFilter)) return false
    if (sizeFilter) {
      if (sz === null) return false
      const num = Number(sizeFilter)
      if (isNaN(num)) {
        if (sizeFilter.toLowerCase() === "small" && sz >= 10240) return false
        if (sizeFilter.toLowerCase() === "medium" && (sz < 10240 || sz >= 102400)) return false
        if (sizeFilter.toLowerCase() === "large" && sz < 102400) return false
      } else {
        if (sz < num) return false
      }
    }
    return true
  })
  
  const paginatedEndpoints = useMemo(() => {
    return filteredEndpoints.slice(0, endpointPage * ENDPOINTS_PER_PAGE)
  }, [filteredEndpoints, endpointPage])
  
  const hasMoreEndpoints = paginatedEndpoints.length < filteredEndpoints.length

  const [findingsTab, setFindingsTab] = useState("all")
  useEffect(() => {
    if (isSpiderMode) setFindingsTab("endpoints")
    else if (findingsTab === "endpoints") setFindingsTab("all")
  }, [isSpiderMode])

  return (
    <motion.div initial={{opacity:0, y:4}} animate={{opacity:1, y:0}} transition={{duration:0.2}} className="p-6 space-y-6 max-w-[1600px] mx-auto select-none bg-gradient-to-b from-bg to-bg-subtle/30 min-h-[calc(100vh-4rem)] rounded-xl">
      {/* ── TOP BAR: Status + Controls ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-bg/80 backdrop-blur-xl border border-border/50 shadow-sm rounded-2xl px-6 py-4 transition-all">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 shadow-inner">
            <Shield className="w-5 h-5 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-fg tracking-tight leading-tight">ZAP Scanner</h1>
            <span className="text-[10px] uppercase tracking-widest text-fg-muted font-medium">OWASP Zed Attack Proxy</span>
          </div>
          <div className="h-8 w-px bg-border/50 mx-2" />
          {status === "running" ? (
            <span className="flex items-center gap-2 text-xs font-mono text-severity-high bg-severity-high/10 border border-severity-high/20 px-3 py-1.5 rounded-full shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-severity-high opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-severity-high"></span>
              </span>
              {scanType === "spider" ? "CRAWLING" : scanType === "ajax-spider" ? "AJAX CRAWL" : scanType === "active" ? "ATTACKING" : "SCANNING"}
              {progressPct != null && <span className="text-severity-high/80 ml-1">{progressPct}%</span>}
              {authVerified === true && (
                <span className="ml-2 flex items-center gap-1 text-severity-low border-l border-severity-high/20 pl-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  AUTH
                </span>
              )}
              {authVerified === false && (
                <span className="ml-2 flex items-center gap-1 text-severity-critical border-l border-severity-high/20 pl-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  AUTH FAILED
                </span>
              )}
            </span>
          ) : status === "completed" ? (
            <span className="flex items-center gap-2 text-xs font-mono text-severity-low bg-severity-low/10 border border-severity-low/20 px-3 py-1.5 rounded-full shadow-sm">
              <CheckCircle className="w-3.5 h-3.5" />
              COMPLETED · {findings.length} {isSpiderMode ? "ENDPOINTS" : "FINDINGS"}
              {authVerified === true && (
                <span className="ml-2 flex items-center gap-1 text-severity-low border-l border-severity-low/20 pl-2">
                  <ShieldCheck className="w-3.5 h-3.5" /> AUTH
                </span>
              )}
            </span>
          ) : status === "failed" ? (
            <span className="flex items-center gap-2 text-xs font-mono text-severity-critical bg-severity-critical/10 border border-severity-critical/20 px-3 py-1.5 rounded-full shadow-sm">
              <AlertOctagon className="w-3.5 h-3.5" />
              FAILED
            </span>
          ) : status === "queued" ? (
            <span className="flex items-center gap-2 text-xs font-mono text-warning bg-warning/10 border border-warning/20 px-3 py-1.5 rounded-full shadow-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              QUEUED {queuePosition != null ? `(POS: ${queuePosition})` : ""}
            </span>
          ) : (
            <span className="text-xs font-mono text-fg-disabled bg-bg-muted/50 border border-border/50 px-3 py-1.5 rounded-full shadow-sm">STANDBY</span>
          )}
        </div>
        {canScan && (
        <div className="flex items-center gap-3 mt-4 md:mt-0">
          {scanning || status === "running" || status === "queued" ? (
            <button onClick={stopScan} disabled={!scanId} className="group relative flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-mono font-bold bg-severity-critical/10 text-severity-critical border border-severity-critical/30 hover:bg-severity-critical hover:text-white transition-all shadow-sm disabled:opacity-40 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1s_infinite]" />
              <Square className="w-3.5 h-3.5" /> ABORT SCAN
            </button>
          ) : status === "failed" || status === "cancelled" ? (
            <>
              <button onClick={startScan} disabled={scanning} className="group relative flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-mono font-bold bg-primary text-primary-fg hover:bg-primary-hover hover:shadow-[0_0_15px_rgba(var(--primary),0.4)] transition-all shadow-md disabled:opacity-40 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1s_infinite]" />
                {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Siren className="w-3.5 h-3.5" />}
                {scanning ? "INITIALIZING..." : "NEW SCAN"}
              </button>
              <button onClick={retryScan} disabled={scanning || !scanId} className="group relative flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-mono font-bold bg-secondary text-secondary-fg hover:bg-secondary-hover border border-border/50 transition-all shadow-sm disabled:opacity-40 overflow-hidden">
                <RotateCcw className="w-3.5 h-3.5" /> RETRY
              </button>
            </>
          ) : (
            <button onClick={startScan} disabled={scanning} className="group relative flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-mono font-bold bg-primary text-primary-fg hover:bg-primary-hover hover:shadow-[0_0_15px_rgba(var(--primary),0.4)] transition-all shadow-md disabled:opacity-40 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1s_infinite]" />
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Siren className="w-3.5 h-3.5" />}
              {scanning ? "INITIALIZING..." : "DEPLOY SCAN"}
            </button>
          )}
        </div>
        )}
      </div>



      {/* ── MAIN GRID: Config (left) + Findings (right) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-6 items-start">
        {/* ── LEFT: Config Panel ── */}
        <div className="space-y-6">
          {/* Target Config */}
          <div className="bg-bg/60 backdrop-blur-sm border border-border/60 shadow-sm rounded-xl divide-y divide-border/50 overflow-hidden transition-all hover:border-border/80 hover:shadow-md">
            <div className="px-4 py-3 flex items-center gap-2.5 bg-gradient-to-r from-bg-subtle/50 to-transparent">
              <div className="p-1.5 rounded-md bg-primary/10 border border-primary/20">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs font-bold text-fg uppercase tracking-widest">Target Configuration</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-mono text-fg-muted tracking-wider">URL</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-fg-muted hover:text-fg cursor-pointer transition-colors" />
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 bg-bg-subtle border-border shadow-md">
                      <p className="text-xs font-medium text-fg mb-1">Quick Start</p>
                      <p className="text-[10px] text-fg-muted">
                        Try: <code className="bg-bg px-1 py-0.5 rounded text-primary border border-border">https://example.com</code>
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="https://example.com" className="h-10 text-sm font-mono bg-bg/50 border-border/80 focus:ring-1 focus:ring-primary/50 transition-all shadow-inner rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-fg-muted tracking-widest uppercase">PROJECT</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="h-10 text-sm font-mono bg-bg/50 border-border/80 rounded-lg"><SelectValue placeholder="Select Project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id} className="text-xs font-mono">{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {project?.scope && (
                <div className="text-xs font-mono text-fg-muted p-1.5 rounded bg-bg border border-border leading-relaxed">
                  <span className="text-primary">$</span> scope: {project.scope}
                </div>
              )}
            </div>
          </div>

          {/* Scan Mode */}
          <div className="bg-bg/60 backdrop-blur-sm border border-border/60 shadow-sm rounded-xl divide-y divide-border/50 overflow-hidden transition-all hover:border-border/80 hover:shadow-md">
            <div className="px-4 py-3 flex items-center gap-2.5 bg-gradient-to-r from-bg-subtle/50 to-transparent">
              <div className="p-1.5 rounded-md bg-primary/10 border border-primary/20">
                <Crosshair className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs font-bold text-fg uppercase tracking-widest">Scan Mode</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(SCAN_TYPE_META).map(([key, meta]) => {
                  const Icon = meta.icon
                  const active = scanType === key
                  return (
                    <button key={key} onClick={() => setScanType(key)}
                      className={`flex flex-col items-center justify-center gap-2 p-3 rounded-lg text-xs font-mono font-medium border transition-all duration-200 ${
                        active ? "border-primary bg-primary/10 text-primary shadow-[0_0_10px_rgba(var(--primary),0.15)] scale-[1.02]" : "border-border/60 bg-bg/40 text-fg-muted hover:border-border hover:bg-bg/80"
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${active ? "animate-pulse" : ""}`} />
                      <span>{meta.label}</span>
                    </button>
                  )
                })}
              </div>
              {(scanType === "full" || scanType === "active" || scanType === "spider" || scanType === "ajax-spider") && (
                <div className="flex items-center justify-between p-1.5 rounded bg-bg border border-border">
                  <div className="flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-fg-muted" />
                    <span className="text-xs font-mono text-fg-muted">JS CRAWL</span>
                  </div>
                  <button type="button" onClick={() => setEnableJsCrawl(!enableJsCrawl)}
                    className={`relative w-7 h-3.5 rounded-full transition-colors ${enableJsCrawl ? "bg-primary" : "bg-bg-muted border border-border"}`}>
                    <span className={`absolute top-[1px] w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${enableJsCrawl ? "translate-x-[14px]" : "translate-x-[1px]"}`} />
                  </button>
                </div>
              )}
              {(scanType === "full" || scanType === "active" || scanType === "ajax-spider" || scanType === "spider") && (
                <div className="flex items-center justify-between p-1.5 rounded bg-bg border border-border">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-fg-muted" />
                    <span className="text-xs font-mono text-fg-muted">AJAX SPIDER</span>
                  </div>
                  <button type="button" onClick={() => setEnableAjaxSpider(!enableAjaxSpider)}
                    className={`relative w-7 h-3.5 rounded-full transition-colors ${enableAjaxSpider ? "bg-primary" : "bg-bg-muted border border-border"}`}>
                    <span className={`absolute top-[1px] w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${enableAjaxSpider ? "translate-x-[14px]" : "translate-x-[1px]"}`} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Auth Config */}
          <div className="bg-bg/60 backdrop-blur-sm border border-border/60 shadow-sm rounded-xl divide-y divide-border/50 overflow-hidden transition-all hover:border-border/80 hover:shadow-md">
            <div className="px-4 py-3 flex items-center gap-2.5 bg-gradient-to-r from-bg-subtle/50 to-transparent">
              <div className="p-1.5 rounded-md bg-primary/10 border border-primary/20">
                <Lock className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs font-bold text-fg uppercase tracking-widest">Authentication</span>
            </div>
            <div className="p-4 space-y-4">
              {scanType !== "auth-scan" ? (
                <Select value={authType} onValueChange={v => { setAuthType(v); setAuthConfig(p => ({ ...p, type: v })) }}>
                  <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs font-mono">None</SelectItem>
                    <SelectItem value="form" className="text-xs font-mono">Form-based</SelectItem>
                    <SelectItem value="header" className="text-xs font-mono">Header/Token</SelectItem>
                    <SelectItem value="oauth2" className="text-xs font-mono">OAuth2</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {[{ k: "form", l: "Form", i: User }, { k: "header", l: "Header", i: KeyRound }, { k: "oauth2", l: "OAuth2", i: Lock }, { k: "keycloak", l: "Keycloak", i: Server }, { k: "sso", l: "SSO/SAML", i: ExternalLink }].map(({ k, l, i: Icon }) => {
                    const on = authMethods[k as keyof typeof authMethods]?.enabled ?? false
                    return (
                      <button type="button" key={k} onClick={() => { setAuthMethods(p => ({ ...p, [k]: { ...p[k as keyof typeof p], enabled: !on } })); if (!on) setActiveAuthTab(k) }}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border transition-all ${
                          on ? "border-primary bg-primary/10 text-primary" : "border-border bg-bg text-fg-muted hover:border-border-strong"
                        }`}>
                        <Icon className="w-2.5 h-2.5" />{l}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Auth config fields */}
              {scanType === "auth-scan" ? (
                <div className="space-y-1.5 pt-1.5 border-t border-border">
                  {["form", "header", "oauth2", "keycloak", "sso"].map(mk => {
                    const m = authMethods[mk as keyof typeof authMethods]
                    if (!m?.enabled) return null
                    const open = activeAuthTab === mk
                    return (
                      <div key={mk} className="border border-border rounded overflow-hidden">
                        <button onClick={() => setActiveAuthTab(open ? null : mk)} className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-mono text-fg-muted bg-bg hover:bg-bg-muted transition-colors">
                          <span className="text-fg">{mk.toUpperCase()}</span>
                          {open ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                        </button>
                        {open && (
                          <div className="p-2 space-y-1.5 bg-bg border-t border-border">
                            {mk === "form" && <>
                              <input placeholder="Login URL" value={(m as any).login_url} onChange={e => setAuthMethods(p => ({ ...p, form: { ...p.form, login_url: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                              <div className="grid grid-cols-2 gap-1">
                                <input placeholder="Username field" value={(m as any).username_field} onChange={e => setAuthMethods(p => ({ ...p, form: { ...p.form, username_field: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                                <input placeholder="Password field" value={(m as any).password_field} onChange={e => setAuthMethods(p => ({ ...p, form: { ...p.form, password_field: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                <input placeholder="Username" value={(m as any).username} onChange={e => setAuthMethods(p => ({ ...p, form: { ...p.form, username: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                                <input type="password" placeholder="Password" value={(m as any).password} onChange={e => setAuthMethods(p => ({ ...p, form: { ...p.form, password: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                              </div>
                              <input placeholder="Logged-in indicator (regex)" value={(m as any).logged_in_indicator} onChange={e => setAuthMethods(p => ({ ...p, form: { ...p.form, logged_in_indicator: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                            </>}
                            {mk === "header" && <>
                              <input placeholder="Header name" value={(m as any).header_name} onChange={e => setAuthMethods(p => ({ ...p, header: { ...p.header, header_name: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                              <input placeholder="Header value" value={(m as any).header_value} onChange={e => setAuthMethods(p => ({ ...p, header: { ...p.header, header_value: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                            </>}
                            {mk === "oauth2" && <>
                              <input placeholder="Token URL" value={(m as any).token_url} onChange={e => setAuthMethods(p => ({ ...p, oauth2: { ...p.oauth2, token_url: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                              <input placeholder="Client ID" value={(m as any).client_id} onChange={e => setAuthMethods(p => ({ ...p, oauth2: { ...p.oauth2, client_id: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                              <input type="password" placeholder="Client Secret" value={(m as any).client_secret} onChange={e => setAuthMethods(p => ({ ...p, oauth2: { ...p.oauth2, client_secret: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                            </>}
                            {mk === "keycloak" && <>
                              <input placeholder="Base URL" value={(m as any).base_url} onChange={e => setAuthMethods(p => ({ ...p, keycloak: { ...p.keycloak, base_url: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                              <input placeholder="Realm" value={(m as any).realm} onChange={e => setAuthMethods(p => ({ ...p, keycloak: { ...p.keycloak, realm: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                            </>}
                            {mk === "sso" && <>
                              <input placeholder="SAML Metadata URL" value={(m as any).saml_metadata_url} onChange={e => setAuthMethods(p => ({ ...p, sso: { ...p.sso, saml_metadata_url: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                              <input placeholder="Entity ID" value={(m as any).entity_id} onChange={e => setAuthMethods(p => ({ ...p, sso: { ...p.sso, entity_id: e.target.value } }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                            </>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-1.5 pt-1.5 border-t border-border">
                  {authType === "form" && (<>
                    <input placeholder="Login URL" value={authConfig.login_url} onChange={e => setAuthConfig(p => ({ ...p, login_url: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                    <div className="grid grid-cols-2 gap-1">
                      <input placeholder="Username field" value={authConfig.username_field} onChange={e => setAuthConfig(p => ({ ...p, username_field: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                      <input placeholder="Password field" value={authConfig.password_field} onChange={e => setAuthConfig(p => ({ ...p, password_field: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <input placeholder="Username" value={authConfig.username} onChange={e => setAuthConfig(p => ({ ...p, username: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                      <input type="password" placeholder="Password" value={authConfig.password} onChange={e => setAuthConfig(p => ({ ...p, password: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                    </div>
                  </>)}
                  {authType === "header" && (<>
                    <input placeholder="Header name" value={authConfig.header_name} onChange={e => setAuthConfig(p => ({ ...p, header_name: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                    <input placeholder="Header value" value={authConfig.header_value} onChange={e => setAuthConfig(p => ({ ...p, header_value: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                  </>)}
                  {authType === "oauth2" && (<>
                    <input placeholder="Token URL" value={authConfig.token_url} onChange={e => setAuthConfig(p => ({ ...p, token_url: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                    <input placeholder="Client ID" value={authConfig.client_id} onChange={e => setAuthConfig(p => ({ ...p, client_id: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                    <input type="password" placeholder="Client Secret" value={authConfig.client_secret} onChange={e => setAuthConfig(p => ({ ...p, client_secret: e.target.value }))} className="w-full h-8 text-xs font-mono bg-bg-subtle border border-border rounded px-1.5 outline-none focus:border-primary" />
                  </>)}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── RIGHT: Scan Engine + Findings ── */}
        <div className="space-y-6">

          {/* ── SCAN ENGINE (premium) ── */}
          <div className="bg-[#0a0a0a] border border-border/80 shadow-lg rounded-xl overflow-hidden ring-1 ring-white/5 transition-all">
            <div className="px-4 py-3 flex items-center justify-between border-b border-border/40 bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a]">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5 mr-2">
                  <div className="w-3 h-3 rounded-full bg-severity-critical/80"></div>
                  <div className="w-3 h-3 rounded-full bg-severity-medium/80"></div>
                  <div className="w-3 h-3 rounded-full bg-severity-low/80"></div>
                </div>
                <Terminal className="w-4 h-4 text-primary drop-shadow-[0_0_5px_rgba(var(--primary),0.8)]" />
                <span className="text-xs font-bold text-gray-200 uppercase tracking-widest">Engine Runtime</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono font-bold tracking-wider">
                {status === "running" && (
                  <>
                    <span className="flex items-center gap-1 text-severity-high"><span className="w-1.5 h-1.5 rounded-full bg-severity-high animate-pulse" />{scanMeta.label}</span>
                    {progressPct != null && <span className="text-primary">{progressPct}%</span>}
                    {uptimeSeconds != null && <span className="text-fg-muted">{formatUptime(uptimeSeconds)}</span>}
                  </>
                )}
                {status === "completed" && <span className="text-severity-low"><CheckCircle className="w-2.5 h-2.5 inline" /> {findingsCount} findings</span>}
                {status === "failed" && <span className="text-severity-critical"><AlertTriangle className="w-2.5 h-2.5 inline" /> Failed</span>}
                {status === "queued" && <span className="text-warning"><Loader2 className="w-2.5 h-2.5 inline animate-spin" /> Queued</span>}
                {status === "idle" && <span className="text-fg-disabled">Standby</span>}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-1 bg-bg-muted relative">
              <div className={`h-full transition-all duration-700 ease-out ${status === "failed" ? "bg-severity-critical" : status === "completed" ? "bg-severity-low" : "bg-primary"}`}
                style={{ width: `${status === "idle" ? 0 : progressPct || (status === "completed" ? 100 : status === "failed" ? 100 : 0)}%` }}
              />
            </div>

            {/* Phase Timeline — items shrink to natural width, connectors stretch evenly */}
            {status === "running" && (
              <div className="px-2 py-1 bg-bg border-b border-border flex items-center w-full">
                {(SCAN_PHASE_SEQUENCE[scanType] || SCAN_PHASE_SEQUENCE.full).flatMap((group, i) => {
                  const hasVisited = group.phases.some(p => visitedPhases.has(p))
                  const isActive = group.phases.includes(phase || "")
                  return [
                    i > 0 && (
                      <div key={`conn-${i}`} className={`flex-1 h-px mx-1.5 ${hasVisited ? "bg-severity-low" : "bg-bg-muted"}`} />
                    ),
                    <div key={group.key} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-mono whitespace-nowrap shrink-0 ${hasVisited ? "text-severity-low bg-severity-low-bg" : isActive ? "text-primary bg-primary/10" : "text-fg-disabled"}`}>
                      {hasVisited ? <CheckCircle className="w-2 h-2" /> : <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-primary animate-pulse" : "bg-bg-muted"}`} />}
                      {group.label}
                    </div>,
                  ]
                })}
              </div>
            )}

            {/* Auth Warning */}
            {authWarning && (
              <div className="border-b border-severity-high-border bg-severity-high-bg px-2 py-1">
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 text-severity-high shrink-0" />
                  <span className="text-[9px] text-severity-high font-semibold">Auth Warning</span>
                </div>
                <p className="text-[8px] text-fg-muted ml-3.5">Proceeding unauthenticated. Only public endpoints will be scanned.</p>
              </div>
            )}

            {/* Auth Tokens */}
            {authTokens && (
              <div className="border-b border-border">
                <button onClick={() => setAuthTokensRevealed(!authTokensRevealed)}
                  className="w-full flex items-center justify-between px-2 py-1 text-[9px] font-mono hover:bg-severity-low-bg/30 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <KeyRound className="w-2.5 h-2.5 text-severity-low" />
                    <span className="text-severity-low text-[9px] font-semibold">AUTH TOKENS</span>
                    {authVerified === true && <CheckCircle className="w-2 h-2 text-severity-low" />}
                  </div>
                  {authTokensRevealed ? <ChevronDown className="w-2 h-2 text-fg-muted" /> : <ChevronRight className="w-2 h-2 text-fg-muted" />}
                </button>
                {authTokensRevealed && (
                  <div className="px-2 pb-2 space-y-1">
                    <div className="flex items-center justify-end">
                      <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(authTokens, null, 2)); toast.success("Tokens copied") }}
                        className="text-[8px] font-mono px-1 py-0.5 rounded bg-bg border border-border hover:bg-panel-hover text-fg-muted"
                      ><Copy className="w-2 h-2 inline mr-0.5" />Copy JSON</button>
                    </div>
                    {Object.entries(authTokens as Record<string, unknown>).filter(([k]) => k !== "cookies" && k !== "cookieCount").length > 0 && (
                      <TokenCopyHelper tokens={authTokens} />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Terminal Log */}
            <div className="relative h-[200px]">
              <div 
                ref={logContainerRef}
                onScroll={handleTerminalScroll}
                className="absolute inset-0 bg-[#050505] overflow-y-auto p-4 font-mono text-sm leading-relaxed text-gray-400 scroll-smooth"
              >
              {status === "idle" && (
                <div>
                  <span className="text-fg-muted">[</span><span className="text-primary">*</span><span className="text-fg-muted">]</span> Ready — {scanMeta.label}<br />
                  <span className="text-fg-muted">[</span><span className="text-primary">*</span><span className="text-fg-muted">]</span> Configure & deploy
                </div>
              )}
              {(status === "running" || status === "completed" || status === "failed" || status === "stopping") && (
                <div>
                  {logEntries.map((line, i) => {
                    const isPhase = line.startsWith("[*] Phase:")
                    const isFail = line.startsWith("[!]")
                    const isFinding = line.startsWith("[+]") && line.includes(":")
                    const textColor = isPhase ? "text-severity-medium" : isFail ? "text-severity-critical" : isFinding ? "text-fg" : "text-fg-muted"
                    return <div key={i} className={`${textColor} ${isPhase ? "font-semibold" : ""}`}>{line}</div>
                  })}
                  {status === "running" && <span className="text-primary animate-pulse">▌</span>}
                  <div ref={logEndRef} />
                </div>
              )}
              {(status === "completed" || status === "failed") && (
                <div className="mt-1 pt-1 border-t border-border">
                  {status === "completed" ? (
                    <span className="text-severity-low text-xs">[✓] Completed — {findingsCount} findings</span>
                  ) : (
                    <span className="text-severity-critical text-xs">[!] {error || "Failed"}</span>
                  )}
                </div>
              )}
              </div>
              {!autoScrollLogs && status === "running" && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                  <button 
                    onClick={() => { setAutoScrollLogs(true); logEndRef.current?.scrollIntoView({ behavior: "smooth" }) }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary/20 backdrop-blur-md border border-primary/40 text-primary text-xs font-mono font-bold rounded-full shadow-lg hover:bg-primary/30 transition-all animate-bounce"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    JUMP TO LATEST
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Findings Dashboard (Visuals) */}
          {!isSpiderMode && vulnFindings.length > 0 && (
            <div className="bg-bg/60 backdrop-blur-sm border border-border/60 shadow-sm rounded-xl overflow-hidden transition-all p-5 flex gap-6 items-center">
              <div className="h-[120px] w-[120px] shrink-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={[
                        { name: "Critical", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "critical").length, color: "hsl(var(--critical))" },
                        { name: "High", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "high").length, color: "hsl(var(--high))" },
                        { name: "Medium", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "medium").length, color: "hsl(var(--medium))" },
                        { name: "Low", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "low").length, color: "hsl(var(--low))" },
                        { name: "Info", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "informational").length, color: "hsl(var(--info))" },
                      ].filter(d => d.value > 0)}
                      cx="50%" cy="50%" innerRadius={40} outerRadius={55} paddingAngle={2} dataKey="value" stroke="none"
                    >
                      {
                        [
                        { name: "Critical", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "critical").length, color: "hsl(var(--critical))" },
                        { name: "High", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "high").length, color: "hsl(var(--high))" },
                        { name: "Medium", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "medium").length, color: "hsl(var(--medium))" },
                        { name: "Low", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "low").length, color: "hsl(var(--low))" },
                        { name: "Info", value: vulnFindings.filter(f => f.severity?.toLowerCase() === "informational").length, color: "hsl(var(--info))" },
                        ].filter(d => d.value > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))
                      }
                    </Pie>
                    <RechartsTooltip contentStyle={{backgroundColor: "hsl(var(--bg))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px"}} itemStyle={{color: "hsl(var(--fg))"}} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-xl font-bold">{vulnFindings.length}</span>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-fg-muted font-bold uppercase tracking-wider">Critical</span>
                  <div className="text-lg font-mono text-severity-critical">{vulnFindings.filter(f => f.severity?.toLowerCase() === "critical").length}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-fg-muted font-bold uppercase tracking-wider">High</span>
                  <div className="text-lg font-mono text-severity-high">{vulnFindings.filter(f => f.severity?.toLowerCase() === "high").length}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-fg-muted font-bold uppercase tracking-wider">Medium</span>
                  <div className="text-lg font-mono text-severity-medium">{vulnFindings.filter(f => f.severity?.toLowerCase() === "medium").length}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-fg-muted font-bold uppercase tracking-wider">Low/Info</span>
                  <div className="text-lg font-mono text-severity-low">{vulnFindings.filter(f => f.severity?.toLowerCase() === "low" || f.severity?.toLowerCase() === "informational").length}</div>
                </div>
              </div>
            </div>
          )}

          {/* Findings Table */}
          <div className="bg-bg/60 backdrop-blur-sm border border-border/60 shadow-sm rounded-xl overflow-hidden transition-all hover:border-border/80 hover:shadow-md">
            <div className="px-5 py-4 flex items-center justify-between border-b border-border/50 bg-gradient-to-r from-bg-subtle/50 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shadow-inner">
                  {isSpiderMode || endpointFindings.length > vulnFindings.length
                    ? <Globe className="w-4 h-4 text-primary" />
                    : <ListChecks className="w-4 h-4 text-primary" />
                  }
                </div>
                  <span className="text-sm font-bold text-fg uppercase tracking-widest">
                    {isSpiderMode ? "Endpoints Discovered" : (endpointFindings.length > 0 && vulnFindings.length === 0 ? "Discovered Endpoints" : "Findings")}
                    <span className="text-fg-muted ml-1.5">
                      {isSpiderMode
                        ? (methodFilter || statusFilter || sizeFilter)
                          ? `${filteredEndpoints.length}/${endpointFindings.length}`
                          : endpointFindings.length
                        : findings.length}
                    </span>
                  </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                {/* Show tab switcher when both endpoints and vulns exist */}
                {endpointFindings.length > 0 && vulnFindings.length > 0 && (
                  <div className="flex items-center gap-1 mr-2">
                    <button onClick={() => setFindingsTab("vulns")}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-colors ${
                        findingsTab === "vulns" || findingsTab === "all" ? "bg-primary/10 text-primary" : "text-fg-muted hover:text-fg"
                      }`}>Vulns ({vulnFindings.length})</button>
                    <button onClick={() => setFindingsTab("endpoints")}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-colors ${
                        findingsTab === "endpoints" ? "bg-primary/10 text-primary" : "text-fg-muted hover:text-fg"
                      }`}>URLs ({endpointFindings.length})</button>
                  </div>
                )}
                {vulnFindings.length > 0 && (
                  <>
                    {severityCounts.critical > 0 && <><span className="w-1.5 h-1.5 rounded-full bg-severity-critical" /><span className="text-severity-critical">{severityCounts.critical}</span></>}
                    {severityCounts.high > 0 && <><span className="w-1.5 h-1.5 rounded-full bg-severity-high" /><span className="text-severity-high">{severityCounts.high}</span></>}
                    {severityCounts.medium > 0 && <><span className="w-1.5 h-1.5 rounded-full bg-severity-medium" /><span className="text-severity-medium">{severityCounts.medium}</span></>}
                    {severityCounts.low > 0 && <><span className="w-1.5 h-1.5 rounded-full bg-severity-low" /><span className="text-severity-low">{severityCounts.low}</span></>}
                  </>
                )}
                {findingsCount > 0 && (
                  <motion.div key={findingsCount} initial={{scale:1}} animate={{scale:[1,1.05,1]}} transition={{duration:0.2}}>
                    <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-primary/20">
                      {findingsCount} Findings
                    </Badge>
                  </motion.div>
                )}
                {endpointFindings.length > 0 && (!vulnFindings.length || findingsTab === "endpoints") && (
                  <span className="text-severity-info flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-severity-info" />
                    {endpointFindings.length} URLs
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <AnimatePresence mode="wait">
              {findings.length === 0 && status !== "running" ? (
                <motion.div key="empty" initial={{opacity:0, scale: 0.95}} animate={{opacity:1, scale: 1}} exit={{opacity:0}} transition={{duration:0.3}} className="px-4 py-24 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-bg-muted to-bg-subtle flex items-center justify-center mb-6 shadow-inner border border-border/50">
                    <ShieldCheck className="w-10 h-10 text-fg-disabled drop-shadow-md" />
                  </div>
                  <h3 className="text-lg font-bold text-fg mb-2 tracking-tight">System Secured & Ready</h3>
                  <p className="text-sm text-fg-muted max-w-md leading-relaxed">
                    Deploy a Spider scan to aggressively map out target endpoints, or initiate an Active scan to penetrate and discover vulnerabilities.
                  </p>
                </motion.div>
              ) : findings.length === 0 && status === "running" ? (
                <motion.div key="scanning" initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} exit={{opacity:0}} transition={{duration:0.3}} className="px-4 py-24 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
                  <div className="relative w-20 h-20 mb-8 mx-auto">
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Radar className="w-8 h-8 text-primary animate-pulse" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-fg mb-2 tracking-tight">Analyzing Target Payload...</h3>
                  <p className="text-sm text-fg-muted max-w-sm mx-auto">
                    Intercepting and analyzing traffic in real-time. Stand by for live intelligence feed.
                  </p>
                </motion.div>
              ) : (
                <motion.div key="table" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}>
                <table className="w-full text-xs font-mono">
                  {/* ── Endpoints Table (spider mode or when endpoints tab selected) ── */}
                  {(findingsTab === "endpoints" || (isSpiderMode && findingsTab !== "vulns")) && endpointFindings.length > 0 ? (
                    <>
                      <thead>
                        <tr className="border-b border-border bg-bg-muted">
                          <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-8">#</th>
                          <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-12">Method</th>
                          <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-14">Status</th>
                          <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider">URL</th>
                          <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-28 hidden lg:table-cell">Content-Type</th>
                          <th className="text-left px-2 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-16 hidden md:table-cell">Size</th>
                          <th className="text-right px-2 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-16">Copy</th>
                        </tr>
                        <tr className="border-b border-border">
                          <th className="px-2 py-1"></th>
                          <th className="px-2 py-1">
                            <input value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
                              placeholder="GET"
                              className="w-full h-8 text-xs font-mono bg-bg border border-border rounded px-1.5 outline-none focus:border-primary placeholder:text-fg-disabled" />
                          </th>
                          <th className="px-2 py-1">
                            <input value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                              placeholder="2xx"
                              className="w-full h-8 text-xs font-mono bg-bg border border-border rounded px-1.5 outline-none focus:border-primary placeholder:text-fg-disabled" />
                          </th>
                          <th className="px-2 py-1"></th>
                          <th className="px-2 py-1 hidden lg:table-cell"></th>
                          <th className="px-2 py-1 hidden md:table-cell">
                            <input value={sizeFilter} onChange={e => setSizeFilter(e.target.value)}
                              placeholder="10k"
                              className="w-full h-8 text-xs font-mono bg-bg border border-border rounded px-1.5 outline-none focus:border-primary placeholder:text-fg-disabled" />
                          </th>
                          <th className="px-2 py-1"></th>
                        </tr>
                      </thead>
                      <motion.tbody className="divide-y divide-border" initial="hidden" animate="show" variants={{hidden:{opacity:0},show:{opacity:1,transition:{staggerChildren:0.03}}}}>
                        {paginatedEndpoints.map((f, i) => {
                          const urlStr = f.url || ""
                          const rd = (f.raw_data && typeof f.raw_data === 'object' ? f.raw_data as any : {}) || {}
                          const method = f.method || rd.method || null
                          const statusCode = f.statusCode != null ? String(f.statusCode) : rd.statusCode != null ? String(rd.statusCode) : null
                          const contentType = rd.contentType || null
                          const responseSize = rd.responseSize || null
                          const methodColor = method === "POST" ? "text-yellow-600 dark:text-yellow-400" : method === "PUT" ? "text-blue-600 dark:text-blue-400" : method === "DELETE" ? "text-severity-critical" : "text-severity-low"
                          const statusColor = statusCode
                            ? statusCode.startsWith("2") ? "text-severity-low bg-severity-low-bg border-severity-low-border"
                              : statusCode.startsWith("3") ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
                              : statusCode.startsWith("4") ? "text-severity-high bg-severity-high-bg border-severity-high-border"
                              : statusCode.startsWith("5") ? "text-severity-critical bg-severity-critical-bg border-severity-critical-border"
                              : "text-fg-muted bg-bg-muted border-border"
                            : "text-fg-disabled bg-bg-muted border-border"
                          const sizeStr = responseSize
                            ? responseSize > 1024 * 1024
                              ? (responseSize / 1024 / 1024).toFixed(1) + "MB"
                              : responseSize > 1024
                                ? (responseSize / 1024).toFixed(0) + "KB"
                                : responseSize + "B"
                            : null
                          return (
                            <tr key={f.id} className="hover:bg-bg-muted transition-colors">
                              <td className="px-2 py-2 text-fg-muted text-xs">{i + 1}</td>
                              <td className="px-2 py-2">
                                {method ? (
                                  <span className={`text-xs font-mono font-semibold ${methodColor}`}>{method}</span>
                                ) : (
                                  <span className="text-fg-disabled text-xs">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                {statusCode ? (
                                  <span className={`inline-flex items-center px-1 py-0.5 rounded text-xs font-mono border ${statusColor}`}>{statusCode}</span>
                                ) : (
                                  <span className="text-fg-disabled text-xs">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1.5">
                                  <Globe className="w-3 h-3 text-severity-info shrink-0" />
                                  <span className="text-fg text-xs truncate max-w-[300px]" title={urlStr}>{urlStr}</span>
                                </div>
                              </td>
                              <td className="px-2 py-2 hidden lg:table-cell">
                                {contentType ? (
                                  <span className="text-xs font-mono text-fg-muted truncate block max-w-[160px]" title={contentType}>{contentType}</span>
                                ) : (
                                  <span className="text-fg-disabled text-xs">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 hidden md:table-cell">
                                {sizeStr ? (
                                  <span className="text-xs font-mono text-fg-muted">{sizeStr}</span>
                                ) : (
                                  <span className="text-fg-disabled text-xs">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right">
                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(urlStr) }}
                                  className="text-xs text-primary hover:text-primary-hover font-medium">COPY</button>
                              </td>
                            </tr>
                          )
                        })}
                      </motion.tbody>
                      {hasMoreEndpoints && (
                        <tfoot>
                          <tr>
                            <td colSpan={5} className="p-4 text-center">
                              <button
                                onClick={() => setEndpointPage(p => p + 1)}
                                className="px-5 py-2.5 bg-bg/50 backdrop-blur-md text-primary font-bold text-xs font-mono rounded-full hover:bg-primary hover:text-white transition-all duration-300 border border-primary/30 shadow-[0_0_10px_rgba(var(--primary),0.1)] hover:shadow-[0_0_15px_rgba(var(--primary),0.4)]"
                              >
                                LOAD MORE ENDPOINTS ({filteredEndpoints.length - paginatedEndpoints.length} REMAINING)
                              </button>
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </>
                  ) : findingsTab === "vulns" || findingsTab === "all" || (!isSpiderMode && findingsTab !== "endpoints") ? (
                    /* ── Vulnerability Table ── */
                    vulnFindings.length > 0 ? (
                      <>
                        <thead>
                          <tr className="border-b border-border bg-bg-muted">
                            <th className="text-left px-3 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-20">Severity</th>
                            <th className="text-left px-3 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-14 hidden sm:table-cell">Conf</th>
                            <th className="text-left px-3 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider">Finding</th>
                            <th className="text-left px-3 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-16 hidden md:table-cell">CWE</th>
                            <th className="text-left px-3 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider hidden sm:table-cell">Endpoint</th>
                            <th className="text-left px-3 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-20 hidden lg:table-cell">Param</th>
                            <th className="text-right px-3 py-2 text-xs text-fg-muted font-medium uppercase tracking-wider w-24">Action</th>
                          </tr>
                        </thead>
                        <motion.tbody className="divide-y divide-border" initial="hidden" animate="show" variants={{hidden:{opacity:0},show:{opacity:1,transition:{staggerChildren:0.03}}}}>
                          {vulnFindings.map((f) => {
                            const confLabel = f.confidence === "3" ? "HIGH" : f.confidence === "2" ? "MED" : f.confidence === "1" ? "LOW" : null
                            return (
                            <motion.tr key={f.id} onClick={() => setSelectedFinding(f)} variants={{hidden:{opacity:0,y:4},show:{opacity:1,y:0,transition:{duration:0.15}}}} className="hover:bg-bg-muted cursor-pointer transition-colors">
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-medium border ${sevColor(f.severity || "informational")}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${f.severity === "critical" ? "bg-severity-critical" : f.severity === "high" ? "bg-severity-high" : f.severity === "medium" ? "bg-severity-medium" : f.severity === "low" ? "bg-severity-low" : "bg-severity-info"}`} />
                                  {(f.severity || "info").substring(0, 3).toUpperCase()}
                                </span>
                              </td>
                              <td className="px-3 py-2 hidden sm:table-cell">
                                {confLabel ? (
                                  <span className={`text-xs font-mono px-1 py-0.5 rounded ${
                                    confLabel === "HIGH" ? "text-severity-high bg-severity-high-bg" :
                                    confLabel === "MED" ? "text-severity-medium bg-severity-medium-bg" :
                                    "text-severity-info bg-severity-info-bg"
                                  }`}>{confLabel}</span>
                                ) : (
                                  <span className="text-fg-disabled text-xs">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-fg truncate max-w-[260px]">{f.title || "Untitled Finding"}</td>
                              <td className="px-3 py-2 text-fg-muted hidden md:table-cell">
                                {f.cweid && f.cweid !== "-1" ? (
                                  <span className="text-xs">CWE-{f.cweid}</span>
                                ) : (
                                  <span className="text-fg-disabled text-xs">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-fg-muted truncate max-w-[180px] hidden sm:table-cell">{f.url || "—"}</td>
                              <td className="px-3 py-2 text-fg-muted truncate max-w-[120px] hidden lg:table-cell font-mono">{f.param || "—"}</td>
                              <td className="px-4 py-3 text-right">
                                <Button size="sm" variant="secondary" className="h-7 text-xs font-medium">Review</Button>
                              </td>
                            </motion.tr>
                            )
                          })}
                        </motion.tbody>
                      </>
                    ) : null
                  ) : null}
                </table>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* ── Finding Detail Sheet ── */}
      <Sheet open={!!selectedFinding} onOpenChange={(open) => !open && setSelectedFinding(null)}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Finding Details</SheetTitle>
          </SheetHeader>
          {selectedFinding && (
            <ZapAlertDetail
              alert={{
                id: selectedFinding.id,
                alert_name: selectedFinding.title || null,
                title: selectedFinding.title || null,
                severity: selectedFinding.severity || null,
                description: selectedFinding.description || null,
                url: selectedFinding.url || null,
                raw_data: selectedFinding.raw_data || null,
                status: "pending",
                evidence: selectedFinding.evidence || null,
                solution: selectedFinding.solution || null,
                reference: selectedFinding.reference || null,
                cweid: selectedFinding.cweid ? Number(selectedFinding.cweid) : null,
                confidence: selectedFinding.confidence ? Number(selectedFinding.confidence) : null,
                attack: selectedFinding.attack || null,
                param: selectedFinding.param || null,
                other: selectedFinding.other || null,
                wascid: selectedFinding.wascid ? Number(selectedFinding.wascid) : null,
                riskcode: selectedFinding.riskcode ? Number(selectedFinding.riskcode) : null,
              }}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* FindingForm for ZAP alert review + create */}
      <FindingForm
        open={findingFormOpen}
        onOpenChange={(open) => { if (!open) { setFindingFormOpen(false); setFindingFormAlert(null) } }}
        projects={projects}
        members={[]}
        initialData={(() => {
          if (!findingFormAlert) return undefined
          const rawData = (findingFormAlert.raw_data || {}) as Record<string, unknown>
          const sev = findingFormAlert.severity || "medium"
          let cvssScore = 0
          if (sev === "critical") cvssScore = 9.5
          else if (sev === "high") cvssScore = 7.5
          else if (sev === "medium") cvssScore = 5.0
          else if (sev === "low") cvssScore = 2.5
          const refs: string[] = []
          const refVal = findingFormAlert.reference || (rawData as any).reference
          if (refVal) {
            refs.push(...String(refVal).split("\n").map((r: string) => r.trim()).filter(Boolean))
          }
          const pocParts = [findingFormAlert.attack, findingFormAlert.evidence].filter(Boolean)
          return {
            title: findingFormAlert.title || "ZAP Alert Finding",
            description: findingFormAlert.description || undefined,
            severity: sev as "critical" | "high" | "medium" | "low" | "informational",
            project_id: selectedProject || undefined,
            endpoint_url: findingFormAlert.url || undefined,
            cvss_score: cvssScore,
            cwe_id: findingFormAlert.cweid ? `CWE-${findingFormAlert.cweid}` : undefined,
            affected_component: findingFormAlert.param || findingFormAlert.url || undefined,
            proof_of_concept: pocParts.length > 0 ? pocParts.join("\n---\n") : undefined,
            impact: findingFormAlert.other || (rawData as any).otherinfo || (rawData as any).impact || undefined,
            remediation: findingFormAlert.solution || (rawData as any).solution || (rawData as any).remediation || undefined,
            reference_links: refs.length > 0 ? refs : undefined,
          } as InitialFindingData
        })()}
        onSuccess={() => {}}
        onSuccessWithId={handleFindingFormSuccess}
      />
    </motion.div>
  )
}

function TokenCopyHelper({ tokens }: { tokens: Record<string, unknown> }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const cookies = (tokens as any).cookies as Array<{ name: string; domain?: string; httpOnly?: boolean; secure?: boolean; value_preview?: string }> | undefined
  const cookieCount = (tokens as any).cookieCount as number | undefined
  return (
    <>
      {Object.entries(tokens).filter(([k]) => k !== "cookies" && k !== "cookieCount").map(([method, data]: [string, any]) => {
        const tokenValue = data.token_preview || ""
        const isCopied = copiedKey === method
        return (
          <div key={method} className="flex flex-col gap-1 text-xs font-mono p-2 rounded bg-bg border border-border">
            <div className="flex items-center justify-between">
              <span className="text-fg-muted uppercase font-semibold tracking-wider">{method}</span>
              <span className="text-[9px] text-severity-low flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> {data.token_type || "Verified"}</span>
            </div>
            <div className="flex items-start gap-1">
              <code className="text-fg break-all flex-1 bg-bg-subtle px-1.5 py-0.5 rounded text-xs border border-border">{tokenValue || "✓ Authenticated"}</code>
              {tokenValue && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(tokenValue)
                    setCopiedKey(method)
                    toast.success(`${method.toUpperCase()} token copied`, { duration: 2000 })
                    setTimeout(() => setCopiedKey(null), 2000)
                  }}
                  className="shrink-0 px-1.5 py-0.5 rounded text-[9px] bg-bg-subtle border border-border hover:bg-panel-hover text-fg-muted"
                  title="Copy token"
                >{isCopied ? "Copied!" : "Copy"}</button>
              )}
            </div>
            {data.message && <span className="text-fg-subtle text-[9px]">— {data.message}</span>}
          </div>
        )
      })}
      {cookies && cookies.length > 0 && (
        <div className="flex flex-col gap-1 text-xs font-mono p-2 rounded bg-bg border border-border">
          <div className="flex items-center justify-between">
            <span className="text-fg-muted uppercase font-semibold tracking-wider">Cookies ({cookieCount ?? cookies.length})</span>
          </div>
          {cookies.map((c, i) => {
            const flags = [c.httpOnly ? "H" : "", c.secure ? "S" : ""].filter(Boolean).join("")
            return (
              <div key={i} className="flex items-start gap-1 text-[9px] leading-tight">
                <code className="text-fg break-all flex-1 bg-bg-subtle px-1.5 py-0.5 rounded border border-border">
                  {c.name}={c.value_preview || "..."}
                  <span className="text-fg-subtle ml-1">
                    {c.domain ? `@${c.domain}` : ""}{flags ? `[${flags}]` : ""}
                  </span>
                </code>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
