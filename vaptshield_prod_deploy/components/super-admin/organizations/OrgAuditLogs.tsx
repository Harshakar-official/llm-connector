"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ListTodo,
  Loader2,
  RefreshCw,
  Shield,
  UserCog,
  Building,
  Settings,
  AlertTriangle,
  Clock,
  Globe,
  Monitor,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Download,
} from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

// ─── Types ───────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string
  org_id: string
  actor_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  old_data: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  profiles: {
    email: string
    full_name: string | null
  } | null
}

// ─── Action metadata ─────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; icon: string }> = {
  create_organization: { label: "Org Created", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: "🏗️" },
  update_org_details: { label: "Org Updated", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: "✏️" },
  transfer_ownership: { label: "Ownership Transfer", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: "🔄" },
  "auth.login": { label: "Login", color: "bg-sky-500/10 text-sky-400 border-sky-500/20", icon: "🔑" },
  "auth.login_failed": { label: "Failed Login", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "🚫" },
  "auth.logout": { label: "Logout", color: "bg-slate-500/10 text-slate-400 border-slate-500/20", icon: "🚪" },
  "user.invited": { label: "User Invited", color: "bg-violet-500/10 text-violet-400 border-violet-500/20", icon: "📧" },
  "user.role_changed": { label: "Role Changed", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: "👤" },
  "user.removed": { label: "User Removed", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "🗑️" },
  "project.created": { label: "Project Created", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: "📁" },
  "project.deleted": { label: "Project Deleted", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "🔥" },
  "scan.completed": { label: "Scan Completed", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", icon: "🔍" },
  "scan.failed": { label: "Scan Failed", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "❌" },
  "settings.updated": { label: "Settings Updated", color: "bg-slate-500/10 text-slate-400 border-slate-500/20", icon: "⚙️" },
  "org.updated": { label: "Org Updated", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: "✏️" },
  "stripe.payment": { label: "Payment", color: "bg-green-500/10 text-green-400 border-green-500/20", icon: "💳" },
}

