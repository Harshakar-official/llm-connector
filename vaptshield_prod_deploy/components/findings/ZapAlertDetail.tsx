"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle, CheckCircle, ExternalLink, FileCode,
  Globe, Shield, Wrench, BookOpen, Hash, Layers,
  ChevronDown, ChevronUp, Copy, Bug, Crosshair, Sparkles, Loader2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface RawData {
  name?: string
  alert?: string
  riskdesc?: string
  riskcode?: string
  confidence?: string
  desc?: string
  solution?: string
  reference?: string
  cweid?: string
  wascid?: string
  alertRef?: string
  pluginid?: string
  otherinfo?: string
  count?: string
  param?: string
  attack?: string
  evidence?: string
  method?: string
  tags?: Record<string, string>
  cvss_vector?: string
  impact?: string
  remediation?: string
  instances?: Array<{
    uri?: string
    param?: string
    attack?: string
    method?: string
    evidence?: string
    otherinfo?: string
  }>
  [key: string]: unknown
}

interface PendingAlert {
  id: string
  alert_name?: string | null
  title?: string | null
  severity?: string | null
  description?: string | null
  url?: string | null
  method?: string | null
  statusCode?: number | null
  evidence?: string | null
  solution?: string | null
  reference?: string | null
  cweid?: number | null
  confidence?: number | null
  attack?: string | null
  param?: string | null
  other?: string | null
  wascid?: number | null
  riskcode?: number | null
  raw_data?: RawData | Record<string, unknown> | null
  status?: string
}

interface Enrichment {
  description?: string | null
  impact?: string | null
  remediation?: string | null
  cvss_score?: number | null
  cvss_vector?: string | null
  cwe_id?: string | null
  owasp_category?: string | null
  reference_links?: string[]
}

function SeverityDot({ severity, size = "md" }: { severity?: string | null; size?: "sm" | "md" }) {
  const colors: Record<string, string> = {
    critical: "bg-severity-critical",
    high: "bg-severity-high",
    medium: "bg-severity-medium",
    low: "bg-severity-low",
    informational: "bg-severity-info",
  }
  const s = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2"
  return <span className={`${s} rounded-full shrink-0 ${colors[severity || ""] || "bg-fg-disabled"}`} />
}

const RISK_LEVELS: Record<string, { label: string; color: string; bg: string }> = {
  "3": { label: "High", color: "text-severity-critical", bg: "bg-severity-critical-bg" },
  "2": { label: "Medium", color: "text-severity-medium", bg: "bg-severity-medium-bg" },
  "1": { label: "Low", color: "text-severity-low", bg: "bg-severity-low-bg" },
  "0": { label: "Info", color: "text-severity-info", bg: "bg-severity-info-bg" },
}

const CONFIDENCE_MAP: Record<string, string> = {
  "1": "Low",
  "2": "Medium",
  "3": "High",
}

function renderHtml(text?: string | null) {
  if (!text) return null
  const stripped = text.replace(/<\/?p>/gi, "").replace(/<\/?li>/gi, "• ").replace(/<\/?ul>/gi, "").replace(/<br\s*\/?>/gi, "\n")
  return stripped
}

function Val({ value, label }: { value: string | null | undefined; label: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-fg-muted shrink-0 w-20 font-medium">{label}</span>
      <span className="text-fg break-words">{value || "—"}</span>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        {icon}
        {title}
      </div>
      <div className="text-xs text-fg leading-relaxed">
        {children || <span className="text-fg-disabled">—</span>}
      </div>
    </div>
  )
}

