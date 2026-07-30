"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { 
  ShieldAlert, 
  Search, 
  User,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Plus,
  Download,
  MoreHorizontal,
  Circle,
  LayoutGrid,
  CheckCircle2,
  Trash2,
  UserPlus,
  X,
  AlertCircle,
  Loader2,
  FileText,
  Edit3,
  RefreshCw
} from "lucide-react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from "@tanstack/react-table"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn, formatRelativeTime } from "@/lib/utils"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { toast } from "sonner"
import { FindingForm } from "@/components/findings/FindingForm"
import { SeverityBadge } from "@/components/findings/SeverityBadge"
import { 
    bulkUpdateStatus, 
    bulkAssign, 
    bulkDeleteFindings, 
    deleteFinding 
} from "./actions"

interface Finding {
  id: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  status: string
  created_at: string
  project_id: string
  projects: { id: string, name: string } | null
  profiles: { id: string, full_name: string, avatar_url: string | null } | null
  assigned_to_profile: { id: string, full_name: string, avatar_url: string | null } | null
  cve_id: string | null
  cvss_score: number | null
  reference_links: string[] | null
  vuln_attachments?: { id: string, original_filename: string, file_size_bytes: number, mime_type: string, file_url: string }[]
}

interface Member {
    id: string
    full_name: string
    avatar_url: string | null
    role: string
}

const STATUS_CONFIG: Record<string, { label: string, color: string }> = {
  open: { label: "Open", color: "text-severity-critical" },
  reopened: { label: "Re-opened", color: "text-orange-500" },
  in_progress: { label: "In Progress", color: "text-warning" },
  resolved: { label: "Resolved", color: "text-success" },
  verified: { label: "Verified", color: "text-purple-500" },
  closed: { label: "Closed", color: "text-fg-disabled" },
  accepted_risk: { label: "Risk Accepted", color: "text-fg-muted" },
  false_positive: { label: "False Positive", color: "text-fg-disabled" },
}

interface SeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
  informational: number
}

interface Props {
  orgId: string
  projects: { id: string, name: string }[]
  members: Member[]
  userRole: string
  severityCounts?: SeverityCounts
  lockedProjectId?: string
}