function getActionMeta(action: string) {
  return ACTION_META[action] || { label: action, color: "bg-slate-500/10 text-slate-400 border-slate-500/20", icon: "📌" }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatJson(value: Record<string, unknown> | null): string {
  if (!value) return "—"
  try {
    const flat = Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(", ")
    return flat || "—"
  } catch {
    return "—"
  }
}

// ─── Component ───────────────────────────────────────────────────

interface OrgAuditLogsProps {
  orgId: string
}

export function OrgAuditLogs({ orgId }: OrgAuditLogsProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getBrowserClient()

      const { data, error: fetchError } = await supabase
        .from("audit_log")
        .select(`
          id,
          org_id,
          actor_id,
          action,
          resource_type,
          resource_id,
          old_data,
          new_value,
          ip_address,
          user_agent,
          created_at,
          profiles:actor_id (
            email,
            full_name
          )
        `)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200)

      if (fetchError) throw fetchError

      setLogs((data as AuditLogEntry[]) || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load audit logs"
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const filteredLogs = search
    ? logs.filter(
        (log) =>
          log.action.toLowerCase().includes(search.toLowerCase()) ||
          log.profiles?.email?.toLowerCase().includes(search.toLowerCase()) ||
          log.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          log.resource_type?.toLowerCase().includes(search.toLowerCase()) ||
          log.ip_address?.includes(search)
      )
    : logs

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      toast.error("No data to export")
      return
    }

    setIsExporting(true)
    try {
      const headers = ["Timestamp", "Action", "Actor Name", "Actor Email", "Resource Type", "Resource ID", "IP Address", "User Agent", "Details"]
      const rows = filteredLogs.map(log => [
        log.created_at,
        log.action,
        log.profiles?.full_name || "System",
        log.profiles?.email || "N/A",
        log.resource_type || "N/A",
        log.resource_id || "N/A",
        log.ip_address || "N/A",
        `"${log.user_agent || "N/A"}"`,
        `"${JSON.stringify(log.new_value || {}).replace(/"/g, '""')}"`
      ])

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n")
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `vaptshield_audit_logs_${orgId}_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success("Audit trail exported successfully")
    } catch (err) {
      toast.error("Failed to export logs")
    } finally {
      setIsExporting(false)
    }
  }

  // ── Loading State ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="p-6 border-b border-border bg-bg-subtle/30 flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-fg-muted" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted">Audit Logs</h3>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-fg-muted font-medium">Loading audit trail...</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Error State ──────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="p-6 border-b border-border bg-bg-subtle/30 flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-fg-muted" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted">Audit Logs</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <AlertTriangle className="h-10 w-10 text-danger/60" />
          <div className="text-center">
            <p className="text-sm font-medium text-fg">Failed to load audit logs</p>
            <p className="text-xs text-fg-muted mt-1">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // ── Empty State ──────────────────────────────────────────────
  if (logs.length === 0) {
    return (
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="p-6 border-b border-border bg-bg-subtle/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-fg-muted" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted">Audit Logs</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Clock className="h-12 w-12 text-fg-subtle" />
          <div className="text-center">
            <h3 className="text-lg font-medium text-fg">No Audit Entries Yet</h3>
            <p className="text-sm text-fg-muted mt-1 max-w-md">
              Platform events for this organization will appear here as actions are performed — such as organization updates, ownership transfers, user invitations, and more.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Data State ───────────────────────────────────────────────
  return (
    <div className="bg-panel border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-border bg-bg-subtle/30 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-fg-muted" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-fg-muted">
            Audit Logs
            <span className="ml-2 text-xs font-mono text-fg-subtle">({logs.length} entries)</span>
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle" />
            <Input
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 pr-8 w-56 text-xs bg-bg border-border"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting} className="h-8 rounded-lg font-bold text-[10px] uppercase">
            {isExporting ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Download className="h-3 w-3 mr-1.5" />}
            Export CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchLogs} className="h-8">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-bg-subtle/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted w-[160px]">
                Timestamp
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted w-[140px]">
                Action
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted w-[200px]">
                Actor
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted w-[100px]">
                Resource
              </th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted">
                Details
              </th>
              <th className="text-center px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted w-[40px]">
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredLogs.map((log) => {
              const meta = getActionMeta(log.action)
              const isExpanded = expandedRow === log.id
              const profile = log.profiles

              // ── Actor cell (reused in both collapsed and expanded) ──
              const actorCell = profile ? (
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-fg truncate">
                    {profile.full_name || profile.email}
                  </span>
                  {profile.full_name && (
                    <span className="text-[10px] text-fg-muted font-mono truncate">
                      {profile.email}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-fg-subtle italic">System</span>
              )

              // ── Collapsed row ──────────────────────────────────
              if (!isExpanded) {
                return (
                  <tr
                    key={log.id}
                    className="hover:bg-panel-hover transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-fg-subtle shrink-0" />
                        <span className="text-xs font-mono text-fg-muted whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap ${meta.color}`}
                      >
                        {meta.icon} {meta.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{actorCell}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono text-fg-muted uppercase bg-bg-subtle px-1.5 py-0.5 rounded">
                        {log.resource_type || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-fg-muted line-clamp-2">
                        {formatJson(log.new_value)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setExpandedRow(log.id)}
                        className="p-1 rounded hover:bg-panel-hover transition-colors"
                      >
                        <ChevronDown className="h-3.5 w-3.5 text-fg-muted" />
                      </button>
                    </td>
                  </tr>
                )
              }

              // ── Expanded row + detail ──────────────────────────
              return (
                <>
                  <tr key={log.id} className="hover:bg-panel-hover transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-fg-subtle shrink-0" />
                        <span className="text-xs font-mono text-fg-muted whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap ${meta.color}`}
                      >
                        {meta.icon} {meta.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{actorCell}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono text-fg-muted uppercase bg-bg-subtle px-1.5 py-0.5 rounded">
                        {log.resource_type || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-fg-muted line-clamp-2">
                        {formatJson(log.new_value)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setExpandedRow(null)}
                        className="p-1 rounded hover:bg-panel-hover transition-colors"
                      >
                        <ChevronUp className="h-3.5 w-3.5 text-fg-muted" />
                      </button>
                    </td>
                  </tr>
                  {/* Expanded detail row */}
                  <tr key={`${log.id}-detail`} className="bg-bg-subtle/30">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle flex items-center gap-1">
                            <Settings className="h-3 w-3" /> Previous State
                          </span>
                          <pre className="text-xs text-fg-muted bg-bg-subtle/50 rounded p-2 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {log.old_data ? JSON.stringify(log.old_data, null, 2) : "—"}
                          </pre>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle flex items-center gap-1">
                            <Shield className="h-3 w-3" /> New State
                          </span>
                          <pre className="text-xs text-fg-muted bg-bg-subtle/50 rounded p-2 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {log.new_value ? JSON.stringify(log.new_value, null, 2) : "—"}
                          </pre>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-fg-subtle flex items-center gap-1">
                            <Monitor className="h-3 w-3" /> Forensic Data
                          </span>
                          <div className="space-y-1 text-[10px] font-mono text-fg-muted bg-bg-subtle/50 rounded p-2">
                            <div className="flex items-center gap-1.5">
                              <Globe className="h-3 w-3 text-fg-subtle shrink-0" />
                              <span className="text-fg-subtle">IP:</span>
                              <span>{log.ip_address || "—"}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Monitor className="h-3 w-3 text-fg-subtle shrink-0" />
                              <span className="text-fg-subtle">UA:</span>
                              <span className="break-all">{log.user_agent || "—"}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-fg-subtle">ID:</span>
                              <span className="break-all">{log.id}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* No search results */}
      {filteredLogs.length === 0 && search && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Search className="h-8 w-8 text-fg-subtle" />
          <p className="text-sm text-fg-muted">
            No audit entries matching &quot;{search}&quot;
          </p>
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
            Clear Search
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-3 border-t border-border bg-bg-subtle/20 flex items-center justify-between">
        <span className="text-[10px] text-fg-subtle font-mono">
          Showing {filteredLogs.length} of {logs.length} entries
        </span>
        <span className="text-[10px] text-fg-subtle">
          Audit trail is immutable and tamper-proof
        </span>
      </div>
    </div>
  )
}