export function ZapAlertDetail({
  alert,
  onApprove,
  onReject,
  enrichment,
  onAiVerify,
  verifying,
}: {
  alert: PendingAlert
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  enrichment?: Enrichment | null
  onAiVerify?: () => void
  verifying?: boolean
}) {
  const [showRaw, setShowRaw] = useState(false)

  const rawData = alert.raw_data as RawData | null
  const alertName = alert.alert_name || alert.title || "Untitled"
  const severity = alert.severity || "informational"
  const riskCode = String(alert.riskcode ?? rawData?.riskcode ?? "")
  const riskLevel = RISK_LEVELS[riskCode]
  const confidence = alert.confidence != null ? CONFIDENCE_MAP[String(alert.confidence)] : (rawData?.confidence ? CONFIDENCE_MAP[rawData.confidence] : null)
  const cweId = alert.cweid != null ? String(alert.cweid) : rawData?.cweid
  const wascId = alert.wascid != null ? String(alert.wascid) : rawData?.wascid
  const alertRef = rawData?.alertRef || rawData?.pluginid
  const rawDesc = rawData?.desc || ""
  const desc = alert.description || renderHtml(rawDesc)
  const solution = renderHtml(alert.solution) || renderHtml(rawData?.solution)
  const references = alert.reference || rawData?.reference
  const otherInfo = alert.other || rawData?.otherinfo
  const instances = rawData?.instances || []
  // Parse count robustly: ZAP can send count as string ("0", "5") or number (0, 5).
  // String "0" is truthy in JS, so we must explicitly check for null/undefined.
  const rawCount = rawData?.count
  const parsedCount = rawCount != null ? Number(rawCount) : null
  const alertCount = parsedCount !== null && !isNaN(parsedCount)
    ? parsedCount
    : instances.length
  const evidence = alert.evidence || rawData?.evidence
  const attack = alert.attack || rawData?.attack
  const param = alert.param || rawData?.param
  const method = alert.method || rawData?.method || null
  const statusCode = alert.statusCode != null ? String(alert.statusCode) : (rawData as any)?.statusCode != null ? String((rawData as any).statusCode) : null
  const responseSize = (rawData as any)?.responseSize ?? null
  const sizeStr = responseSize
    ? responseSize > 1024 * 1024
      ? (responseSize / 1024 / 1024).toFixed(1) + "MB"
      : responseSize > 1024
        ? (responseSize / 1024).toFixed(0) + "KB"
        : responseSize + "B"
    : null
  const tags = rawData?.tags

  // Extract CVE ID from tags if present
  const cveId = tags && typeof tags === "object"
    ? Object.keys(tags).find(k => /^CVE-\d{4}-\d+$/i.test(k)) || null
    : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3 pb-3 border-b border-border">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          severity === "critical" || severity === "high" ? "bg-severity-critical-bg text-severity-critical" :
          severity === "medium" ? "bg-severity-medium-bg text-severity-medium" :
          severity === "low" ? "bg-severity-low-bg text-severity-low" :
          "bg-severity-info-bg text-severity-info"
        }`}>
          <Shield className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-fg leading-snug">{alertName}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
              severity === "critical" ? "border-severity-critical-border bg-severity-critical-bg text-severity-critical" :
              severity === "high" ? "border-severity-high-border bg-severity-high-bg text-severity-high" :
              severity === "medium" ? "border-severity-medium-border bg-severity-medium-bg text-severity-medium" :
              severity === "low" ? "border-severity-low-border bg-severity-low-bg text-severity-low" :
              "border-severity-info-border bg-severity-info-bg text-severity-info"
            }`}>
              {severity.toUpperCase()}
            </Badge>
            {riskLevel && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${riskLevel.bg} ${riskLevel.color}`}>
                {riskLevel.label}
              </span>
            )}
            {confidence && (
              <span className="text-[10px] text-fg-muted">Confidence: {confidence}</span>
            )}
            {alertRef && (
              <span className="text-[10px] font-mono text-fg-subtle">ID: {alertRef}</span>
            )}
            {enrichment && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-subtle text-primary border border-primary/30">
                <Sparkles className="w-2.5 h-2.5" />
                AI Enhanced
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Key metadata row */}
      <div className="flex flex-wrap gap-3 text-xs">
        {cweId && cweId !== "-1" && (
          <div className="flex items-center gap-1">
            <Hash className="w-3 h-3 text-fg-muted" />
            <span className="font-medium text-fg-muted">CWE:</span>
            <a
              href={`https://cwe.mitre.org/data/definitions/${cweId}.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-mono flex items-center gap-0.5"
            >
              {cweId} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}
        {cveId && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-fg-muted" />
            <span className="font-medium text-fg-muted">CVE:</span>
            <a
              href={`https://nvd.nist.gov/vuln/detail/${cveId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-mono flex items-center gap-0.5"
            >
              {cveId} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}
        {wascId && wascId !== "-1" && (
          <div className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-fg-muted" />
            <span className="font-medium text-fg-muted">WASC:</span>
            <span className="font-mono">{wascId}</span>
          </div>
        )}
        {enrichment?.cvss_score != null && (
          <div className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-fg-muted" />
            <span className="font-medium text-fg-muted">CVSS:</span>
            <span className={`font-mono font-semibold ${
              enrichment.cvss_score >= 9 ? "text-severity-critical" :
              enrichment.cvss_score >= 7 ? "text-severity-high" :
              enrichment.cvss_score >= 4 ? "text-severity-medium" :
              "text-severity-low"
            }`}>{enrichment.cvss_score.toFixed(1)}</span>
            {enrichment.cvss_vector && (
              <span className="text-[10px] font-mono text-fg-subtle truncate max-w-[180px]" title={enrichment.cvss_vector}>
                {enrichment.cvss_vector}
              </span>
            )}
          </div>
        )}
        {enrichment?.owasp_category && (
          <div className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-fg-muted" />
            <span className="font-medium text-fg-muted">OWASP:</span>
            <span className="text-[11px]">{enrichment.owasp_category}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <FileCode className="w-3 h-3 text-fg-muted" />
          <span className="font-medium text-fg-muted">Instances:</span>
          <span className="font-mono">{alertCount != null ? alertCount : "—"}</span>
        </div>
      </div>

      {/* Direct fields: URL, Param, Attack, Evidence, Method */}
      <div className="space-y-1.5 p-3 rounded bg-bg-muted border border-border">
        <Val label="URL" value={alert.url} />
        <Val label="Parameter" value={param} />
        <Val label="Attack" value={attack} />
        <Val label="Evidence" value={evidence} />
        <Val label="Method" value={method} />
        <Val label="Status" value={statusCode} />
        <Val label="Size" value={sizeStr} />
      </div>

      {/* Instances / URLs */}
      {instances.length > 0 && (
        <Section icon={<Globe className="w-3 h-3" />} title="Affected URLs">
          <div className="space-y-1.5">
            {instances.map((inst, idx) => (
              <div key={idx} className="p-2 rounded bg-bg-muted border border-border space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">{inst.method || "GET"}</Badge>
                  <span className="font-mono text-[11px] break-all">{inst.uri || alert.url || "—"}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-fg-subtle">
                  <span>Param: <span className="font-mono">{inst.param || "—"}</span></span>
                  <span>Attack: <span className="font-mono">{inst.attack || "—"}</span></span>
                  <span>Evidence: <span className="font-mono truncate max-w-[200px]">{inst.evidence || "—"}</span></span>
                  {inst.otherinfo && <span className="italic">{inst.otherinfo}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Description */}
      <Section icon={<BookOpen className="w-3 h-3" />} title="Description">
        {desc ? <p className="text-xs leading-relaxed">{desc}</p> : null}
      </Section>

      {/* Other info / Impact */}
      {otherInfo && (
        <Section icon={<AlertTriangle className="w-3 h-3" />} title="Impact / Other Information">
          <p className="text-xs">{otherInfo}</p>
        </Section>
      )}

      {/* Solution / Remediation */}
      <Section icon={<Wrench className="w-3 h-3" />} title="Remediation">
        {solution ? <p className="text-xs">{solution}</p> : null}
      </Section>

      {/* References */}
      <Section icon={<ExternalLink className="w-3 h-3" />} title="References">
        {references ? (
          <div className="space-y-1">
            {String(references).split("</p><p>").map((ref, idx) => {
              const clean = ref.replace(/<\/?[^>]+(>|$)/g, "").trim()
              const isUrl = clean.startsWith("http://") || clean.startsWith("https://")
              if (!clean) return null
              return (
                <div key={idx} className="flex items-start gap-1">
                  <span className="text-fg-subtle mt-0.5">•</span>
                  {isUrl ? (
                    <a href={clean} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                      {clean}
                    </a>
                  ) : (
                    <span>{clean}</span>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </Section>

      {/* Raw data toggle */}
      <div className="border-t border-border pt-3">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
        >
          {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Raw Alert Data
        </button>
        <AnimatePresence>
          {showRaw && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="relative mt-2">
                <pre className="text-[10px] font-mono bg-bg-muted p-3 rounded-md overflow-x-auto max-h-64 whitespace-pre-wrap border border-border">
                  {JSON.stringify(rawData || {}, null, 2)}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-6 w-6"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(rawData || {}, null, 2))
                    toast.success("Copied raw data")
                  }}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      {alert.status === "pending" && (onApprove || onReject || onAiVerify) && (
        <div className="flex gap-2 pt-3 border-t border-border">
          {onAiVerify && !enrichment && (
            <Button size="sm" variant="secondary" className="flex-1" onClick={onAiVerify} disabled={verifying}>
              {verifying ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Verifying...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-1.5" /> AI Verify</>
              )}
            </Button>
          )}
          {onApprove && (
            <Button size="sm" className="flex-1" onClick={() => onApprove(alert.id)}>
              <CheckCircle className="w-4 h-4 mr-1.5" /> Approve
            </Button>
          )}
          {onReject && (
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onReject(alert.id)}>
              <AlertTriangle className="w-4 h-4 mr-1.5" /> Reject
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
