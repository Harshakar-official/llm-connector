"use client"

import { useState, useMemo } from "react"
import { 
    Search, 
    Filter, 
    Download, 
    Clock, 
    User, 
    Globe, 
    Info, 
    ChevronDown, 
    ChevronUp, 
    Activity,
    FileJson
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DateRangePicker } from "@/components/shared/DateRangePicker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface AuditLog {
    id: string
    created_at: string
    action: string
    resource_type: string | null
    resource_id: string | null
    actor_id: string | null
    org_id: string | null
    ip_address: string | null
    user_agent: string | null
    new_value: any
    old_value: any
    profiles?: {
        full_name: string | null
        email: string
    } | null
    organizations?: {
        name: string
    } | null
}

interface Props {
    initialLogs: AuditLog[]
    isSuperAdmin: boolean
}

export function AuditClient({ initialLogs, isSuperAdmin }: Props) {
    const [search, setSearch] = useState("")
    const [actionFilter, setActionFilter] = useState("all")
    const [expandedRow, setExpandedRow] = useState<string | null>(null)

    const filteredLogs = useMemo(() => {
        return initialLogs.filter(log => {
            const matchesSearch = 
                log.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
                log.profiles?.email?.toLowerCase().includes(search.toLowerCase()) ||
                log.action.toLowerCase().includes(search.toLowerCase())
            
            const matchesAction = actionFilter === 'all' || log.action === actionFilter
            
            return matchesSearch && matchesAction
        })
    }, [initialLogs, search, actionFilter])

    const distinctActions = useMemo(() => {
        const actions = new Set(initialLogs.map(l => l.action))
        return Array.from(actions).sort()
    }, [initialLogs])

    const formatDetails = (val: any) => {
        if (!val) return "No data"
        if (typeof val !== 'object') return String(val)
        return Object.entries(val)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(", ")
    }

    return (
        <div className="space-y-6">
            {/* Filters Toolbar */}
            <div className="flex flex-wrap items-center gap-3 bg-panel p-4 rounded-2xl border border-border/50 shadow-sm">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted" />
                    <Input 
                        placeholder="Search by actor or action..." 
                        className="pl-9 bg-bg border-border rounded-xl"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="w-[200px] bg-bg border-border rounded-xl">
                        <Filter className="h-3.5 w-3.5 mr-2 text-primary" />
                        <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent className="bg-panel border-border text-fg">
                        <SelectItem value="all">All Actions</SelectItem>
                        {distinctActions.map(action => (
                            <SelectItem key={action} value={action} className="capitalize">
                                {action.replace(/[._]/g, ' ')}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <DateRangePicker />

                <Button variant="outline" className="rounded-xl border-border hover:bg-bg-subtle font-bold text-xs uppercase tracking-tighter ml-auto">
                    <Download className="h-3.5 w-3.5 mr-2" />
                    Export CSV
                </Button>
            </div>

            {/* Audit Table */}
            <div className="bg-panel border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-bg-subtle/50">
                        <TableRow className="border-border/50 hover:bg-transparent">
                            <TableHead className="w-[220px] text-[10px] font-black uppercase tracking-widest text-fg-muted py-4 px-6">Timestamp</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-fg-muted py-4 px-6">Actor</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-fg-muted py-4 px-6">Action</TableHead>
                            {isSuperAdmin && <TableHead className="text-[10px] font-black uppercase tracking-widest text-fg-muted py-4 px-6">Org</TableHead>}
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-fg-muted py-4 px-6">IP Address</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-fg-muted py-4 px-6 text-right">Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    {filteredLogs.map((log) => (
                        <Collapsible
                            key={log.id}
                            asChild
                            open={expandedRow === log.id}
                            onOpenChange={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                        >
                            <TableBody>
                                <TableRow className="group border-border/30 hover:bg-bg-subtle/30 cursor-pointer">
                                    <TableCell className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 text-sm font-bold text-fg leading-none">
                                                <Clock className="h-3.5 w-3.5 text-primary/60" />
                                                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </div>
                                                <span className="text-[10px] text-fg-muted font-medium px-5">
                                                    {new Date(log.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                                                    <User className="h-4 w-4" />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-bold text-fg truncate">
                                                        {log.profiles?.full_name || 'System'}
                                                    </span>
                                                    <span className="text-[10px] text-fg-muted font-mono truncate">
                                                        {log.profiles?.email || 'automated@vaptshield.com'}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-6 py-4">
                                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black uppercase text-[9px] tracking-tighter">
                                                {log.action.replace(/[._]/g, ' ')}
                                            </Badge>
                                        </TableCell>
                                        {isSuperAdmin && (
                                            <TableCell className="px-6 py-4 text-xs font-medium text-fg-muted">
                                                {log.organizations?.name || 'Platform'}
                                            </TableCell>
                                        )}
                                        <TableCell className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-[10px] font-mono text-fg-muted">
                                                <Globe className="h-3 w-3 opacity-40" />
                                                {log.ip_address || '---'}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-6 py-4 text-right">
                                            <CollapsibleTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 group-hover:bg-bg-subtle">
                                                    <span className="text-[10px] font-bold text-fg-muted uppercase mr-2 truncate max-w-[120px]">
                                                        {formatDetails(log.new_value)}
                                                    </span>
                                                    {expandedRow === log.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                </Button>
                                            </CollapsibleTrigger>
                                        </TableCell>
                                    </TableRow>
                                    
                                    <CollapsibleContent asChild>
                                        <TableRow className="bg-bg-subtle/50 hover:bg-bg-subtle/50">
                                            <TableCell colSpan={isSuperAdmin ? 6 : 5} className="p-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-2 duration-300">
                                                    <div className="space-y-3">
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                                            <FileJson className="h-3 w-3" /> Event Metadata
                                                        </h4>
                                                        <div className="bg-bg p-4 rounded-xl border border-border/50 text-xs font-mono space-y-2 overflow-auto max-h-[300px]">
                                                            <div className="flex justify-between border-b border-border/30 pb-1">
                                                                <span className="text-fg-muted">Resource:</span>
                                                                <span className="text-fg">{log.resource_type || 'N/A'}</span>
                                                            </div>
                                                            <div className="flex justify-between border-b border-border/30 pb-1">
                                                                <span className="text-fg-muted">Resource ID:</span>
                                                                <span className="text-fg">{log.resource_id || 'N/A'}</span>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className="text-fg-muted block">User Agent:</span>
                                                                <span className="text-[10px] text-fg-disabled leading-relaxed break-all">{log.user_agent || 'Unknown'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-success flex items-center gap-2">
                                                            <Activity className="h-3 w-3" /> Changes Recorded
                                                        </h4>
                                                        <div className="bg-bg p-4 rounded-xl border border-border/50 overflow-auto max-h-[300px]">
                                                            <pre className="text-[10px] font-mono text-success leading-relaxed">
                                                                {JSON.stringify(log.new_value, null, 2)}
                                                            </pre>
                                                            {log.old_value && (
                                                                <div className="mt-4 pt-4 border-t border-border/30">
                                                                    <p className="text-[9px] text-fg-disabled uppercase font-bold mb-2">Previous State</p>
                                                                    <pre className="text-[10px] font-mono text-fg-muted opacity-60">
                                                                        {JSON.stringify(log.old_value, null, 2)}
                                                                    </pre>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    </CollapsibleContent>
                            </TableBody>
                        </Collapsible>
                    ))}
                    {filteredLogs.length === 0 && (
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={isSuperAdmin ? 6 : 5} className="py-24 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="h-16 w-16 rounded-full bg-bg-subtle flex items-center justify-center">
                                            <Info className="h-8 w-8 text-fg-disabled opacity-20" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-fg">No audit records found</p>
                                            <p className="text-sm text-fg-muted">Adjust your search or filters to see more events.</p>
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    )}
                </Table>
            </div>
        </div>
    )
}
