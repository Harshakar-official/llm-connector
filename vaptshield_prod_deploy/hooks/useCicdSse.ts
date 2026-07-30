"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

export interface PipelineStage {
  id: string
  label: string
  icon: React.ReactNode
  status: "pending" | "running" | "passed" | "failed" | "skipped" | "warning"
  duration?: string
}

export interface ToolStatus {
  status: "idle" | "running" | "passed" | "failed"
  label: string
  count: number
}

export interface ToolStatusMap {
  semgrep: ToolStatus
  trivy: ToolStatus
  gitleaks: ToolStatus
}

export interface StreamProgress {
  findings_found: number
  completed_phases: number
  total_phases: number
}

export interface UseCicdSseOptions {
  CICD_STAGES: Omit<PipelineStage, "status" | "duration">[]
}

export interface UseCicdSseReturn {
  // Stream state
  activeScanId: string | null
  activeRepoName: string
  streamLogs: { line: string; index: number }[]
  streamStatus: "idle" | "running" | "completed" | "failed" | "cancelled"
  streamFindings: any[]
  streamToolBreakdown: Record<string, number>
  streamProgress: StreamProgress
  streamError: string | null
  pipelineStages: PipelineStage[]
  logExpanded: boolean
  logCollapsed: boolean
  toolCardsStatus: ToolStatusMap
  scanResult: "passed" | "failed" | null
  scanStartTime: number | null
  scanElapsed: number
  sseConnectedRef: React.MutableRefObject<string | null>

  // Actions
  setActiveScanId: (id: string | null) => void
  setActiveRepoName: (name: string) => void
  setLogExpanded: (v: boolean) => void
  setLogCollapsed: (v: boolean) => void
  connectSse: (scanId: string) => void
  disconnectSse: () => void
  setStreamFindings: React.Dispatch<React.SetStateAction<any[]>>
}

