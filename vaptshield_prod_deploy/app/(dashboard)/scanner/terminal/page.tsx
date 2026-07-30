"use client"

import { Suspense, useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Terminal, Play, Square, Clock, AlertTriangle, Loader2, UserX,
  Scan, CheckCircle, ShieldAlert, FileScan, XCircle,
  Check, GitMerge, Trash2, Eye, MoreHorizontal, Sparkles,
  FolderKanban, RefreshCw, Copy
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { motion, AnimatePresence } from "framer-motion"
import { Textarea } from "@/components/ui/textarea"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts"

import { toast } from "sonner"
import { ZapAlertDetail } from "@/components/findings/ZapAlertDetail"
import { DockerQuotaBadge } from "@/components/scanner/DockerQuotaBadge"
import { FindingForm } from "@/components/findings/FindingForm"
import type { InitialFindingData } from "@/components/findings/FindingForm"
import { useTerminalStore } from "@/lib/hooks/useTerminalStore"
import { deleteFinding } from "@/app/(dashboard)/findings/actions"

interface Project {
  id: string
  name: string
}

interface Session {
  containerId: string
  sessionId: string
  wsUrl: string
  success: boolean
}

interface InUseInfo {
  id: string
  full_name: string
}

const KALI_TOOLS = [
  {
    category: "Recon & Discovery",
    tools: [
      { name: "nmap", shortDesc: "Network exploration & port scanner", fullDesc: "Nmap is an open source utility for network discovery and security auditing.", exampleCommand: "nmap -sV -sC -O " },
      { name: "subfinder", shortDesc: "Fast passive subdomain enumeration", fullDesc: "Subfinder is a subdomain discovery tool that discovers valid subdomains for websites.", exampleCommand: "subfinder -d " },
      { name: "naabu", shortDesc: "Fast port scanner", fullDesc: "Naabu is a port scanning tool written in Go that allows you to enumerate valid ports for hosts in a fast and reliable manner.", exampleCommand: "naabu -host " },
      { name: "amass", shortDesc: "In-depth Attack Surface Mapping", fullDesc: "The OWASP Amass Project performs network mapping of attack surfaces and external asset discovery.", exampleCommand: "amass enum -d " },
      { name: "dnsrecon", shortDesc: "DNS Enumeration script", fullDesc: "DNSRecon is a Python script that provides the ability to perform DNS enumeration.", exampleCommand: "dnsrecon -d " },
    ]
  },
  {
    category: "Web Scanning & Fuzzing",
    tools: [
      { name: "nuclei", shortDesc: "Fast vulnerability scanner", fullDesc: "Nuclei is used to send requests across targets based on a template.", exampleCommand: "nuclei -u http:// " },
      { name: "ffuf", shortDesc: "Fast web fuzzer", fullDesc: "ffuf is a fast web fuzzer written in Go.", exampleCommand: "ffuf -w /usr/share/wordlists/dirb/common.txt -u http://FUZZ" },
      { name: "gobuster", shortDesc: "Directory/File & DNS busting", fullDesc: "Gobuster is a tool used to brute-force URIs.", exampleCommand: "gobuster dir -u http:// -w /usr/share/wordlists/dirb/common.txt" },
      { name: "feroxbuster", shortDesc: "Fast, simple, recursive content discovery", fullDesc: "Feroxbuster is a tool designed to perform Forced Browsing.", exampleCommand: "feroxbuster -u http:// " },
      { name: "nikto", shortDesc: "Web server scanner", fullDesc: "Nikto is an Open Source (GPL) web server scanner which performs comprehensive tests.", exampleCommand: "nikto -h " },
      { name: "wpscan", shortDesc: "WordPress scanner", fullDesc: "WPScan is a black box WordPress vulnerability scanner.", exampleCommand: "wpscan --url http:// --enumerate u" },
    ]
  },
  {
    category: "Exploitation & Network",
    tools: [
      { name: "sqlmap", shortDesc: "Automatic SQL injection", fullDesc: "sqlmap automates the process of detecting and exploiting SQL injection flaws.", exampleCommand: "sqlmap -u http:// --batch" },
      { name: "msfconsole", shortDesc: "Metasploit Framework", fullDesc: "The Metasploit Framework is a penetration testing toolkit.", exampleCommand: "msfconsole -q" },
      { name: "bettercap", shortDesc: "The Swiss Army knife for WiFi/BLE/IPv4/IPv6 networks", fullDesc: "Bettercap is a powerful, easily extensible and modular framework.", exampleCommand: "bettercap" },
      { name: "testssl.sh", shortDesc: "Testing TLS/SSL encryption", fullDesc: "testssl.sh is a free command line tool which checks a server's service on any port for the support of TLS/SSL ciphers.", exampleCommand: "testssl.sh " },
    ]
  },
  {
    category: "Password & Crypto",
    tools: [
      { name: "hashcat", shortDesc: "Advanced password recovery", fullDesc: "Hashcat is the world's fastest and most advanced password recovery utility.", exampleCommand: "hashcat -m 0 -a 0 hashes.txt /usr/share/wordlists/rockyou.txt" },
      { name: "john", shortDesc: "John the Ripper", fullDesc: "John the Ripper is a fast password cracker.", exampleCommand: "john --wordlist=/usr/share/wordlists/rockyou.txt hashes.txt" },
      { name: "aircrack-ng", shortDesc: "WiFi security auditing tools", fullDesc: "Aircrack-ng is a complete suite of tools to assess WiFi network security.", exampleCommand: "aircrack-ng " },
    ]
  }
];

export default function TerminalPage() {
  return (
    <Suspense fallback={
      <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
        <div className="h-8 w-48 animate-pulse bg-bg-muted rounded" />
      </div>
    }>
      <TerminalPageInner />
    </Suspense>
  )
}

function TerminalPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const lastSessionIdRef = useRef<string | null>(null)
  const [lastSessionId, setLastSessionId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState(searchParams.get("project") || "")
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTime, setActiveTime] = useState(0)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)

  useEffect(() => {
    if (session && !iframeLoaded) {
      setLoadingStep(0)
      const t1 = setTimeout(() => setLoadingStep(1), 1000)
      const t2 = setTimeout(() => setLoadingStep(2), 2500)
      const t3 = setTimeout(() => setLoadingStep(3), 4000)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }
  }, [session, iframeLoaded])
  const [inUseDialog, setInUseDialog] = useState<{ open: boolean; userName: string }>({ open: false, userName: "" })
  const [userRole, setUserRole] = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)
  const canScan = userRole === "admin" || userRole === "security_engineer"

  // Findings state (post-parse)
  const [findings, setFindings] = useState<any[]>([])
  const [findingsCount, setFindingsCount] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [kaliTaskId, setKaliTaskId] = useState<string | null>(null)
  const [selectedFinding, setSelectedFinding] = useState<any | null>(null)
  const [findingFormOpen, setFindingFormOpen] = useState(false)
  const [findingFormAlert, setFindingFormAlert] = useState<any | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const esRetryCountRef = useRef<Map<string, number>>(new Map())
  const lastFetchRef = useRef<number>(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergeTitle, setMergeTitle] = useState("")
  const [mergeSeverity, setMergeSeverity] = useState("")
  const [mergeDescription, setMergeDescription] = useState("")
  const [merging, setMerging] = useState(false)
  const [bulkProcessing, setBulkProcessing] = useState(false)

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [isBulkDelete, setIsBulkDelete] = useState(false)

  // AI enrichment state
  const [aiEnrichments, setAiEnrichments] = useState<Record<string, any>>({})
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set())

  // AI Parse fallback state
  const [aiParsing, setAiParsing] = useState(false)
  const [aiParseDialogOpen, setAiParseDialogOpen] = useState(false)

  // Command validation state


  // ─── Zustand store sync (persists across page navigation) ───
  const setStoreSession = useTerminalStore((s) => s.setSession)
  const setStoreSelectedProject = useTerminalStore((s) => s.setSelectedProject)
  const setStoreFindings = useTerminalStore((s) => s.setFindings)
  const addStoreFindings = useTerminalStore((s) => s.addFindings)
  const removeStoreFindings = useTerminalStore((s) => s.removeFindings)
  const setStoreAiEnrichment = useTerminalStore((s) => s.setAiEnrichment)
  const removeStoreAiEnrichment = useTerminalStore((s) => s.removeAiEnrichment)
  const setStoreKaliTaskId = useTerminalStore((s) => s.setKaliTaskId)
  const setStoreSessionStartedAt = useTerminalStore((s) => s.setSessionStartedAt)
  const resetStoreSession = useTerminalStore((s) => s.resetSession)
  const storeKaliTaskId = useTerminalStore((s) => s.kaliTaskId)
  const storeSessionStartedAt = useTerminalStore((s) => s.sessionStartedAt)

  // On mount: restore session + findings + lastSessionId from store/storage
  useEffect(() => {
    setMounted(true)
    const sid = sessionStorage.getItem("vaptshield-last-session-id")
    if (sid) {
      lastSessionIdRef.current = sid
      setLastSessionId(sid)
    }
    const stored = useTerminalStore.getState()
    if (stored.session && !session) {
      setSession(stored.session)
      setActiveTime(
        stored.sessionStartedAt
          ? Math.floor((Date.now() - stored.sessionStartedAt) / 1000)
          : stored.activeTime
      )
    }
    if (stored.findings.length > 0 && findings.length === 0) {
      setFindings(stored.findings)
      setFindingsCount(stored.findingsCount)
    }
    if (stored.selectedProject && !selectedProject) {
      setSelectedProject(stored.selectedProject)
    }
    if (stored.kaliTaskId) {
      setKaliTaskId(stored.kaliTaskId)
    }
    if (Object.keys(stored.aiEnrichments).length > 0 && Object.keys(aiEnrichments).length === 0) {
      setAiEnrichments(stored.aiEnrichments as Record<string, any>)
    }
  }, [])

  // Subscribe to store session changes from TerminalHeartbeatProvider (page refresh case)
  useEffect(() => {
    const unsub = useTerminalStore.subscribe((state) => {
      if (state.session && state.session.wsUrl !== sessionRef.current?.wsUrl) {
        setSession(state.session)
        setActiveTime(
          state.sessionStartedAt
            ? Math.floor((Date.now() - state.sessionStartedAt) / 1000)
            : state.activeTime
        )
      } else if (!state.session && sessionRef.current) {
        setSession(null)
        setActiveTime(0)
      }
    })
    return unsub
  }, [])

  // Sync local state → store whenever it changes
  useEffect(() => { if (session) setStoreSession(session) }, [session, setStoreSession])
  useEffect(() => { if (findings.length > 0) setStoreFindings(findings) }, [findings, setStoreFindings])
  // Note: aiEnrichments sync happens inline wherever setAiEnrichments is called

  // ── Helper functions ─────────────────────────────────────
  const severityCounts = useCallback((items: any[]) => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
    for (const f of items) {
      const sev = (f.severity || "informational").toLowerCase()
      if (sev in counts) (counts as any)[sev]++
    }
    return counts
  }, [])

  const sevColor = useCallback((s: string) => {
    const m: Record<string, string> = {
      critical: "text-severity-critical border-severity-critical/30 bg-severity-critical-bg",
      high: "text-severity-high border-severity-high/30 bg-severity-high-bg",
      medium: "text-severity-medium border-severity-medium/30 bg-severity-medium-bg",
      low: "text-severity-low border-severity-low/30 bg-severity-low-bg",
      informational: "text-severity-info border-severity-info/30 bg-severity-info-bg",
    }
    return m[s] || "text-fg-muted border-border bg-bg-muted"
  }, [])

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  sessionRef.current = session

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

  const startHeartbeat = useCallback((containerId: string) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/terminal/heartbeat/${containerId}`, { method: "POST" })
        if (!res.ok) {
           const data = await res.json().catch(() => ({}))
           if (data.error === "Session expired" || res.status === 404) {
              toast.error("Session expired or terminated")
              resetStoreSession()
              setStoreSessionStartedAt(null)
           }
        }
      } catch (e) {
        // network error silently ignored
      }
    }, 30000)
  }, [])

  // ── Auto-poll findings from active terminal ──────────────
  const pollTerminalFindings = useCallback(async () => {
    if (!session?.sessionId) return
    const now = Date.now()
    if (now - lastFetchRef.current < 8000) return // throttle: 8s between polls
    lastFetchRef.current = now
    try {
      const res = await fetch(`/api/kali/scan/${session.sessionId}/findings`, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return
      const data = await res.json()
      if (data.findings?.length > 0) {
        setFindings(prev => {
          const existing = new Set(prev.map(f => f.id))
          const newOnes = data.findings.filter((f: any) => !existing.has(f.id))
          if (newOnes.length === 0) return prev
          return [...prev, ...newOnes]
        })
        setFindingsCount(data.findings.length)
      }
    } catch { /* silent — polling will retry */ }
  }, [session])

  // Start/stop polling when session changes
  useEffect(() => {
    if (session?.sessionId) {
      // Start polling after a delay to let commands start
      const timer = setTimeout(() => {
        pollRef.current = setInterval(pollTerminalFindings, 15000)
        // Immediate first poll
        pollTerminalFindings()
      }, 5000)
      return () => {
        clearTimeout(timer)
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    }
  }, [session?.sessionId, pollTerminalFindings])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])

  // ── Parse terminal output into findings ────────────────────────
  const attachKaliStream = useCallback((taskId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    const es = new EventSource(`/api/kali/scan/${taskId}/stream`)
    eventSourceRef.current = es
    const retryMap = esRetryCountRef.current

    es.addEventListener("new_finding", (e: MessageEvent) => {
      const d = JSON.parse(e.data)
      setFindings(prev => [...prev, {
        id: d.id,
        title: d.title,
        severity: d.severity,
        description: d.description,
        url: d.url,
        raw_data: d.raw_data || null,
        evidence: d.evidence || null,
        solution: d.solution || null,
        reference: d.reference || null,
        cweid: d.cweid || null,
        attack: d.attack || null,
        param: d.param || null,
        other: d.other || null,
        riskcode: d.riskcode || null,
      }])
      setFindingsCount(c => c + 1)
    })

    es.addEventListener("complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data)
      if (d.findings?.length > 0) {
        // SSE returns full task findings — merge into existing, don't overwrite
        setFindings(prev => {
          const existing = new Set(prev.map(f => f.id))
          const newOnes = d.findings
            .map((f: any) => ({
              id: f.id,
              title: f.alert_name || f.title,
              severity: f.severity,
              description: f.description,
              url: f.url,
              raw_data: f.raw_data || null,
              evidence: f.evidence || null,
              solution: f.solution || null,
              reference: f.reference || null,
              cweid: f.cweid || null,
              attack: f.attack || null,
              param: f.param || null,
              other: f.other || null,
              riskcode: f.riskcode || null,
            }))
            .filter((f: any) => !existing.has(f.id))
          if (newOnes.length === 0) return prev
          return [...prev, ...newOnes]
        })
      }
      setParsing(false)
      setParseError(null)
      es.close()
      eventSourceRef.current = null
    })

    es.addEventListener("failed", (e: MessageEvent) => {
      const d = JSON.parse(e.data)
      setParseError(d.error || "Parse failed")
      setParsing(false)
      toast.error("Parse failed", { description: d.error })
      es.close()
      eventSourceRef.current = null
    })

    es.addEventListener("error", () => {
      const key = taskId
      const retries = (retryMap.get(key) || 0) + 1
      retryMap.set(key, retries)
      if (retries >= 5) {
        setParseError("Stream connection lost")
        setParsing(false)
        es.close()
        eventSourceRef.current = null
      }
    })
  }, [])

  const parseTerminalOutput = useCallback(async (opts?: { silent?: boolean }) => {
    // Check multiple sources in order of freshness:
    // 1. React state (current session)
    // 2. lastSessionIdRef (set on start/stop, survives within-page nav)
    // 3. zustand persisted store (survives refresh via localStorage)
    // 4. sessionStorage (survives refresh via sessionStorage)
    const storeSession = useTerminalStore.getState().session
    const ssSessionId = typeof window !== "undefined" ? sessionStorage.getItem("vaptshield-last-session-id") : null
    const sid = session?.sessionId || lastSessionIdRef.current || storeSession?.sessionId || ssSessionId
    if (!sid || !selectedProject) {
      if (!opts?.silent) toast.error("No active session", { description: "Start a terminal session first" })
      return
    }
    setParsing(true)
    setParseError(null)
    try {
      const res = await fetch("/api/kali/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          project_id: selectedProject,
          auto_create_vulnerabilities: false,
        }),
      })
      const data = await res.json()
      console.log("[parseTerminalOutput] API response:", { ok: res.ok, taskId: data.taskId, findingsCount: data.findings?.length, autoCreated: data.autoCreated, error: data.error })
      if (!res.ok) {
        console.log("[parseTerminalOutput] API error:", data.error)
        setParseError(data.error || `Parse failed (${res.status})`)
        if (!opts?.silent) toast.error("Parse failed", { description: data.error })
        setParsing(false)
        return
      }
      setKaliTaskId(data.taskId)
      if (data.findings?.length > 0) {
        console.log("[parseTerminalOutput] Setting findings:", data.findings.length, "items")
        // Backend returns ALL accumulated findings by session_id — just replace
        setFindings(data.findings.map((f: any) => ({
          id: f.id || f.alert_id,
          title: f.title || f.alert_name,
          severity: f.severity,
          description: f.description,
          url: f.url || null,
          tool: f.tool,
          raw_evidence: f.raw_evidence || null,
          evidence: f.evidence || null,
          solution: f.solution || null,
          reference: f.reference || null,
          cweid: f.cweid || null,
          attack: f.attack || null,
          param: f.param || null,
          other: f.other || null,
          riskcode: f.riskcode || null,
          vuln_id: f.vuln_id || null,
          alert_id: f.alert_id || null,
          status: f.status || 'pending',
          source: f.source || (data.autoCreated ? 'auto_created' : 'pending_alert'),
          is_auto_created: !!data.autoCreated,
        })))
        setFindingsCount(data.findings.length)
      } else {
        // Even when worker returns 0 new findings, query existing ones from DB
        try {
          const accRes = await fetch(`/api/kali/scan/${sid}/findings`, { signal: AbortSignal.timeout(5000) })
          if (accRes.ok) {
            const accData = await accRes.json()
            if (accData.findings?.length > 0) {
              setFindings(accData.findings.map((f: any) => ({ ...f, is_auto_created: true })))
              setFindingsCount(accData.findings.length)
            }
          }
        } catch { /* silent fallback */ }
      }
      setParsing(false)
      if (!opts?.silent) {
        if ((data.findingsCount ?? 0) > 0) {
          toast.success(`${data.findingsCount} findings (${data.autoCreated ? 'auto-created' : 'extracted'})`)
        }
      }
      // Open SSE stream for any late-arriving findings
      attachKaliStream(data.taskId)
    } catch (err) {
      setParseError("Failed to parse terminal output")
      setParsing(false)
      if (!opts?.silent) toast.error("Parse failed", { description: "Worker unreachable" })
    }
  }, [session, selectedProject, attachKaliStream])



  const handleApprove = useCallback((findingId: string) => {
    const finding = selectedFinding || findings.find(f => f.id === findingId)
    if (!finding) { toast.error("Finding not found"); return }
    // Merge enrichment into the alert for FindingForm
    const enrichment = aiEnrichments[finding.id]
    if (enrichment) {
      setFindingFormAlert({ ...finding, ...enrichment, description: enrichment.description || finding.description })
    } else {
      setFindingFormAlert(finding)
    }
    setSelectedFinding(null)
    setFindingFormOpen(true)
  }, [selectedFinding, findings, aiEnrichments])

  const handleFindingFormSuccess = useCallback(async (vulnId: string) => {
    const alert = findingFormAlert
    if (!alert) return
    try {
      if (!alert.id.startsWith("ai-")) {
        const res = await fetch(`/api/scan-findings/${alert.id}/link-vuln`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vulnId }),
        })
        if (!res.ok) { const err = await res.json(); toast.error(err.error || "Link failed"); return }
      }
      toast.success("Finding approved and linked")
      setFindings(prev => prev.map(f => f.id === alert.id ? { ...f, id: vulnId, is_auto_created: true, vuln_id: vulnId, status: "approved" } : f))
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
      setFindings(prev => prev.map(f => f.id === findingId ? { ...f, status: "rejected" } : f))
      setSelectedFinding(null)
    } catch { toast.error("Failed to reject finding") }
  }, [])

  // ── Delete handler ────────────────────────────────────────────
  const openDeleteConfirm = useCallback((finding: any) => {
    setDeleteTarget(finding)
    setDeleteConfirmOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.id.startsWith("ai-")) {
        // Local only finding from AI Parse
        toast.success("Finding deleted")
      } else if (deleteTarget.is_auto_created && deleteTarget.vuln_id) {
        const result = await deleteFinding(deleteTarget.vuln_id)
        if (!result.success) { toast.error(result.error || "Delete failed"); return }
        toast.success("Finding deleted")
      } else {
        const res = await fetch(`/api/scan-findings/${deleteTarget.id}`, { method: "DELETE" })
        if (!res.ok) { const err = await res.json(); toast.error(err.error || "Delete failed"); return }
        toast.success("Finding deleted")
      }
      setFindings(prev => prev.filter(f => f.id !== deleteTarget.id))
      setFindingsCount(c => Math.max(0, c - 1))
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n })
      if (selectedFinding?.id === deleteTarget.id) setSelectedFinding(null)
      setDeleteConfirmOpen(false)
      setDeleteTarget(null)
    } catch { toast.error("Failed to delete finding") }
    finally { setDeleting(false) }
  }, [deleteTarget, selectedFinding])

  const openBulkDeleteConfirm = useCallback(() => {
    if (selectedIds.size === 0) { toast.error("No findings selected"); return }
    setIsBulkDelete(true)
    setDeleteConfirmOpen(true)
  }, [selectedIds])

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setDeleting(true)
    let deleted = 0
    let errors = 0
    for (const id of ids) {
      try {
        const f = findings.find(f => f.id === id)
        if (!f) continue
        if (f.id.startsWith("ai-")) {
          // Local only finding, just let it pass
        } else if (f.is_auto_created && f.vuln_id) {
          const result = await deleteFinding(f.vuln_id)
          if (!result.success) { errors++; continue }
        } else {
          const res = await fetch(`/api/scan-findings/${id}`, { method: "DELETE" })
          if (!res.ok) { errors++; continue }
        }
        deleted++
      } catch { errors++ }
    }
    if (deleted > 0) {
      setFindings(prev => prev.filter(f => !ids.includes(f.id)))
      setFindingsCount(c => Math.max(0, c - deleted))
      toast.success(`${deleted} finding${deleted > 1 ? 's' : ''} deleted`)
    }
    if (errors > 0) toast.error(`${errors} finding${errors > 1 ? 's' : ''} failed to delete`)
    setSelectedIds(new Set())
    setIsBulkDelete(false)
    setDeleteConfirmOpen(false)
    setDeleteTarget(null)
    setDeleting(false)
  }, [selectedIds, findings])

  // ── AI Verify handler ────────────────────────────────────────
  // Calls the dedicated pending-alert enhance route which persists
  // enrichment to ai_normalized column in the DB.
  const handleAiVerify = useCallback(async (finding: any) => {
    if (verifyingIds.has(finding.id)) return
    setVerifyingIds(prev => new Set(prev).add(finding.id))
    try {
      const res = await fetch(`/api/scan-findings/${finding.id}/enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "AI enhance failed"); return }
      const data = await res.json()
      if (data.enrichment) {
        setAiEnrichments(prev => ({ ...prev, [finding.id]: data.enrichment }))
        toast.success("AI enrichment saved to DB")
      }
    } catch { toast.error("AI enhance failed", { description: "API unreachable" }) }
    finally { setVerifyingIds(prev => { const n = new Set(prev); n.delete(finding.id); return n }) }
  }, [verifyingIds])

  // ── AI Parse fallback handler ──────────────────────────────────
  const handleAiParse = useCallback(async () => {
    if (!lastSessionIdRef.current) { toast.error("No terminal session"); return }
    if (!selectedProject) { toast.error("Select a project", { description: "Choose a project before AI parsing" }); return }
    setAiParseDialogOpen(false)
    setAiParsing(true)
    try {
      // First get the raw output from the worker
      const outputRes = await fetch(`/api/terminal/session/${lastSessionIdRef.current}/output`)
      if (!outputRes.ok) { const err = await outputRes.json(); toast.error(err.error || "Failed to fetch output"); setAiParsing(false); return }
      const outputData = await outputRes.json()
      const rawOutput = outputData.output || outputData.raw_output || ""
      if (!rawOutput || rawOutput.length < 10) {
        toast.error("Terminal output is empty or too short to analyze")
        setAiParsing(false)
        return
      }

      // Try to detect the tool being used from the output
      const toolHint = detectToolFromOutput(rawOutput)

      // Show a toast that we're sending to AI
      const sendingToast = toast.loading(`AI analyzing ${rawOutput.length.toLocaleString()} bytes via Groq...`)

      const res = await fetch("/api/kali/ai-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          output: rawOutput,
          tool_hint: toolHint,
          project_id: selectedProject,
        }),
      })
      toast.dismiss(sendingToast)

      if (!res.ok) { const err = await res.json(); toast.error(err.error || "AI Parse failed"); setAiParsing(false); return }
      const data = await res.json()

      if (data.warning) {
        toast.warning(data.warning)
      }

      if (!data.findings || data.findings.length === 0) {
        const msg = data.note || "AI did not find any security-relevant findings in this output"
        toast.error(msg)
        setAiParsing(false)
        return
      }

      // Convert AI results to our finding format with ALL rich fields
      const newFindings = data.findings.map((f: any, i: number) => ({
        id: f.alert_id || `ai-${Date.now()}-${i}`,
        tool: f.tool || "unknown",
        alert_name: f.finding_name,
        title: f.finding_name,
        severity: f.severity || "medium",
        description: f.description || "",
        url: f.target || "",
        raw_data: { ai_parsed: true, ...f.raw_data },
        status: "pending",
        source: "ai-parse",
        evidence: f.evidence || "",
        solution: f.remediation || null,
        impact: f.impact || null,
        parameter: f.parameter || null,
        attack: f.attack || null,
        method: f.method || null,
        status_code: f.status_code || null,
        response_size: f.response_size || null,
        cvss_score: f.cvss_score || null,
        cvss_vector: f.cvss_vector || null,
        cwe_id: f.cwe_id || null,
        references: f.references || [],
        instances_count: f.instances_count || 1,
        is_auto_created: false,
      }))

      setFindings(prev => {
        const merged = [...newFindings, ...prev]
        localStorage.setItem("kali_findings", JSON.stringify(merged))
        return merged
      })
      setFindingsCount(c => c + newFindings.length)

      // Show summary toast with severity breakdown
      const sevSummary = data.findings.reduce((acc: Record<string, number>, f: any) => {
        const s = f.severity || "informational"
        acc[s] = (acc[s] || 0) + 1
        return acc
      }, {})
      const parts = Object.entries(sevSummary).map(([s, c]) => `${s}: ${c}`).join(", ")
      toast.success(`AI found ${newFindings.length} finding(s) — ${parts}`, {
        description: data.saved_count > 0
          ? `${data.saved_count} saved as pending alerts — review and approve below`
          : "Review findings below and approve individually",
      })
    } catch {
      toast.error("AI Parse failed", { description: "An unexpected error occurred. Please try again." })
    }
    setAiParsing(false)
  }, [selectedProject])

  // Simple heuristic to detect which tool was likely used
  function detectToolFromOutput(output: string): string | null {
    const firstLines = output.split("\n").slice(0, 20).join("\n").toLowerCase()
    if (firstLines.includes("nuclei") || output.includes("[template-id:")) return "nuclei"
    if (firstLines.includes("nmap ") || firstLines.includes("nmap#")) return "nmap"
    if (firstLines.includes("nikto")) return "nikto"
    if (firstLines.includes("hydra")) return "hydra"
    if (firstLines.includes("ffuf") || output.match(/\[Status:\s*\d+,\s*Size:/)) return "ffuf"
    if (firstLines.includes("dirb")) return "dirb"
    if (firstLines.includes("gobuster")) return "gobuster"
    if (firstLines.includes("wpscan")) return "wpscan"
    if (firstLines.includes("sqlmap")) return "sqlmap"
    if (firstLines.includes("commix")) return "commix"
    if (firstLines.includes("xsstrike")) return "xsstrike"
    if (firstLines.includes("sslscan") || firstLines.includes("testssl")) return "sslscan"
    if (firstLines.includes("wfuzz")) return "ffuf"
    return null
  }

  // ── Multi-select handlers ─────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === findings.length) return new Set()
      return new Set(findings.map(f => f.id))
    })
  }, [findings])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const bulkApprove = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) { toast.error("No findings selected"); return }
    setBulkProcessing(true)
    try {
      const enrichments: Record<string, any> = {}
      for (const id of ids) {
        if (aiEnrichments[id]) enrichments[id] = aiEnrichments[id]
      }
      const res = await fetch("/api/scan-findings/bulk-approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, enrichments: Object.keys(enrichments).length > 0 ? enrichments : undefined }),
      })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Bulk approve failed"); return }
      toast.success(`Approved ${ids.length} findings`)
      setFindings(prev => prev.map(f => selectedIds.has(f.id) ? { ...f, is_auto_created: true, vuln_id: f.id, status: "approved" } : f))
      setSelectedIds(new Set())
    } catch { toast.error("Failed to bulk approve") }
    finally { setBulkProcessing(false) }
  }, [selectedIds, aiEnrichments])

  const bulkReject = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) { toast.error("No findings selected"); return }
    setBulkProcessing(true)
    try {
      const res = await fetch("/api/scan-findings/bulk-reject", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reason: "Rejected by analyst" }),
      })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Bulk reject failed"); return }
      toast.success(`Rejected ${ids.length} findings`)
      setFindings(prev => prev.map(f => selectedIds.has(f.id) ? { ...f, status: "rejected" } : f))
      setSelectedIds(new Set())
    } catch { toast.error("Failed to bulk reject") }
    finally { setBulkProcessing(false) }
  }, [selectedIds])

  const openMergeDialog = useCallback(() => {
    if (selectedIds.size < 2) { toast.error("Select at least 2 findings to merge"); return }
    const selected = findings.filter(f => selectedIds.has(f.id))
    const worst = selected.reduce((worst, f) => {
      const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, informational: 0 }
      return (order[f.severity || ""] || 0) > (order[worst] || 0) ? f.severity : worst
    }, "medium" as string)
    setMergeTitle(selected.map(f => f.title).filter(Boolean).join(" / ") || "Merged finding")
    setMergeSeverity(worst)
    setMergeDescription("")
    setMergeDialogOpen(true)
  }, [selectedIds, findings])

  const handleMerge = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length < 2) return
    if (!mergeTitle.trim()) { toast.error("Enter a title for the merged finding"); return }
    setMerging(true)
    try {
      const res = await fetch("/api/scan-findings/merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids,
          title: mergeTitle.trim(),
          severity: mergeSeverity || undefined,
          description: mergeDescription.trim() || undefined,
        }),
      })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Merge failed"); return }
      toast.success(`Merged ${ids.length} findings into one vulnerability`)
      setFindings(prev => prev.filter(f => !selectedIds.has(f.id)))
      setFindingsCount(c => Math.max(0, c - ids.length))
      setSelectedIds(new Set())
      setMergeDialogOpen(false)
    } catch { toast.error("Failed to merge findings") }
    finally { setMerging(false) }
  }, [selectedIds, mergeTitle, mergeSeverity, mergeDescription])

  // Restore active terminal session on page load
  useEffect(() => {
    fetch("/api/terminal/active")
      .then(r => r.json())
      .then(data => {
        if (data.active && data.session) {
          const s = data.session
          setSession({
            containerId: s.containerId,
            sessionId: s.sessionId,
            wsUrl: s.wsUrl.replace(/127\.0\.0\.1|localhost/gi, window.location.hostname),
            success: true,
          })
          lastSessionIdRef.current = s.sessionId
          setLastSessionId(s.sessionId)
          if (typeof window !== "undefined") sessionStorage.setItem("vaptshield-last-session-id", s.sessionId)
          startHeartbeat(s.containerId)
          // Restore timer from stored sessionStartedAt — don't reset to 0
          const stored = useTerminalStore.getState()
          if (stored.sessionStartedAt) {
            setActiveTime(Math.floor((Date.now() - stored.sessionStartedAt) / 1000))
          }
        }
      })
      .catch(() => {})
  }, [startHeartbeat])

  const startTerminal = useCallback(async () => {
    if (!selectedProject) {
      toast.error("Select a project", { description: "Choose a project before starting the terminal" })
      return
    }
    setStarting(true)
    setError(null)
    setIframeLoaded(false)
    try {
      const res = await fetch("/api/terminal/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: selectedProject }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409 && data.inUseBy) {
          setInUseDialog({ open: true, userName: data.inUseBy.full_name })
        } else {
          setError(data.error)
          toast.error("Failed to start", { description: data.error })
        }
        return
      }

      setSession({ ...data, wsUrl: data.wsUrl.replace(/127\.0\.0\.1|localhost/gi, window.location.hostname) })
      lastSessionIdRef.current = data.sessionId
      setLastSessionId(data.sessionId)
      if (typeof window !== "undefined") sessionStorage.setItem("vaptshield-last-session-id", data.sessionId)
      setActiveTime(0)
      setStoreSessionStartedAt(Date.now())
      startHeartbeat(data.containerId)
      toast.success("Terminal started")
    } catch {
      setError("Connection failed - make sure the worker is running")
    } finally {
      setStarting(false)
    }
  }, [selectedProject, startHeartbeat])

  const stopTerminal = useCallback(async () => {
    const currentSession = sessionRef.current
    if (!currentSession?.containerId) return
    setLoading(true)

    // Close any open SSE stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    // STEP 1: Parse log BEFORE stopping container (container must be alive for docker exec)
    if (currentSession.sessionId && selectedProject) {
      setParsing(true)
      try {
        const res = await fetch("/api/kali/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: currentSession.sessionId,
            project_id: selectedProject,
            auto_create_vulnerabilities: false,
          }),
        })
        const data = await res.json()
        console.log("[stopTerminal] API response:", { ok: res.ok, taskId: data.taskId, findingsCount: data.findings?.length, autoCreated: data.autoCreated, error: data.error })
        if (res.ok) {
          setKaliTaskId(data.taskId)
          if (data.findings?.length > 0) {
            console.log("[stopTerminal] Setting findings from API response:", data.findings.length, "items")
            // Backend returns ALL accumulated findings by session_id — just replace
            setFindings(data.findings.map((f: any) => ({
              id: f.id || f.alert_id,
              title: f.title || f.alert_name,
              severity: f.severity,
              description: f.description,
              url: f.url || null,
              tool: f.tool,
              raw_evidence: f.raw_evidence || null,
              evidence: f.evidence || null,
              solution: f.solution || null,
              reference: f.reference || null,
              cweid: f.cweid || null,
              attack: f.attack || null,
              param: f.param || null,
              other: f.other || null,
              riskcode: f.riskcode || null,
              vuln_id: f.vuln_id || null,
              alert_id: f.alert_id || null,
              status: f.status || 'pending',
              source: f.source || (data.autoCreated ? 'auto_created' : 'pending_alert'),
              is_auto_created: !!data.autoCreated,
            })))
            setFindingsCount(data.findings.length)
            toast.success(`${data.findings.length} findings`)
          } else {
            console.log("[stopTerminal] API returned 0 findings — trying DB fallback")
            // Even when worker returns 0 new findings, query existing ones from DB
            try {
              const accRes = await fetch(`/api/kali/scan/${currentSession.sessionId}/findings`, { signal: AbortSignal.timeout(5000) })
              if (accRes.ok) {
                const accData = await accRes.json()
                console.log("[stopTerminal] DB fallback found:", accData.findings?.length, "findings")
                if (accData.findings?.length > 0) {
                  setFindings(accData.findings.map((f: any) => ({ ...f, is_auto_created: true })))
                  setFindingsCount(accData.findings.length)
                  toast.success(`${accData.findings.length} findings persisted`)
                }
              } else {
                console.log("[stopTerminal] DB fallback fetch failed:", accRes.status)
              }
            } catch { console.log("[stopTerminal] DB fallback threw") /* silent fallback */ }
          }
        } else {
          console.log("[stopTerminal] API returned error:", data.error)
          throw new Error(data.error || `Parse failed (${res.status})`)
        }
      } catch (e) {
        console.log("[stopTerminal] catch block error:", e)
        setParseError(e instanceof Error ? e.message : String(e))
      } finally {
        setParsing(false)
      }
    }

      // Persist session ID for retry even after session is cleared
      lastSessionIdRef.current = currentSession.sessionId
      setLastSessionId(currentSession.sessionId)

      // STEP 2: THEN stop the container
      try {
        await fetch(`/api/terminal/stop/${currentSession.containerId}`, { method: "POST" })
      stopHeartbeat()
      setSession(null)
      setIframeLoaded(false)
      resetStoreSession()
      toast.success("Terminal stopped")
    } catch {
      toast.error("Failed to stop terminal")
    } finally {
      setLoading(false)
    }
  }, [stopHeartbeat, selectedProject])

  useEffect(() => {
    if (!session) return
    const startedAt = useTerminalStore.getState().sessionStartedAt
    if (!startedAt) return
    const updateTime = () => setActiveTime(Math.floor((Date.now() - startedAt) / 1000))
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [session])

  // Auto-hide loading overlay after 10s (prevent permanent buffer)
  useEffect(() => {
    if (!session || iframeLoaded) return
    const timer = setTimeout(() => setIframeLoaded(true), 10000)
    return () => clearTimeout(timer)
  }, [session, iframeLoaded])

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
  }

  return (
    <motion.div initial={{opacity:0, y:4}} animate={{opacity:1, y:0}} transition={{duration:0.15}} className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* In-use dialog */}
      <AlertDialog open={inUseDialog.open} onOpenChange={(open) => setInUseDialog({ ...inUseDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserX className="w-5 h-5 text-severity-high" />
              Terminal Already in Use
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              <span className="font-medium text-fg">{inUseDialog.userName}</span> is currently using the Kali
              terminal. Your organization can only run one terminal session at a time.
              <br /><br />
              Please wait until the current session ends, or ask {inUseDialog.userName.split(" ")[0]} to close
              the terminal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* ── Premium Top Bar ── */}
      <div className="bg-bg/80 backdrop-blur-xl border border-border shadow-sm rounded-2xl p-4 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 transition-all hover:border-border/80 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shadow-inner relative overflow-hidden shrink-0">
            <Terminal className="w-6 h-6 text-primary relative z-10" />
            <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-fg flex items-center gap-2">
              Kali Terminal Engine
              {session && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                </span>
              )}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-fg-muted font-medium">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${session ? "bg-success shadow-[0_0_5px_rgba(var(--success),0.5)]" : starting ? "bg-primary animate-pulse shadow-[0_0_5px_rgba(var(--primary),0.5)]" : "bg-fg-disabled"}`} />
                {session ? "ACTIVE" : starting ? "CONNECTING..." : "IDLE"}
              </span>
              <span className="w-px h-3 bg-border hidden sm:block" />
              <span className="font-mono">UPTIME: {session ? formatTime(activeTime) : "00:00:00"}</span>
              <span className="w-px h-3 bg-border hidden sm:block" />
              <span className="font-mono flex items-center gap-1">
                PROJECT: <span className={selectedProject ? "text-primary" : "text-fg-subtle"}>{projects.find(p => p.id === selectedProject)?.name || "NONE"}</span>
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full xl:w-auto relative z-10">
          <DockerQuotaBadge />
          <div className="h-8 w-px bg-border mx-1 hidden sm:block" />
          {canScan && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {!session && (
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="w-full sm:w-[220px] h-9 bg-bg/50 backdrop-blur-sm border-border/60 hover:border-border transition-colors text-sm rounded-lg shadow-sm">
                    <SelectValue placeholder="Select target project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {!session ? (
                <Button 
                  onClick={startTerminal} 
                  disabled={starting || !selectedProject}
                  className="h-9 px-5 rounded-lg bg-primary text-white shadow-[0_0_15px_rgba(var(--primary),0.2)] hover:shadow-[0_0_25px_rgba(var(--primary),0.4)] transition-all font-semibold tracking-wide w-full sm:w-auto"
                >
                  {starting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> DEPLOYING KALI...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> LAUNCH TERMINAL</>
                  )}
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Button 
                    variant="outline" 
                    onClick={() => parseTerminalOutput()} 
                    disabled={parsing} 
                    className="h-9 px-4 rounded-lg border-primary/30 text-primary hover:bg-primary/10 shadow-sm transition-all font-semibold tracking-wide flex-1 sm:flex-none"
                  >
                    {parsing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> PARSING...</>
                    ) : (
                      <><FileScan className="w-4 h-4 mr-2" /> PARSE OUTPUT</>
                    )}
                  </Button>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          onClick={() => setAiParseDialogOpen(true)}
                          disabled={aiParsing || !lastSessionIdRef.current}
                          className="h-9 px-4 rounded-lg text-fg-muted hover:text-indigo-400 hover:bg-indigo-400/10 transition-all font-semibold tracking-wide flex-1 sm:flex-none"
                        >
                          {aiParsing ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI PARSING...</>
                          ) : (
                            <><Sparkles className="w-4 h-4 mr-2" /> AI PARSE</>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-64 text-xs font-medium">
                        AI-powered fallback: extracts findings when regex fails.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Button 
                    variant="destructive" 
                    onClick={stopTerminal} 
                    disabled={loading}
                    className="h-9 px-4 rounded-lg shadow-sm hover:shadow-md transition-all font-semibold tracking-wide flex-1 sm:flex-none"
                  >
                    <Square className="w-4 h-4 mr-2" /> STOP SESSION
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Sidebar */}
        <div className="xl:w-[260px] shrink-0 bg-bg/60 backdrop-blur-sm border border-border/60 shadow-sm rounded-xl overflow-hidden flex flex-col h-[600px] transition-all hover:border-border/80">
          <div className="px-4 py-3 border-b border-border/60 bg-bg-muted/50">
            <span className="text-xs font-bold text-fg-subtle uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              Tool Arsenal
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-5 custom-scrollbar">
            {KALI_TOOLS.map(category => (
              <div key={category.category}>
                <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 px-1 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-primary" />
                  {category.category}
                </h3>
                <div className="space-y-1">
                  {category.tools.map(tool => (
                    <TooltipProvider key={tool.name} delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(tool.exampleCommand);
                              toast.success(`Copied: ${tool.exampleCommand}`);
                            }}
                            className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-panel transition-all group border border-transparent hover:border-border/50 hover:shadow-sm"
                          >
                            <Terminal className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                            <div className="min-w-0">
                              <div className="font-mono text-xs font-semibold text-fg group-hover:text-primary transition-colors truncate tracking-tight">
                                {tool.name}
                              </div>
                              <div className="text-[10px] text-fg-muted truncate mt-0.5">
                                {tool.shortDesc}
                              </div>
                            </div>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs space-y-2 p-3 bg-panel border-border shadow-xl rounded-xl z-[100]">
                          <p className="text-sm font-bold text-fg">{tool.name}</p>
                          <p className="text-xs text-fg-muted leading-relaxed">{tool.fullDesc}</p>
                          <div 
                            className="pt-2 border-t border-border mt-2 cursor-pointer group/copy hover:bg-bg-muted/50 -mx-1 px-1 rounded-md transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(tool.exampleCommand);
                              toast.success(`Copied: ${tool.exampleCommand}`);
                            }}
                          >
                            <p className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-1.5 group-hover/copy:text-primary transition-colors">Example Command</p>
                            <code className="text-xs font-mono bg-bg-muted px-2 py-1.5 rounded-md text-primary block break-all border border-border/50 group-hover/copy:border-primary/50 transition-colors">
                              {tool.exampleCommand}
                            </code>
                            <p className="text-[10px] text-fg-subtle mt-2 flex items-center gap-1 italic group-hover/copy:text-primary transition-colors">
                              <Copy className="w-3 h-3" /> Click to copy to clipboard
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Terminal Area */}
        <div className="flex-1 rounded-xl border border-border/60 shadow-sm overflow-hidden bg-[#050505] relative h-[600px] transition-all hover:border-border/80">
          <AnimatePresence mode="wait">
            {session && !iframeLoaded && (
              <motion.div key="loading" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.3}} className="absolute inset-0 flex flex-col items-center justify-center bg-[#050505] z-10">
                <div className="relative w-24 h-24 mb-8">
                  <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Terminal className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-fg mb-6 tracking-tight">Initializing Secure Environment...</h3>
                <div className="max-w-xs w-full space-y-4 font-mono text-xs">
                  <div className="flex items-center justify-between text-sm">
                    <span className={loadingStep >= 1 ? "text-fg" : "text-fg-subtle"}>[1] Spawning container</span>
                    {loadingStep >= 1 && <span className="text-success font-bold">[OK]</span>}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className={loadingStep >= 2 ? "text-fg" : "text-fg-subtle"}>[2] Booting TTY daemon</span>
                    {loadingStep >= 2 && <span className="text-success font-bold">[OK]</span>}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className={loadingStep >= 3 ? "text-fg" : "text-fg-subtle"}>[3] Establishing secure link</span>
                    {loadingStep >= 3 && <span className="text-success font-bold">[OK]</span>}
                  </div>
                </div>
              </motion.div>
            )}
            {!session && !selectedProject && (
              <motion.div key="noproject" initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} exit={{opacity:0}} transition={{duration:0.3}} className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg-muted/10 text-fg-muted">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-bg-muted to-bg-subtle flex items-center justify-center shadow-inner border border-border/50">
                  <FolderKanban className="w-10 h-10 text-fg-disabled drop-shadow-md" />
                </div>
                <h3 className="text-lg font-bold text-fg tracking-tight">Target Selection Required</h3>
                <p className="text-sm max-w-sm text-center leading-relaxed">
                  Please select a project from the top bar to provision an isolated security testing environment.
                </p>
              </motion.div>
            )}
            {!session && selectedProject && (
              <motion.div key="idle" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} transition={{duration:0.3}} className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg-muted/10 text-fg-muted">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-inner border border-primary/20">
                  <Terminal className="w-10 h-10 text-primary drop-shadow-md" />
                </div>
                <h3 className="text-lg font-bold text-fg tracking-tight">System Ready For Deployment</h3>
                <p className="text-sm max-w-sm text-center leading-relaxed mb-4">
                  Click Launch Terminal to deploy a fully isolated Kali Linux container. Session auto-expires after 2 hours.
                </p>
                <div className="flex gap-6 text-xs text-fg-subtle font-medium">
                  <div className="flex flex-col items-center gap-2 bg-panel px-4 py-2 rounded-lg border border-border/50"><Check className="w-4 h-4 text-success" /> Pre-loaded Tools</div>
                  <div className="flex flex-col items-center gap-2 bg-panel px-4 py-2 rounded-lg border border-border/50"><Check className="w-4 h-4 text-success" /> Isolated Network</div>
                  <div className="flex flex-col items-center gap-2 bg-panel px-4 py-2 rounded-lg border border-border/50"><Check className="w-4 h-4 text-success" /> Auto-Cleanup</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {session && (
            <iframe
              key={session.wsUrl}
              ref={iframeRef}
              src={session.wsUrl}
              className="w-full h-full relative z-0"
              title="Kali Terminal"
              onLoad={() => setIframeLoaded(true)}
            />
          )}
        </div>
      </div>



      {/* ── Findings Panel (Premium ZAP-style Table Grid) ── */}
      <div className="bg-bg/60 backdrop-blur-sm border border-border shadow-sm rounded-xl overflow-hidden mt-6 transition-all hover:border-border/80">
        <div className="px-6 py-4 border-b border-border bg-bg-muted/30 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-fg tracking-tight">Security Findings</h2>
              {parsing && (
                <div className="flex items-center gap-1.5 text-xs text-primary font-medium ml-2 px-2 py-0.5 rounded-full bg-primary/10">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  ANALYZING...
                </div>
              )}
              {findings.length > 0 && !parsing && (
                <motion.div key={findingsCount} initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} transition={{duration:0.2}}>
                  <Badge variant="outline" className="text-xs font-mono ml-2 bg-primary/5 text-primary border-primary/20">
                    {findingsCount} DISCOVERED
                  </Badge>
                </motion.div>
              )}
            </div>
            <p className="text-xs text-fg-muted font-medium">Terminal session vulnerabilities & exposures</p>
          </div>

          {findings.length > 0 && (() => {
            const counts = severityCounts(findings)
            const data = [
              { name: 'Critical', value: counts.critical, fill: 'var(--severity-critical)' },
              { name: 'High', value: counts.high, fill: 'var(--severity-high)' },
              { name: 'Medium', value: counts.medium, fill: 'var(--severity-medium)' },
              { name: 'Low', value: counts.low, fill: 'var(--severity-low)' },
              { name: 'Info', value: counts.informational, fill: 'var(--severity-info)' }
            ].filter(d => d.value > 0)
            
            return (
              <div className="hidden md:flex items-center gap-6 bg-bg/50 px-4 py-2 rounded-lg border border-border/50">
                <div className="flex items-center gap-4 text-xs font-mono font-bold tracking-wider">
                  {counts.critical > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-severity-critical animate-pulse" /><span className="text-severity-critical">{counts.critical} CRIT</span></span>}
                  {counts.high > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-severity-high" /><span className="text-severity-high">{counts.high} HIGH</span></span>}
                  {counts.medium > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-severity-medium" /><span className="text-severity-medium">{counts.medium} MED</span></span>}
                  {counts.low > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-severity-low" /><span className="text-severity-low">{counts.low} LOW</span></span>}
                  {counts.informational > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-severity-info" /><span className="text-severity-info">{counts.informational} INFO</span></span>}
                </div>
                <div className="w-[50px] h-[50px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data}
                        innerRadius={15}
                        outerRadius={22}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })()}
        </div>
        <div className="p-0">
            {parseError && (
              <div className="flex items-center gap-2 px-4 py-2 bg-severity-critical-bg border-b border-severity-critical-border text-severity-critical text-xs">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {parseError}
                <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => parseTerminalOutput()}>
                  Retry
                </Button>
              </div>
            )}
            {parsing && findings.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-2 text-fg-muted">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <p className="text-xs">Analyzing terminal output for findings...</p>
                </div>
              </div>
            )}
            {!parsing && findings.length === 0 && !parseError && (
              <div className="px-4 py-8 text-center">
                <Scan className="w-6 h-6 text-fg-disabled mx-auto mb-2" />
                <p className="text-xs text-fg-muted">
                  {mounted && lastSessionId
                    ? "No findings detected in terminal output. Run a tool like nmap or nuclei, stop the terminal, then retry."
                    : "No findings yet. Start a terminal, run security tools, then stop to auto-parse output."}
                </p>
                {mounted && lastSessionId && (
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => parseTerminalOutput()} disabled={parsing}>
                      {parsing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Scan className="w-3 h-3 mr-1" />}
                      Re-parse Output
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-fg-muted hover:text-primary"
                      onClick={() => setAiParseDialogOpen(true)}
                      disabled={aiParsing}
                    >
                      {aiParsing ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3 mr-1" />
                      )}
                      AI Parse (beta)
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Multi-select Toolbar ── */}
            {selectedIds.size > 0 && findings.length > 0 && (() => {
              const hasPending = findings.some(f => selectedIds.has(f.id) && !f.is_auto_created)
              return (
              <div className="flex items-center gap-2 px-4 py-2 bg-primary-subtle border-b border-border">
                <Badge variant="outline" className="text-xs font-mono bg-panel">
                  {selectedIds.size} selected
                </Badge>
                <div className="flex gap-1.5 ml-2">
                  {hasPending && (
                    <>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={bulkApprove}
                              disabled={bulkProcessing}
                            >
                              {bulkProcessing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1 text-success" />}
                              Approve
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Approve all selected findings</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={bulkReject}
                              disabled={bulkProcessing}
                            >
                              {bulkProcessing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />}
                              Reject
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reject all selected findings</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={openMergeDialog}
                          disabled={selectedIds.size < 2}
                        >
                          <GitMerge className="w-3 h-3 mr-1" />
                          Merge
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Merge selected into one finding ({selectedIds.size < 2 ? "need 2+" : `${selectedIds.size} selected`})</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-severity-critical border-severity-critical/30 hover:bg-severity-critical/10"
                          onClick={openBulkDeleteConfirm}
                          disabled={bulkProcessing}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete all selected findings</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={clearSelection}>
                    Clear
                  </Button>
              </div>
            )})()}

            {/* ── Findings Table ── */}
            {findings.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-bg-subtle border-b border-border">
                      <th className="py-2.5 pl-4 pr-2 w-10">
                        <Checkbox
                          checked={selectedIds.size === findings.length && findings.length > 0}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="py-2.5 px-3 text-xs font-medium text-fg-muted uppercase tracking-wide text-left w-20">SEV</th>
                      <th className="py-2.5 px-3 text-xs font-medium text-fg-muted uppercase tracking-wide text-left">Finding</th>
                      <th className="py-2.5 px-3 text-xs font-medium text-fg-muted uppercase tracking-wide text-left hidden sm:table-cell">Target</th>
                      <th className="py-2.5 px-3 text-xs font-medium text-fg-muted uppercase tracking-wide text-left w-24 hidden md:table-cell">Tool</th>
                      <th className="py-2.5 pr-4 pl-2 w-20 text-right">Actions</th>
                    </tr>
                  </thead>
                  <motion.tbody className="divide-y divide-border" initial="hidden" animate="show" variants={{hidden:{opacity:0},show:{opacity:1,transition:{staggerChildren:0.03}}}}>
                    {findings.map((f) => {
                      const toolName = f.tool || f.raw_data?.tool || f.raw_data?.template_id || f.source || (f.raw_data && typeof f.raw_data === "object" ? (f.raw_data as Record<string, unknown>)["nuclei-template"] as string : null) || "terminal"
                      return (
                        <motion.tr
                          key={f.id}
                          variants={{hidden:{opacity:0,y:4},show:{opacity:1,y:0,transition:{duration:0.15}}}}
                          className={`hover:bg-panel-hover transition-colors ${selectedIds.has(f.id) ? "bg-primary-subtle/40" : ""}`}
                        >
                          <td className="py-2.5 pl-4 pr-2">
                            <Checkbox
                              checked={selectedIds.has(f.id)}
                              onCheckedChange={() => toggleSelect(f.id)}
                              aria-label={`Select ${f.title || "finding"}`}
                            />
                          </td>
                          {/* Severity */}
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${sevColor(f.severity || "informational")}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                f.severity === "critical" ? "bg-severity-critical" :
                                f.severity === "high" ? "bg-severity-high" :
                                f.severity === "medium" ? "bg-severity-medium" :
                                f.severity === "low" ? "bg-severity-low" : "bg-severity-info"
                              }`} />
                              {(f.severity || "info").substring(0, 3).toUpperCase()}
                            </span>
                          </td>
                          {/* Finding name + description */}
                          <td className="py-2.5 px-3 min-w-0 max-w-[300px]">
                            <div className="flex items-center gap-2">
                              <button
                                className="text-sm font-medium truncate block hover:text-primary transition-colors"
                                onClick={() => setSelectedFinding(f)}
                                title={f.title || "Untitled finding"}
                              >
                                {f.title || "Untitled finding"}
                              </button>
                              {f.is_auto_created && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-success-bg text-success border border-success/30">
                                  <CheckCircle className="w-2.5 h-2.5" />
                                  Saved
                                </span>
                              )}
                              {f.status === "rejected" && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-danger-bg text-danger border border-danger/30">
                                  <XCircle className="w-2.5 h-2.5" />
                                  Rejected
                                </span>
                              )}

                              {aiEnrichments[f.id] && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-subtle text-primary border border-primary/30">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  AI Enriched
                                </span>
                              )}
                              
                              {/* Source Badge */}
                              {f.source === "ai-parse" && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/30">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  AI Parse
                                </span>
                              )}
                              {f.source === "clipboard-import" && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-500 border border-blue-500/30">
                                  <Copy className="w-2.5 h-2.5" />
                                  Import
                                </span>
                              )}
                              {(f.source === "kali-scan" || f.source === "terminal-scan") && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-500 border border-green-500/30">
                                  <Terminal className="w-2.5 h-2.5" />
                                  Live Scan
                                </span>
                              )}
                            </div>
                            {f.description && (
                              <p className="text-xs text-fg-muted truncate mt-0.5">{f.description}</p>
                            )}
                          </td>
                          {/* Target URL */}
                          <td className="py-2.5 px-3 hidden sm:table-cell">
                            {f.url ? (
                              <span className="text-xs font-mono text-fg-subtle truncate block max-w-[200px]" title={f.url}>
                                {f.url}
                              </span>
                            ) : (
                              <span className="text-xs text-fg-disabled">—</span>
                            )}
                          </td>
                          {/* Tool */}
                          <td className="py-2.5 px-3 hidden md:table-cell">
                            <span className="text-xs font-mono text-fg-muted">{toolName}</span>
                          </td>
                          {/* Actions */}
                          <td className="py-2.5 pr-4 pl-2">
                            <div className="flex items-center justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      onClick={() => setSelectedFinding(f)}
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View details</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {!f.is_auto_created && !aiEnrichments[f.id] && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-primary"
                                        onClick={() => handleAiVerify(f)}
                                        disabled={verifyingIds.has(f.id)}
                                      >
                                        {verifyingIds.has(f.id) ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Sparkles className="w-3.5 h-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {verifyingIds.has(f.id) ? "Verifying with AI..." : "AI Verify"}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {aiEnrichments[f.id] && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-success"
                                      >
                                        <Sparkles className="w-3.5 h-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>AI enriched — CVSS: {aiEnrichments[f.id]?.cvss_score || "?"}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {f.is_auto_created ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-primary"
                                        onClick={() => window.open(`/findings/${f.vuln_id}`, "_blank")}
                                      >
                                        <CheckCircle className="w-3.5 h-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>View in Findings</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : f.status === "rejected" ? (
                                <span className="text-xs text-fg-disabled italic px-2">Rejected</span>
                              ) : (
                                <>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-success"
                                          onClick={() => handleApprove(f.id)}
                                        >
                                          <CheckCircle className="w-3.5 h-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Review & Approve</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-fg-muted"
                                          onClick={() => handleReject(f.id)}
                                        >
                                          <XCircle className="w-3.5 h-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Reject</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              )}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-fg-muted hover:text-severity-critical"
                                      onClick={() => openDeleteConfirm(f)}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete this finding</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem onClick={() => setSelectedFinding(f)}>
                                    <Eye className="w-3.5 h-3.5 mr-2" /> View Details
                                  </DropdownMenuItem>
                                  {!f.is_auto_created && f.status !== "rejected" && (
                                    <>
                                      <DropdownMenuSeparator />
                                      {!aiEnrichments[f.id] && (
                                        <DropdownMenuItem
                                          onClick={() => handleAiVerify(f)}
                                          disabled={verifyingIds.has(f.id)}
                                        >
                                          {verifyingIds.has(f.id) ? (
                                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin text-primary" />
                                          ) : (
                                            <Sparkles className="w-3.5 h-3.5 mr-2 text-primary" />
                                          )}
                                          AI Verify
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem onClick={() => handleApprove(f.id)}>
                                        <CheckCircle className="w-3.5 h-3.5 mr-2 text-success" /> Review & Approve
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleReject(f.id)}>
                                        <XCircle className="w-3.5 h-3.5 mr-2" /> Reject
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-severity-critical"
                                    onClick={() => openDeleteConfirm(f)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </motion.tr>
                      )
                    })}
                  </motion.tbody>
                </table>
              </div>
            )}
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
                description: aiEnrichments[selectedFinding.id]?.description || selectedFinding.description || null,
                url: selectedFinding.url || null,
                raw_data: selectedFinding.raw_data || null,
                status: selectedFinding.status || "pending",
                evidence: selectedFinding.evidence || null,
                solution: aiEnrichments[selectedFinding.id]?.remediation || selectedFinding.solution || null,
                reference: (aiEnrichments[selectedFinding.id]?.reference_links?.join("\n")) || selectedFinding.reference || null,
                cweid: aiEnrichments[selectedFinding.id]?.cwe_id ? parseInt(aiEnrichments[selectedFinding.id].cwe_id.replace("CWE-", "")) : (selectedFinding.cweid ? Number(selectedFinding.cweid) : null),
                confidence: null,
                attack: selectedFinding.attack || null,
                param: selectedFinding.param || null,
                other: aiEnrichments[selectedFinding.id]?.impact || selectedFinding.other || null,
                wascid: null,
                riskcode: selectedFinding.riskcode ? Number(selectedFinding.riskcode) : null,
              }}
              enrichment={aiEnrichments[selectedFinding.id] || null}
              onApprove={handleApprove}
              onReject={handleReject}
              onAiVerify={() => handleAiVerify(selectedFinding)}
              verifying={verifyingIds.has(selectedFinding.id)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Merge Dialog ── */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="w-4 h-4" /> Merge Findings
            </DialogTitle>
            <DialogDescription>
              Merge {selectedIds.size} findings into one vulnerability. The individual findings will be approved and linked to the merged record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="merge-title">Merged Finding Title</Label>
              <Input
                id="merge-title"
                value={mergeTitle}
                onChange={(e) => setMergeTitle(e.target.value)}
                placeholder="Combined finding title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merge-severity">Severity</Label>
              <Select value={mergeSeverity} onValueChange={setMergeSeverity}>
                <SelectTrigger id="merge-severity">
                  <SelectValue placeholder="Auto-detect worst" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="informational">Informational</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="merge-desc">Additional Description (optional)</Label>
              <Textarea
                id="merge-desc"
                value={mergeDescription}
                onChange={(e) => setMergeDescription(e.target.value)}
                placeholder="Additional context for the merged finding..."
                className="min-h-[80px]"
              />
            </div>
            <div className="p-3 rounded bg-bg-muted border border-border">
              <p className="text-xs font-medium text-fg-muted mb-2">Findings to merge:</p>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                {findings.filter(f => selectedIds.has(f.id)).map(f => (
                  <div key={f.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      f.severity === "critical" ? "bg-severity-critical" :
                      f.severity === "high" ? "bg-severity-high" :
                      f.severity === "medium" ? "bg-severity-medium" :
                      f.severity === "low" ? "bg-severity-low" : "bg-severity-info"
                    }`} />
                    <span className="font-mono truncate">{f.title || "Untitled"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="secondary" size="sm">Cancel</Button>
            </DialogClose>
            <Button onClick={handleMerge} disabled={merging || !mergeTitle.trim()} size="sm">
              {merging ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Merging...</>
              ) : (
                <><GitMerge className="w-4 h-4 mr-2" /> Merge & Approve</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FindingForm for Kali terminal findings */}
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
          return {
            title: findingFormAlert.title || "Kali Terminal Finding",
            description: findingFormAlert.description || undefined,
            severity: sev as "critical" | "high" | "medium" | "low" | "informational",
            project_id: selectedProject,
            endpoint_url: findingFormAlert.url || undefined,
            cvss_score: cvssScore,
            affected_component: findingFormAlert.param || findingFormAlert.url || undefined,
            proof_of_concept: findingFormAlert.evidence || undefined,
            impact: findingFormAlert.other || (rawData as any).impact || undefined,
            remediation: findingFormAlert.solution || (rawData as any).remediation || undefined,
            reference_links: refs.length > 0 ? refs : undefined,
          } as InitialFindingData
        })()}
        onSuccess={() => {}}
        onSuccessWithId={handleFindingFormSuccess}
      />



      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Session Info</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center"><span className="text-fg-muted">Status</span><Badge variant="outline">{session ? "Running" : "Idle"}</Badge></div>
            
            <div className="flex justify-between items-center">
              <span className="text-fg-muted">Container ID</span>
              {session?.containerId ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{session.containerId.substring(0, 12)}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-fg-subtle hover:text-fg" onClick={() => {
                    navigator.clipboard.writeText(session.containerId);
                    toast.success("Copied container ID");
                  }}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              ) : <span className="text-fg-muted italic">None</span>}
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-fg-muted">Started At</span>
              <span className="font-mono text-xs">
                {session && storeSessionStartedAt ? new Date(storeSessionStartedAt).toLocaleTimeString() : "—"}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-fg-muted">Time Remaining</span>
              {session ? (
                <span className={`font-mono text-xs font-medium ${
                  14400 - activeTime > 7200 ? "text-success" : 14400 - activeTime > 1800 ? "text-severity-warning" : "text-severity-critical"
                }`}>
                  {formatTime(Math.max(0, 14400 - activeTime))}
                </span>
              ) : <span className="text-fg-muted italic">—</span>}
            </div>

            {session && (
              <div className="pt-2 mt-2 border-t border-border flex justify-end">
                <Button variant="ghost" size="sm" onClick={stopTerminal} disabled={loading} className="h-8">
                  <Square className="w-3.5 h-3.5 mr-2" /> Stop
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={(open) => { if (!open) { setIsBulkDelete(false) }; setDeleteConfirmOpen(open) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-severity-critical" />
              {isBulkDelete ? `Delete ${selectedIds.size} Findings` : "Delete Finding"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {isBulkDelete ? (
                <>
                  Are you sure you want to delete{" "}
                  <span className="font-medium text-fg">{selectedIds.size} selected findings</span>?
                  <span className="block mt-2 text-severity-warning">
                    This action cannot be undone. Each finding will be permanently removed.
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to delete{" "}
                  <span className="font-medium text-fg">"{deleteTarget?.title || "this finding"}"</span>?
                  {deleteTarget?.is_auto_created ? (
                    <span className="block mt-2 text-severity-warning">
                      This will permanently remove the vulnerability from the project.
                    </span>
                  ) : (
                    <span className="block mt-2 text-severity-warning">
                      This will permanently remove this pending finding. This action cannot be undone.
                    </span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-severity-critical text-white hover:opacity-90"
              onClick={isBulkDelete ? handleBulkDelete : handleDelete}
            >
              {deleting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> {isBulkDelete ? `Delete ${selectedIds.size}` : "Delete"}</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── AI Parse Warning Dialog ── */}
      <AlertDialog open={aiParseDialogOpen} onOpenChange={setAiParseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI-Powered Parse (Beta)
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <div className="text-sm font-medium text-severity-warning flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Your terminal output will be sent to an external AI service (Groq)
              </div>
              <ul className="text-xs text-fg-muted space-y-2 list-disc pl-4">
                <li>The raw terminal output is sent to Groq API for analysis</li>
                <li>Data is <strong>not stored</strong> on AI provider servers</li>
                <li>Results are returned to you for review — nothing is auto-created</li>
                <li>Only use this for non-confidential targets</li>
                <li>The AI may occasionally miss findings or produce false positives</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aiParsing}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={aiParsing} onClick={handleAiParse}>
              {aiParsing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                <>Continue with AI Parse</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
