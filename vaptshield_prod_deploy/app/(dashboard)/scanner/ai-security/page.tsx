"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Shield, Play, Square, AlertTriangle, CheckCircle, Loader2, FileDown, RotateCcw, FileText, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface Project {
  id: string
  name: string
}

interface ScanState {
  scanId: string | null
  status: "idle" | "running" | "completed" | "failed"
  totalProbes: number
  probesCompleted: number
  vulnerabilitiesFound: number
  targetUrl: string
  scanMode: string
  results: any[] | null
  summary: any | null
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-blue-500 text-white",
  informational: "bg-gray-500 text-white",
}

export default function AISecurityPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState("")
  const [targetUrl, setTargetUrl] = useState("")
  const [targetApiKey, setTargetApiKey] = useState("")
  const [scanMode, setScanMode] = useState("full")
  const [loading, setLoading] = useState(false)
  const [scan, setScan] = useState<ScanState>({
    scanId: null, status: "idle", totalProbes: 0, probesCompleted: 0,
    vulnerabilitiesFound: 0, targetUrl: "", scanMode: "full", results: null, summary: null,
  })

  useEffect(() => {
    fetch("/api/projects").then(r => r.json()).then(d => {
      if (d.projects) setProjects(d.projects)
    }).catch(() => {})
  }, [])

  const startScan = async () => {
    if (!selectedProject || !targetUrl) {
      toast.error("Select a project and enter a target URL")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/ai-security/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: selectedProject, target_url: targetUrl, target_api_key: targetApiKey, scan_mode: scanMode }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      setScan({ ...scan, scanId: data.scan_id, status: "running", targetUrl, scanMode })
      toast.success("AI Security scan started")
    } catch { toast.error("Failed to start scan") }
    finally { setLoading(false) }
  }

  const pollStatus = useCallback(async () => {
    if (!scan.scanId || scan.status !== "running") return
    const res = await fetch(`/api/ai-security/status/${scan.scanId}`)
    const data = await res.json()
    setScan(s => ({ ...s, ...data }))
    if (data.status === "completed" || data.status === "failed") {
      fetchResults()
    }
  }, [scan.scanId, scan.status])

  const fetchResults = async () => {
    if (!scan.scanId) return
    const res = await fetch(`/api/ai-security/results/${scan.scanId}`)
    const data = await res.json()
    setScan(s => ({ ...s, results: data.results, summary: data.summary, status: data.status }))
  }

  useEffect(() => {
    if (scan.status !== "running") return
    const interval = setInterval(pollStatus, 2000)
    return () => clearInterval(interval)
  }, [scan.status, pollStatus])

  const cancelScan = async () => {
    if (!scan.scanId) return
    await fetch(`/api/ai-security/start`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scan_id: scan.scanId }),
    }).catch(() => {})
    setScan(s => ({ ...s, status: "idle" }))
  }

  const progress = scan.totalProbes > 0 ? (scan.probesCompleted / scan.totalProbes) * 100 : 0

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">AI Security Scanner</h1>
          <p className="text-sm text-muted-foreground">OWASP LLM Top 10 + Agent Security Testing</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Scan Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject} disabled={scan.status === "running"}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target LLM API URL</Label>
              <Input placeholder="https://api.openai.com/v1/chat/completions" value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)} disabled={scan.status === "running"} />
            </div>
            <div className="space-y-2">
              <Label>Target API Key</Label>
              <Input type="password" placeholder="sk-... or gsk-..." value={targetApiKey}
                onChange={e => setTargetApiKey(e.target.value)} disabled={scan.status === "running"} />
              <p className="text-xs text-muted-foreground">Leave empty to test against Groq (demo mode)</p>
            </div>
            <div className="space-y-2">
              <Label>Scan Mode</Label>
              <Select value={scanMode} onValueChange={setScanMode} disabled={scan.status === "running"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full (LLM + Agent)</SelectItem>
                  <SelectItem value="llm_only">LLM Only (OWASP Top 10)</SelectItem>
                  <SelectItem value="agent_only">Agent Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={startScan} disabled={loading || scan.status === "running"}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Start Scan
            </Button>
            {scan.status === "running" && (
              <Button variant="destructive" onClick={cancelScan}>
                <Square className="h-4 w-4 mr-2" /> Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {scan.status !== "idle" && (
        <Card>
          <CardHeader><CardTitle>Scan Progress</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Badge variant={scan.status === "running" ? "default" : scan.status === "completed" ? "secondary" : "destructive"}>
                {scan.status === "running" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> :
                 scan.status === "completed" ? <CheckCircle className="h-3 w-3 mr-1" /> :
                 <AlertTriangle className="h-3 w-3 mr-1" />}
                {scan.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Probes: {scan.probesCompleted}/{scan.totalProbes}
              </span>
              <span className="text-sm text-muted-foreground">
                Vulnerabilities: {scan.vulnerabilitiesFound}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      {scan.results && scan.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Findings ({scan.vulnerabilitiesFound})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {scan.results.filter((f: any) => f.vulnerable).map((finding: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-medium">{finding.probe_name?.replace(/_/g, " ")}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{finding.owasp_category}</p>
                    </div>
                    <Badge className={SEVERITY_COLORS[finding.severity] || ""}>{finding.severity}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{finding.description}</p>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-primary">View Payload & Response</summary>
                    <div className="mt-2 space-y-2">
                      <div><span className="font-medium">Payload:</span><pre className="text-xs bg-muted p-2 rounded mt-1 whitespace-pre-wrap">{finding.payload}</pre></div>
                      <div><span className="font-medium">Response:</span><pre className="text-xs bg-muted p-2 rounded mt-1 whitespace-pre-wrap max-h-32 overflow-y-auto">{finding.response}</pre></div>
                    </div>
                  </details>
                  {finding.remediation && (
                    <div className="text-sm"><span className="font-medium">Fix: </span>{finding.remediation}</div>
                  )}
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {scan.summary && (
        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Object.entries(scan.summary.by_severity || {}).map(([sev, count]: any) => (
                <div key={sev} className="text-center p-3 rounded-lg border">
                  <div className={`text-lg font-bold ${sev === "critical" ? "text-red-600" : sev === "high" ? "text-orange-500" : sev === "medium" ? "text-yellow-600" : "text-blue-500"}`}>{count}</div>
                  <div className="text-xs text-muted-foreground capitalize">{sev}</div>
                </div>
              ))}
            </div>
            {scan.summary.by_owasp_category && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">OWASP LLM Top 10 Coverage</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(scan.summary.by_owasp_category).map(([cat, count]: any) => (
                    <Badge key={cat} variant="outline" className="text-xs">{cat}: {count}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-4 pt-4 border-t">
              <Button variant="outline" size="sm" onClick={() => { setScan({ scanId: null, status: "idle", totalProbes: 0, probesCompleted: 0, vulnerabilitiesFound: 0, targetUrl: "", scanMode: "full", results: null, summary: null }) }}>
                <RotateCcw className="h-4 w-4 mr-1" /> New Scan
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const blob = new Blob([JSON.stringify(scan.results, null, 2)], { type: "application/json" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a"); a.href = url; a.download = `ai-security-scan-${scan.scanId}.json`; a.click()
              }}>
                <FileDown className="h-4 w-4 mr-1" /> Export JSON
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