export function useCicdSse({ CICD_STAGES }: UseCicdSseOptions): UseCicdSseReturn {
  const [activeScanId, setActiveScanId] = useState<string | null>(null)
  const [activeRepoName, setActiveRepoName] = useState<string>("")
  const [streamLogs, setStreamLogs] = useState<{ line: string; index: number }[]>([])
  const [streamStatus, setStreamStatus] = useState<"idle" | "running" | "completed" | "failed" | "cancelled">("idle")
  const [streamFindings, setStreamFindings] = useState<any[]>([])
  const [streamToolBreakdown, setStreamToolBreakdown] = useState<Record<string, number>>({})
  const [streamProgress, setStreamProgress] = useState<StreamProgress>({ findings_found: 0, completed_phases: 0, total_phases: 4 })
  const [streamError, setStreamError] = useState<string | null>(null)
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>(
    CICD_STAGES.map(s => ({ ...s, status: "pending" as const }))
  )
  const [logExpanded, setLogExpanded] = useState(true)
  const [logCollapsed, setLogCollapsed] = useState(false)
  const [scanStartTime, setScanStartTime] = useState<number | null>(null)
  const [scanElapsed, setScanElapsed] = useState(0)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Scan duration timer
  useEffect(() => {
    if (streamStatus === "running" && scanStartTime) {
      setScanElapsed(Math.floor((Date.now() - scanStartTime) / 1000))
      elapsedTimerRef.current = setInterval(() => {
        setScanElapsed(Math.floor((Date.now() - scanStartTime) / 1000))
      }, 1000)
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current)
        elapsedTimerRef.current = null
      }
    }
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current)
        elapsedTimerRef.current = null
      }
    }
  }, [streamStatus, scanStartTime])
  const [toolCardsStatus, setToolCardsStatus] = useState<ToolStatusMap>({
    semgrep: { status: "idle", label: "Ready", count: 0 },
    trivy: { status: "idle", label: "Ready", count: 0 },
    gitleaks: { status: "idle", label: "Ready", count: 0 },
  })
  const [scanResult, setScanResult] = useState<"passed" | "failed" | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const sseConnectedRef = useRef<string | null>(null)
  const lastLogLenRef = useRef(0)
  const recentLogsRef = useRef<string[]>([])

  const connectSse = useCallback((scanId: string) => {
    if (sseConnectedRef.current === scanId) return
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    sseConnectedRef.current = scanId
    setActiveScanId(scanId)
    setScanStartTime(Date.now())
    setScanElapsed(0)
    setStreamLogs([])
    setStreamFindings([])
    setStreamStatus("running")
    setStreamError(null)
    setStreamToolBreakdown({})
    setStreamProgress({ findings_found: 0, completed_phases: 0, total_phases: 4 })
    setPipelineStages(CICD_STAGES.map(s => ({ ...s, status: "pending" as const })))
    lastLogLenRef.current = 0
    recentLogsRef.current = []
    setLogExpanded(true)
    setLogCollapsed(false)
    setToolCardsStatus({
      semgrep: { status: "idle", label: "Ready", count: 0 },
      trivy: { status: "idle", label: "Ready", count: 0 },
      gitleaks: { status: "idle", label: "Ready", count: 0 },
    })
    setScanResult(null)

    const es = new EventSource(`/api/scan/cicd/${scanId}/stream`)
    eventSourceRef.current = es

    // Try to find the repo name from the scan ID if not provided
    if (!activeRepoName) {
      fetch(`/api/scans?scan_id=${scanId}`)
        .then(r => r.json())
        .then(data => {
          if (data.scans?.length > 0) {
            setActiveRepoName(data.scans[0].repo_name || data.scans[0].scan_target)
          }
        })
        .catch(() => {})
    }

      es.addEventListener("log", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          let line = typeof data.line === 'string' ? data.line : String(data.line ?? '')
          
          // Strip ANSI escape codes
          line = line.replace(/\x1B\[[0-9;]*[mK]/g, '').trimEnd()
          if (!line) return

          // Process internal phase markers to update UI stages
          const isPhaseLog = line.startsWith("__PHASE__:") || line.startsWith("=== ")
          
          if (line.includes("=== CLONE") || line.includes("__PHASE__:clone")) {
            if (!line.includes(":passed")) {
              setPipelineStages(prev => prev.map(s => s.id === "clone" ? { ...s, status: "running" as const } : s))
            }
          }
          if (line.includes("__PHASE__:clone:passed")) {
            setPipelineStages(prev => prev.map(s => s.id === "clone" ? { ...s, status: "passed" as const } : s))
          }
          
          if (line.includes("=== SEMGREP") || line.includes("__PHASE__:semgrep")) {
            if (!line.includes(":passed") && !line.includes(":warning")) {
              setPipelineStages(prev => prev.map(s => s.id === "semgrep" ? { ...s, status: "running" as const } : s))
              setToolCardsStatus(prev => ({ ...prev, semgrep: { ...prev.semgrep, status: "running" as const, label: "Scanning..." } }))
            }
          }
          if (line.includes("__PHASE__:semgrep:passed")) {
            setPipelineStages(prev => prev.map(s => s.id === "semgrep" ? { ...s, status: "passed" as const } : s))
          }
          if (line.includes("__PHASE__:semgrep:warning")) {
            setPipelineStages(prev => prev.map(s => s.id === "semgrep" ? { ...s, status: "warning" as const } : s))
          }

          if (line.includes("=== TRIVY") || line.includes("__PHASE__:trivy")) {
            if (!line.includes(":passed") && !line.includes(":warning")) {
              setPipelineStages(prev => prev.map(s => s.id === "trivy" ? { ...s, status: "running" as const } : s))
              setToolCardsStatus(prev => ({ ...prev, trivy: { ...prev.trivy, status: "running" as const, label: "Scanning..." } }))
            }
          }
          if (line.includes("__PHASE__:trivy:passed")) {
            setPipelineStages(prev => prev.map(s => s.id === "trivy" ? { ...s, status: "passed" as const } : s))
          }
          if (line.includes("__PHASE__:trivy:warning")) {
            setPipelineStages(prev => prev.map(s => s.id === "trivy" ? { ...s, status: "warning" as const } : s))
          }

          if (line.includes("=== GITLEAKS") || line.includes("__PHASE__:gitleaks")) {
            if (!line.includes(":passed") && !line.includes(":warning")) {
              setPipelineStages(prev => prev.map(s => s.id === "gitleaks" ? { ...s, status: "running" as const } : s))
              setToolCardsStatus(prev => ({ ...prev, gitleaks: { ...prev.gitleaks, status: "running" as const, label: "Scanning..." } }))
            }
          }
          if (line.includes("__PHASE__:gitleaks:passed")) {
            setPipelineStages(prev => prev.map(s => s.id === "gitleaks" ? { ...s, status: "passed" as const } : s))
          }
          if (line.includes("__PHASE__:gitleaks:warning")) {
            setPipelineStages(prev => prev.map(s => s.id === "gitleaks" ? { ...s, status: "warning" as const } : s))
          }
          if (line.includes("__PHASE__:complete")) {
            setPipelineStages(prev => prev.map(s =>
              s.status === "running" ? { ...s, status: "passed" as const } : s
            ))
          }

          // Do not push internal phase log lines to the visible console
          if (isPhaseLog) return

          if (recentLogsRef.current.length > 0) {
            const lastThree = recentLogsRef.current.slice(-3)
            if (lastThree.every(l => l === line)) return
          }
          recentLogsRef.current.push(line)
          if (recentLogsRef.current.length > 10) recentLogsRef.current.shift()

          setStreamLogs(prev => {
            const next = [...prev, { line, index: lastLogLenRef.current++ }]
            if (next.length > 500) next.splice(0, next.length - 500)
            return next
          })
        } catch { /* skip unparseable log */ }
      })

    es.addEventListener("progress", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        setStreamProgress(prev => ({
          ...prev,
          findings_found: data.findings_found ?? prev.findings_found,
          completed_phases: data.completed_phases ?? prev.completed_phases,
          total_phases: data.total_phases ?? prev.total_phases,
        }))
        if (data.tool_breakdown) {
          setStreamToolBreakdown(data.tool_breakdown)
          setToolCardsStatus(prev => {
            const next = { ...prev }
            for (const tool of ["semgrep", "trivy", "gitleaks"] as const) {
              const count = data.tool_breakdown[tool] ?? 0
              if (count > 0 && next[tool].status === "running") {
                next[tool] = { status: "failed" as const, label: "Vulnerability Found", count }
              } else if (count === 0 && next[tool].status === "running") {
                next[tool] = { status: "passed" as const, label: "No Vulnerability Found", count: 0 }
              }
            }
            return next
          })
        }
      } catch { /* ignore */ }
    })

    es.addEventListener("new_finding", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        setStreamFindings(prev => {
          if (prev.some(f => f.id === data.id)) return prev
          return [...prev, data]
        })
      } catch { /* ignore */ }
    })

    es.addEventListener("complete", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        const currentScanId = sseConnectedRef.current
        setStreamStatus("completed")
        const result = data.scan_result || (data.findings_found > 0 ? "failed" : "passed")
        setScanResult(result)
        
        // Fetch full findings including raw_data for AI Patch
        if (currentScanId) {
          fetch(`/api/scan-findings/by-scan/${currentScanId}`)
            .then(res => res.json())
            .then(d => {
              if (d.findings) setStreamFindings(d.findings)
            })
            .catch(() => {})
        }
        if (data.tool_breakdown) {
          setStreamToolBreakdown(data.tool_breakdown)
        }
        setStreamProgress(prev => ({
          ...prev,
          findings_found: data.findings_found ?? prev.findings_found,
          completed_phases: data.total_phases ?? prev.total_phases,
          total_phases: data.total_phases ?? prev.total_phases,
        }))
        setToolCardsStatus(prev => {
          const next = { ...prev }
          for (const tool of ["semgrep", "trivy", "gitleaks"] as const) {
            const count = data.tool_breakdown?.[tool] ?? 0
            if (count > 0) {
              next[tool] = { status: "failed" as const, label: "Vulnerability Found", count }
            } else {
              next[tool] = { status: "passed" as const, label: "No Vulnerability Found", count: 0 }
            }
          }
          return next
        })
        setPipelineStages(prev => prev.map(s => {
          if (s.id === 'clone') return { ...s, status: "passed" as const }
          if (s.id === 'semgrep' || s.id === 'trivy' || s.id === 'gitleaks') {
            const count = data.tool_breakdown?.[s.id] ?? 0
            return { ...s, status: count > 0 ? ("warning" as const) : ("passed" as const) }
          }
          return s
        }))
        sseConnectedRef.current = null
        es.close()
      } catch { /* ignore */ }
    })

    es.addEventListener("failed", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        setStreamStatus("failed")
        let errorMsg = data.error || "Scan failed"
        if (
          errorMsg.toLowerCase().includes("authentication failed") || 
          errorMsg.toLowerCase().includes("could not read username") || 
          errorMsg.toLowerCase().includes("not found")
        ) {
          errorMsg = "Error: Cannot access repository. Please check your URL or provide a Personal Access Token."
          toast.error(errorMsg)
        } else {
          toast.error("Scan Failed: " + errorMsg)
        }
        setStreamError(errorMsg)
        sseConnectedRef.current = null
        es.close()
      } catch { /* ignore */ }
    })

    es.addEventListener("error", () => {
      // SSE connection dropped — clean up to allow new scans
      if (es.readyState === EventSource.CLOSED) {
        sseConnectedRef.current = null
        setStreamStatus(prev => prev === "running" ? "failed" : prev)
        setStreamError("Connection to scan server lost. You can start a new scan.")
        es.close()
      }
    })
  }, [CICD_STAGES])

  const disconnectSse = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    sseConnectedRef.current = null
    setActiveScanId(null)
    setStreamStatus("idle")
    setStreamLogs([])
    setStreamFindings([])
    setPipelineStages(CICD_STAGES.map(s => ({ ...s, status: "pending" as const })))
    setToolCardsStatus({
      semgrep: { status: "idle" as const, label: "Ready", count: 0 },
      trivy: { status: "idle" as const, label: "Ready", count: 0 },
      gitleaks: { status: "idle" as const, label: "Ready", count: 0 },
    })
    setScanResult(null)
  }, [CICD_STAGES])

  return {
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
    setStreamFindings,
  }
}