export function FindingsClient({ projects: rawProjects, members: rawMembers, userRole, severityCounts, lockedProjectId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  // Z+ STABILITY: Memoize props to prevent infinite re-render loops in child components
  // We use the serialized content as dependency because the array references change every render
  const projects = useMemo(() => rawProjects, [JSON.stringify(rawProjects)])
  const members = useMemo(() => rawMembers, [JSON.stringify(rawMembers)])

  // Z+ UX: Filter members to only show relevant remediation leads (Developers)
  const remediationLeads = useMemo(() => {
    return members.filter(m => m.role === 'developer')
  }, [members])

  // URL State - MUST BE DEFINED BEFORE Local Table State
  const pageParam = parseInt(searchParams.get("page") || "1")
  const limitParam = parseInt(searchParams.get("limit") || "25")
  const searchParam = searchParams.get("search") || ""
  const severityParam = searchParams.get("severity") || "all"
  const statusParam = searchParams.get("status") || "all"
  const projectParam = lockedProjectId || searchParams.get("project") || "all"
  const assigneeParam = searchParams.get("assignee") || "all"
  const sortParam = searchParams.get("sort") || "cvss_score"
  const orderParam = searchParams.get("order") || "desc"

  // Local State for severity counts (to allow refreshing)
  const [localSeverityCounts, setLocalSeverityCounts] = useState<SeverityCounts>(severityCounts || {
    critical: 0, high: 0, medium: 0, low: 0, informational: 0
  })

  // Local Table State
  const [data, setData] = useState<Finding[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [rowSelection, setRowSelection] = useState({})
  const [sorting, setSorting] = useState<SortingState>([
    { id: sortParam, desc: orderParam === "desc" }
  ])

  // Z+ SECURITY: Detect if current selection spans multiple projects
  const selectionProjectIds = useMemo(() => {
    const selectedIds = Object.keys(rowSelection)
    const projectsInSelection = new Set<string>()
    selectedIds.forEach(id => {
        const finding = data.find(f => f.id === id)
        if (finding?.project_id) projectsInSelection.add(finding.project_id)
    })
    return projectsInSelection
  }, [rowSelection, data])

  const isSingleProjectSelected = selectionProjectIds.size === 1
  const isMultiProjectSelected = selectionProjectIds.size > 1

  // Dialog State
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [isBulkDeleteAlertOpen, setIsBulkDeleteAlertOpen] = useState(false)
  const [isSingleDeleteAlertOpen, setIsSingleDeleteAlertOpen] = useState(false)
  const [findingToDelete, setFindingToDelete] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ref to avoid stale closure over derived projectParam in fetchData
  const projectParamRef = useRef(projectParam)
  projectParamRef.current = projectParam

  // Permission Checks
  const canModify = ['admin', 'program_manager', 'security_engineer'].includes(userRole)

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const currentProject = projectParamRef.current
      const params = new URLSearchParams()
      params.set("page", pageParam.toString())
      params.set("limit", limitParam.toString())
      params.set("sort", sortParam)
      params.set("order", orderParam)
      if (searchParam) params.set("search", searchParam)
      if (severityParam !== "all") params.set("severity", severityParam)
      if (statusParam !== "all") params.set("status", statusParam)
      if (currentProject && currentProject !== "all") params.set("project", currentProject)
      if (assigneeParam !== "all") params.set("assignee", assigneeParam)

      const response = await fetch(`/api/findings?${params.toString()}`)
      if (!response.ok) throw new Error("Failed to load findings")
      const json = await response.json()
      
      setData(json.rows)
      setTotalCount(json.total)
      
      // Update local severity counts from API summary
      if (json.summary) {
          setLocalSeverityCounts(json.summary)
      }
    } catch (err) {
      console.error("Failed to load findings:", err)
      toast.error("Failed to load findings")
    } finally {
      setLoading(false)
    }
  }, [pageParam, limitParam, searchParam, severityParam, statusParam, projectParam, assigneeParam, sortParam, orderParam])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Sync URL sort params → local sorting state (for browser back/forward)
  useEffect(() => {
    const urlSort = [{ id: sortParam, desc: orderParam === "desc" }] as SortingState
    if (sorting.length > 0 && sorting[0].id === urlSort[0].id && sorting[0].desc === urlSort[0].desc) {
      return
    }
    setSorting(urlSort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortParam, orderParam])

  // Sync local sorting state → URL (for user clicks on column headers)
  useEffect(() => {
    if (sorting.length === 0) return
    const { id, desc } = sorting[0]
    if (id === sortParam && (desc ? 'desc' : 'asc') === orderParam) {
      return
    }
    updateURL({ sort: id, order: desc ? 'desc' : 'asc' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting])

  // Update URL on filter change
  const updateURL = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "all") {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    // Reset page on filter change
    if (!updates.page) params.set("page", "1")
    router.push(`?${params.toString()}`)
  }

  // Bulk Handlers
  const handleBulkStatus = async (status: string) => {
    const ids = Object.keys(rowSelection)
    setIsProcessing(true)
    const result = await bulkUpdateStatus({ 
        ids, 
        status: status as any
    })
    if (result.success) {
        const label = STATUS_CONFIG[status]?.label || status
        toast.success(`Updated ${ids.length} ${ids.length === 1 ? 'finding' : 'findings'} to ${label}`)
        setRowSelection({})
        fetchData()
    } else {
        toast.error(result.error)
    }
    setIsProcessing(false)
  }

  const handleBulkAssign = async (memberId: string | null) => {
    const ids = Object.keys(rowSelection)
    setIsProcessing(true)
    const result = await bulkAssign({ ids, assigneeId: memberId })
    if (result.success) {
        const actionLabel = memberId ? "Assigned" : "Unassigned"
        toast.success(`${actionLabel} ${ids.length} ${ids.length === 1 ? 'finding' : 'findings'}`)
        setRowSelection({})
        fetchData()
    } else {
        toast.error(result.error)
    }
    setIsProcessing(false)
  }

  const handleBulkDelete = async () => {
    const ids = Object.keys(rowSelection)
    setIsProcessing(true)
    const result = await bulkDeleteFindings({ ids })
    if (result.success) {
        toast.success(`Deleted ${ids.length} findings`)
        setRowSelection({})
        fetchData()
        setIsBulkDeleteAlertOpen(false)
    } else {
        toast.error(result.error)
    }
    setIsProcessing(false)
  }

  const handleSingleDelete = async () => {
    if (!findingToDelete) return
    setIsProcessing(true)
    const result = await deleteFinding(findingToDelete)
    if (result.success) {
        toast.success("Finding deleted")
        fetchData()
        setIsSingleDeleteAlertOpen(false)
        setFindingToDelete(null)
    } else {
        toast.error(result.error)
    }
    setIsProcessing(false)
  }

  const handleOpenEdit = (finding: Finding) => {
    setSelectedFinding(finding)
    setIsFormOpen(true)
  }

  // Columns Definition
  const columnHelper = createColumnHelper<Finding>()
  const columns = useMemo(() => [
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        userRole !== 'developer' ? (
            <div className="flex items-center justify-center">
                <div 
                    className={cn(
                        "w-4 h-4 border rounded flex items-center justify-center cursor-pointer transition-colors",
                        table.getIsAllPageRowsSelected() ? "bg-primary border-primary" : "border-border"
                    )}
                    onClick={() => table.toggleAllPageRowsSelected()}
                >
                    {table.getIsAllPageRowsSelected() && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
            </div>
        ) : null
      ),
      cell: ({ row }) => (
        userRole !== 'developer' ? (
            <div className="flex items-center justify-center">
                <div 
                    className={cn(
                        "w-4 h-4 border rounded flex items-center justify-center cursor-pointer transition-colors",
                        row.getIsSelected() ? "bg-primary border-primary" : "border-border"
                    )}
                    onClick={(e) => {
                        e.stopPropagation()
                        row.toggleSelected()
                    }}
                >
                    {row.getIsSelected() && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
            </div>
        ) : null
      ),
    }),
    columnHelper.accessor("cvss_score", {
      header: ({ column }) => (
        <div 
            className="flex items-center gap-1 cursor-pointer select-none hover:text-fg transition-colors"
            onClick={() => column.toggleSorting()}
        >
            <span>CVSS</span>
            {column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" /> : column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />}
        </div>
      ),
      cell: (info) => {
          const score = info.getValue()
          if (score === null || score === undefined) return <span className="text-fg-disabled italic text-[10px]">N/A</span>
          return (
              <span className={cn(
                  "font-mono font-black text-xs px-2 py-0.5 rounded",
                  score >= 9 ? "bg-severity-critical/10 text-severity-critical" :
                  score >= 7 ? "bg-severity-high/10 text-severity-high" :
                  score >= 4 ? "bg-severity-medium/10 text-severity-medium" :
                  "bg-severity-low/10 text-severity-low"
              )}>
                  {score.toFixed(1)}
              </span>
          )
      },
    }),
    columnHelper.accessor("severity", {
      id: "severity",
      header: ({ column }) => (
        <div 
            className="flex items-center gap-1 cursor-pointer select-none hover:text-fg transition-colors"
            onClick={() => column.toggleSorting()}
        >
            <span>SEVERITY</span>
            {column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" /> : column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />}
        </div>
      ),
      cell: (info) => (
        <SeverityBadge 
          severity={info.getValue()} 
          variant="dot" 
          size="sm"
        />
      ),
    }),
    columnHelper.accessor("title", {
      header: ({ column }) => (
        <div 
            className="flex items-center gap-1 cursor-pointer select-none hover:text-fg transition-colors"
            onClick={() => column.toggleSorting()}
        >
            <span>TITLE</span>
            {column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" /> : column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />}
        </div>
      ),
      cell: (info) => (
        <div className="flex flex-col min-w-0 max-w-md">
          <Link href={`/findings/${info.row.original.id}`} className="text-sm font-bold text-fg truncate hover:text-primary transition-colors">
            {info.getValue()}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            {info.row.original.cve_id && (
              <span className="text-[10px] font-mono bg-bg-muted px-1 rounded border border-border text-fg-subtle">
                {info.row.original.cve_id}
              </span>
            )}
          </div>
        </div>
      ),
    }),
    columnHelper.accessor("projects.name", {
      header: "PROJECT",
      cell: (info) => (
        <div className="flex items-center gap-2 text-fg-muted">
            <LayoutGrid className="h-3 w-3" />
            <span className="text-xs font-medium truncate max-w-[120px]">
                {info.getValue() || "Global"}
            </span>
        </div>
      ),
    }),
    columnHelper.accessor("assigned_to_profile.full_name", {
      id: "assigned_to",
      header: "ASSIGNED TO",
      cell: (info) => (
        <div className="flex items-center gap-2">
            {info.getValue() ? (
                <>
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={info.row.original.assigned_to_profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {info.getValue()?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium text-fg-muted truncate max-w-[80px]">
                        {info.getValue()?.split(" ")[0]}
                    </span>
                </>
            ) : (
                <span className="text-[10px] text-fg-disabled italic ml-1">Unassigned</span>
            )}
        </div>
      ),
    }),
    columnHelper.accessor("status", {
      header: ({ column }) => (
        <div 
            className="flex items-center gap-1 cursor-pointer select-none hover:text-fg transition-colors"
            onClick={() => column.toggleSorting()}
        >
            <span>STATUS</span>
            {column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" /> : column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />}
        </div>
      ),
      cell: (info) => {
        const status = info.getValue()
        const config = STATUS_CONFIG[status] || { label: status, color: "text-fg-muted" }
        return (
          <div className="flex items-center gap-1.5">
            <Circle className={cn("h-1.5 w-1.5 fill-current", config.color)} />
            <span className="text-xs font-semibold capitalize whitespace-nowrap">{config.label}</span>
          </div>
        )
      },
    }),
    columnHelper.accessor("profiles.full_name", {
      header: "FOUND BY",
      cell: (info) => (
        <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
                <AvatarImage src={info.row.original.profiles?.avatar_url || undefined} />
                <AvatarFallback className="text-[10px] bg-bg-subtle">
                    {info.getValue()?.slice(0, 2).toUpperCase() || "??"}
                </AvatarFallback>
            </Avatar>
            <span className="text-xs text-fg-muted truncate max-w-[80px]">
                {info.getValue()?.split(" ")[0] || "System"}
            </span>
        </div>
      ),
    }),
    columnHelper.accessor("created_at", {
      header: ({ column }) => (
        <div 
            className="flex items-center gap-1 cursor-pointer select-none hover:text-fg transition-colors"
            onClick={() => column.toggleSorting()}
        >
            <span>CREATED</span>
            {column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" /> : column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />}
        </div>
      ),
      cell: (info) => (
        <span className="text-xs font-mono text-fg-subtle whitespace-nowrap">
          {formatRelativeTime(info.getValue())}
        </span>
      ),
    }),
    columnHelper.display({
        id: "actions",
        cell: (info) => (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-panel border-border w-40">
                    <DropdownMenuItem asChild>
                        <Link href={`/findings/${info.row.original.id}`} className="gap-2 text-xs font-medium">
                            <FileText className="h-3.5 w-3.5" /> View Details
                        </Link>
                    </DropdownMenuItem>
                    {canModify && (
                        <>
                            <DropdownMenuItem 
                                className="gap-2 text-xs font-medium"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleOpenEdit(info.row.original)
                                }}
                            >
                                <Edit3 className="h-3.5 w-3.5" /> Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border" />
                            <DropdownMenuItem 
                                className="text-danger focus:text-danger focus:bg-danger/10 gap-2 text-xs font-medium"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setFindingToDelete(info.row.original.id)
                                    setIsSingleDeleteAlertOpen(true)
                                }}
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        )
    })
  ], [columnHelper, canModify])

  // TanStack Table Instance
  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection,
      sorting,
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.ceil(totalCount / limitParam),
    getRowId: (row) => row.id,
  })

  // Bulk Selection Info
  const selectedRowIds = Object.keys(rowSelection)
  const hasSelection = selectedRowIds.length > 0

  const handleExportCSV = () => {
    // Proper CSV export with escaping for commas, quotes, and newlines
    const escapeCSV = (val: string): string => {
      const str = String(val ?? "")
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const headers = ["Severity", "Title", "Project", "Status", "Created At"]
    const rows = data.map(f => [
        escapeCSV(f.severity),
        escapeCSV(f.title),
        escapeCSV(f.projects?.name || "Global"),
        escapeCSV(f.status),
        escapeCSV(f.created_at)
    ])
    
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.setAttribute("download", `findings_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("CSV Export complete")
  }

  // Dynamic page numbers with ellipsis for large datasets
  const totalPages = totalCount >= 0 ? Math.ceil(totalCount / limitParam) : 1
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | string)[] = [1]
    if (pageParam > 3) pages.push('ellipsis')
    const start = Math.max(2, pageParam - 1)
    const end = Math.min(totalPages - 1, pageParam + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (pageParam < totalPages - 2) pages.push('ellipsis')
    pages.push(totalPages)
    return pages
  }, [totalPages, pageParam])

  // Memoize initialData to prevent infinite re-render loop in FindingForm
  const memoizedInitialData = useMemo(() => {
    if (selectedFinding) {
      return {
        ...selectedFinding,
        status: selectedFinding.status as 'open' | 'in_progress' | 'resolved' | 'verified' | 'closed' | 'accepted_risk' | 'false_positive',
        cvss_score: selectedFinding.cvss_score || 0,
        reference_links: Array.isArray(selectedFinding.reference_links) ? selectedFinding.reference_links : []
      }
    }
    if (lockedProjectId || (projectParam !== 'all' ? projectParam : undefined)) {
      return { project_id: lockedProjectId || projectParam }
    }
    return undefined
  }, [selectedFinding, lockedProjectId, projectParam])

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-fg flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-primary" />
            Findings
          </h1>
          <p className="text-fg-muted mt-1 text-sm font-medium">
            Vulnerability inventory across all security targets
          </p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" className="h-10 gap-2 border-border" onClick={handleExportCSV}>
                <Download className="h-4 w-4" /> Export CSV
            </Button>
            {/* Z+ CONTEXTUAL UX: Only show 'New Finding' if we are inside a specific project */}
            {lockedProjectId && canModify && (
                <Button className="h-10 gap-2 font-bold shadow-lg shadow-primary/20" onClick={() => setIsFormOpen(true)}>
                    <Plus className="h-4 w-4" /> New Finding
                </Button>
            )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {(['critical', 'high', 'medium', 'low', 'informational'] as const).map((sev) => (
              <div key={sev} className="bg-panel border border-border p-4 rounded-xl shadow-sm hover:border-primary/20 transition-all cursor-default">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-bold text-fg-subtle tracking-widest">{sev === 'informational' ? 'Info' : sev}</span>
                    <SeverityBadge severity={sev} variant="dot" size="sm" className="font-bold" />
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-mono font-bold text-fg leading-none">
                        {localSeverityCounts?.[sev] ?? 0}
                    </span>
                    <span className="text-[10px] text-fg-disabled font-medium mb-1">active</span>
                  </div>
              </div>
          ))}
      </div>

      {/* Main Inventory Container */}
      <div className="bg-panel border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[600px]">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-bg-subtle/30 flex flex-col lg:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0 no-scrollbar">
                {/* Severity Filter */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 gap-2 border-border whitespace-nowrap">
                            <ShieldAlert className="h-3.5 w-3.5 text-fg-subtle" />
                            {severityParam === 'all' ? 'All Severities' : severityParam.toUpperCase()}
                            <ChevronDown className="h-3 w-3 text-fg-disabled" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-panel border-border min-w-[150px]">
                        <DropdownMenuItem onClick={() => updateURL({ severity: 'all' })}>All Severities</DropdownMenuItem>
                        {['critical', 'high', 'medium', 'low', 'informational'].map(s => (
                            <DropdownMenuItem key={s} onClick={() => updateURL({ severity: s })} className="capitalize">{s}</DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Status Filter */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 gap-2 border-border whitespace-nowrap">
                            <Circle className="h-3 w-3 text-fg-subtle" />
                            {statusParam === 'all' ? 'All Status' : statusParam.replace('_', ' ').toUpperCase()}
                            <ChevronDown className="h-3 w-3 text-fg-disabled" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-panel border-border min-w-[150px]">
                        <DropdownMenuItem onClick={() => updateURL({ status: 'all' })}>All Status</DropdownMenuItem>
                        {Object.keys(STATUS_CONFIG).map(s => (
                            <DropdownMenuItem key={s} onClick={() => updateURL({ status: s })} className="capitalize">{s.replace('_', ' ')}</DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Project Filter */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 gap-2 border-border whitespace-nowrap">
                            <LayoutGrid className="h-3.5 w-3.5 text-fg-subtle" />
                            {projectParam === 'all' ? 'All Projects' : projects.find(p => p.id === projectParam)?.name || 'Project'}
                            <ChevronDown className="h-3 w-3 text-fg-disabled" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-panel border-border max-h-64 overflow-y-auto w-56">
                        <DropdownMenuItem onClick={() => updateURL({ project: 'all' })}>All Projects</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        {projects.map(p => (
                            <DropdownMenuItem key={p.id} onClick={() => updateURL({ project: p.id })}>{p.name}</DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Assignee Filter */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 gap-2 border-border whitespace-nowrap">
                            <User className="h-3.5 w-3.5 text-fg-subtle" />
                            {assigneeParam === 'all' ? 'All Leads' : members.find(m => m.id === assigneeParam)?.full_name || 'Unassigned'}
                            <ChevronDown className="h-3 w-3 text-fg-disabled" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="bg-panel border-border max-h-64 overflow-y-auto w-56">
                        <DropdownMenuItem onClick={() => updateURL({ assignee: 'all' })}>All Leads</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateURL({ assignee: 'none' })}>Unassigned</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        {remediationLeads.map(m => (
                            <DropdownMenuItem key={m.id} className="gap-2" onClick={() => updateURL({ assignee: m.id })}>
                                <Avatar className="h-4 w-4">
                                    <AvatarImage src={m.avatar_url || undefined} />
                                    <AvatarFallback className="text-[8px]">{m.full_name[0]}</AvatarFallback>
                                </Avatar>
                                {m.full_name}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Clear Filters */}
                {(searchParam || severityParam !== 'all' || statusParam !== 'all' || projectParam !== 'all' || assigneeParam !== 'all') && (
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-9 text-[10px] uppercase font-bold text-fg-disabled hover:text-fg"
                        onClick={() => {
                          const params = new URLSearchParams()
                          if (limitParam !== 25) params.set("limit", limitParam.toString())
                          // Reset to default CVSS sorting
                          params.set("sort", "cvss_score")
                          params.set("order", "desc")
                          const qs = params.toString()
                          router.push(`${pathname}${qs ? `?${qs}` : ''}`)
                        }}
                    >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Reset All
                    </Button>
                )}
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
                <div className="relative w-full lg:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted" />
                    <Input
                        ref={searchInputRef}
                        placeholder="Search title, description, CVE..."
                        className="pl-9 pr-9 h-10 bg-bg border-border focus:ring-primary/20 text-sm"
                        defaultValue={searchParam}
                        key={searchParam}
                        onChange={(e) => {
                            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
                            searchDebounceRef.current = setTimeout(() => {
                                updateURL({ search: e.currentTarget.value || null })
                            }, 300)
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
                                updateURL({ search: e.currentTarget.value || null })
                            }
                        }}
                    />
                    {searchParam && (
                        <button
                            type="button"
                            onClick={() => updateURL({ search: null })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-disabled hover:text-fg transition-colors"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                
                {/* Bulk Actions Button - HIDDEN FOR DEVELOPERS */}
                {hasSelection && userRole !== 'developer' && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg border border-primary/20 animate-in zoom-in-95 duration-200">
                        <span className="text-xs font-bold text-primary mr-2">{selectedRowIds.length} selected</span>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" className="h-7 text-[10px] uppercase font-bold" disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Bulk Actions"} 
                                    <ChevronDown className="ml-1 h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48 bg-panel border-border shadow-xl">
                                <DropdownMenuLabel className="text-[10px] uppercase text-fg-disabled">Change Status</DropdownMenuLabel>
                                {Object.keys(STATUS_CONFIG).map(s => (
                                    <DropdownMenuItem key={s} className="gap-2 text-xs font-medium" onClick={() => handleBulkStatus(s)}>
                                        <CheckCircle2 className="h-3.5 w-3.5 text-fg-subtle" /> {STATUS_CONFIG[s].label}
                                    </DropdownMenuItem>
                                ))}
                                
                                {['admin', 'program_manager', 'security_engineer'].includes(userRole) && (
                                    <>
                                        <DropdownMenuSeparator className="bg-border" />
                                        <DropdownMenuLabel className="text-[10px] uppercase text-fg-disabled flex items-center justify-between">
                                            Assign Lead
                                            {isMultiProjectSelected && <AlertCircle className="h-3 w-3 text-warning" />}
                                        </DropdownMenuLabel>
                                        
                                        {isMultiProjectSelected ? (
                                            <div className="px-2 py-2 text-[10px] text-warning italic leading-tight">
                                                Selection spans multiple projects. Please filter by project to assign leads securely.
                                            </div>
                                        ) : (
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger className="gap-2 text-xs font-medium">
                                                    <UserPlus className="h-3.5 w-3.5" /> Assign To...
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuPortal>
                                                    <DropdownMenuSubContent className="bg-panel border-border min-w-[180px] max-h-64 overflow-y-auto">
                                                        <DropdownMenuItem className="text-xs font-medium" onClick={() => handleBulkAssign(null)}>
                                                            Unassigned
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator className="bg-border" />
                                                        {remediationLeads.length === 0 ? (
                                                            <div className="px-2 py-3 text-[10px] text-fg-disabled text-center italic">
                                                                No developers found in this organization.
                                                            </div>
                                                        ) : (
                                                            remediationLeads.map(m => (
                                                                <DropdownMenuItem key={m.id} className="gap-2 text-xs font-medium" onClick={() => handleBulkAssign(m.id)}>
                                                                    <Avatar className="h-4 w-4">
                                                                        <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                                                            {m.full_name[0]}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    {m.full_name}
                                                                </DropdownMenuItem>
                                                            ))
                                                        )}
                                                    </DropdownMenuSubContent>
                                                </DropdownMenuPortal>
                                            </DropdownMenuSub>
                                        )}
                                    </>
                                )}

                                {['admin', 'program_manager', 'security_engineer'].includes(userRole) && (
                                    <>
                                        <DropdownMenuSeparator className="bg-border" />
                                        <DropdownMenuItem 
                                            className="gap-2 text-xs font-bold text-danger focus:text-danger focus:bg-danger/10"
                                            onClick={() => setIsBulkDeleteAlertOpen(true)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" /> Bulk Delete
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>
        </div>

        {/* Table Body */}
        <div className="relative flex-1 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-bg-subtle/50 border-b border-border sticky top-0 z-10">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      className={cn(
                        "text-left px-4 py-3 text-[10px] font-bold text-fg-muted uppercase tracking-widest bg-bg-subtle/50",
                        header.column.getCanSort() && "cursor-pointer select-none hover:text-fg hover:bg-bg-muted/50 transition-colors"
                      )}
                      onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() && (
                          <span className="text-fg text-[8px]">
                            {header.column.getIsSorted() === 'asc' ? '▲' : '▼'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border/50 relative">
              {loading && data.length === 0 ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                        <td className="px-4 py-4"><div className="h-4 w-4 bg-bg-muted rounded" /></td>
                        <td className="px-4 py-4"><div className="h-6 w-12 bg-bg-muted rounded" /></td>
                        <td className="px-4 py-4"><div className="h-10 w-full bg-bg-muted rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-24 bg-bg-muted rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-20 bg-bg-muted rounded" /></td>
                        <td className="px-4 py-4"><div className="h-6 w-24 bg-bg-muted rounded" /></td>
                        <td className="px-4 py-4"><div className="h-6 w-24 bg-bg-muted rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-16 bg-bg-muted rounded" /></td>
                        <td className="px-4 py-4"><div className="h-4 w-8 bg-bg-muted rounded" /></td>
                    </tr>
                  ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-32 text-center">
                      <div className="flex flex-col items-center gap-3">
                          <div className="h-16 w-16 bg-bg-muted rounded-full flex items-center justify-center mb-2">
                            <ShieldAlert className="h-8 w-8 text-fg-disabled opacity-30" />
                          </div>
                          <h4 className="text-lg font-bold text-fg">No findings matched your criteria</h4>
                          <p className="text-fg-muted text-sm max-w-xs mx-auto">Try adjusting your filters or reporting a fresh finding.</p>
                          <Button variant="outline" className="mt-2 border-border" onClick={() => router.push('/findings')}>Reset all filters</Button>
                      </div>
                  </td>
                </tr>
              ) : (
                <>
                  {loading && (
                    <tr className="absolute inset-0 z-10 pointer-events-none">
                      <td colSpan={columns.length} className="p-0 border-0">
                        <div className="flex items-center justify-center py-24">
                          <div className="flex items-center gap-3 bg-panel/90 backdrop-blur-sm border border-border px-6 py-3 rounded-2xl shadow-lg animate-in zoom-in-95 duration-200">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <span className="text-sm font-bold text-fg-muted">Refreshing…</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className={cn(
                        "hover:bg-panel-hover transition-all duration-200 group cursor-pointer border-l-2 border-transparent",
                        loading && "opacity-30 pointer-events-none",
                        row.getIsSelected() ? "bg-primary/[0.03] border-primary" : "hover:border-primary/20"
                    )} onClick={() => router.push(`/findings/${row.original.id}`)}>
                      {row.getVisibleCells().map(cell => (
                        <td 
                            key={cell.id} 
                            className="px-4 py-4"
                            onClick={cell.column.id === 'select' ? (e) => e.stopPropagation() : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="p-4 border-t border-border bg-bg-subtle/30 flex items-center justify-between">
            <div className="text-xs text-fg-muted font-medium">
                Showing <span className="text-fg font-bold">{data.length}</span> of{' '}
                <span className="text-fg font-bold">
                  {totalCount >= 0 ? totalCount.toLocaleString() : '?'}
                </span>{' '}
                total findings
            </div>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-fg-disabled tracking-widest">Rows</span>
                    <Select
                        value={limitParam.toString()}
                        onValueChange={(val) => updateURL({ limit: val })}
                    >
                        <SelectTrigger className="h-8 w-[70px] text-xs border-border bg-bg">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-panel border-border min-w-[70px]">
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 w-8 p-0 border-border"
                    disabled={pageParam <= 1 || loading}
                    onClick={() => updateURL({ page: (pageParam - 1).toString() })}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1">
                    {pageNumbers.map((p, i) => {
                        if (p === 'ellipsis') {
                            return (
                                <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-fg-disabled font-bold">
                                    …
                                </span>
                            )
                        }
                        return (
                            <Button
                                key={p}
                                variant={pageParam === p ? "default" : "ghost"}
                                size="sm"
                                className={cn("h-8 w-8 p-0 text-xs font-bold", pageParam !== p && "text-fg-muted hover:text-fg")}
                                onClick={() => updateURL({ page: p.toString() })}
                            >
                                {p}
                            </Button>
                        )
                    })}
                </div>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 w-8 p-0 border-border"
                    disabled={pageParam >= Math.ceil(totalCount / limitParam) || loading}
                    onClick={() => updateURL({ page: (pageParam + 1).toString() })}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
      </div>

      {/* New Finding Modal */}
      <FindingForm
        open={isFormOpen}
        onOpenChange={(open) => {
            setIsFormOpen(open)
            if (!open) setSelectedFinding(null)
        }}
        projects={projects}
        members={members}
        initialData={memoizedInitialData}
        onSuccess={fetchData}
      />

      {/* Bulk Delete Alert */}
      <AlertDialog open={isBulkDeleteAlertOpen} onOpenChange={setIsBulkDeleteAlertOpen}>
        <AlertDialogContent className="bg-panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-danger flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Bulk Delete Findings?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-fg-muted">
              Are you sure you want to delete <strong>{selectedRowIds.length}</strong> findings? 
              This action is permanent and will remove all technical details, history, and evidence.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction 
                onClick={handleBulkDelete}
                className="bg-danger text-white hover:bg-danger/90"
                disabled={isProcessing}
            >
                {isProcessing ? "Deleting..." : "Purge Findings"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Delete Alert */}
      <AlertDialog open={isSingleDeleteAlertOpen} onOpenChange={setIsSingleDeleteAlertOpen}>
        <AlertDialogContent className="bg-panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-danger flex items-center gap-2">
                <AlertCircle className="h-5 w-5" /> Delete Finding?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-fg-muted">
              You are about to delete this vulnerability report. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction 
                onClick={handleSingleDelete}
                className="bg-danger text-white hover:bg-danger/90"
                disabled={isProcessing}
            >
                {isProcessing ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
