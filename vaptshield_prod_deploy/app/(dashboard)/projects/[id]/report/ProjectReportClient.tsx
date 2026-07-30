"use client"

import { useState } from "react"
import { 
    FileText, 
    Download, 
    Loader2, 
    Sparkles, 
    Clock,
    FileType,
    Trash2,
    User,
    Plus,
    RefreshCw
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { deleteReport } from "../../../findings/actions"

interface Report {
    id: string
    title: string
    status: string
    docx_url: string | null
    pdf_url: string | null
    created_at: string
    total_findings: number
    version: number
    report_content?: { findings?: any[] } | null
    profiles?: { full_name: string; avatar_url: string | null }
}

interface ProjectReportClientProps {
    projectId: string
    projectName: string
    canGenerate: boolean
    canDownload: boolean
    initialReports: Report[]
}

export function ProjectReportClient({ 
    projectId, 
    projectName, 
    canGenerate, 
    canDownload,
    initialReports 
}: ProjectReportClientProps) {
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [progress, setProgress] = useState(0)
    const [reports, setReports] = useState<Report[]>(initialReports)

    const handleDelete = async (id: string) => {
        setIsDeleting(id)
        const toastId = toast.loading("Purging report artifact and clearing storage...")
        try {
            const res = await deleteReport(id)
            if (!res.success) throw new Error(res.error)

            setReports(reports.filter(r => r.id !== id))
            toast.success("Report purged successfully.", { id: toastId })
        } catch (err: any) {
            toast.error(err.message || "Failed to delete report", { id: toastId })
        } finally {
            setIsDeleting(null)
        }
    }

    const downloadFile = (path: string | null, type: string) => {
        if (!path) {
            toast.error(`${type} file is not available for this report yet.`)
            return
        }
        window.open(`/api/reports/download?path=${path}`, '_blank')
    }

    const handleGenerate = async () => {
        setIsGenerating(true)
        setProgress(0)
        
        // Simulated progress bar for better UX
        const interval = setInterval(() => {
            setProgress(p => {
                if (p >= 95) return p
                // slow down as it gets closer to 100
                const increment = p > 80 ? 1 : (p > 50 ? 5 : 10)
                return Math.min(95, p + increment)
            })
        }, 800)

        const toastId = toast.loading("Synthesizing and generating artifacts...")
        try {
            const genRes = await fetch("/api/reports/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId })
            })
            const genData = await genRes.json()
            if (!genRes.ok) throw new Error(genData.error || "Failed to generate report")

            clearInterval(interval)
            setProgress(100)
            toast.success("Report generated successfully!", { id: toastId })
            
            // Instantly show the new report
            if (genData.report) {
                setReports(prev => [genData.report, ...prev])
            }
            
            // Optional: reset progress after a delay
            setTimeout(() => {
                setIsGenerating(false)
                setProgress(0)
            }, 1000)
            
        } catch (error: any) {
            clearInterval(interval)
            setIsGenerating(false)
            setProgress(0)
            toast.error(error.message || "Generation failed", { id: toastId })
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-fg italic uppercase">
                        VAPT <span className="text-primary">Reports</span>
                    </h1>
                    <p className="text-xs text-fg-muted uppercase font-bold tracking-widest mt-1">Project Artifacts: {projectName}</p>
                </div>
                {canGenerate && (
                    <div className="flex gap-3">
                        <Button 
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-6 shadow-lg shadow-primary/20 h-11 relative overflow-hidden"
                        >
                            {isGenerating && (
                                <div className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                            )}
                            <span className="relative z-10 flex items-center">
                                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                {isGenerating ? `Generating (${progress}%)` : "Generate Final Report"}
                            </span>
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                    {reports.length === 0 ? (
                        <Card className="bg-panel/40 border-dashed border-border p-12 text-center flex flex-col items-center justify-center rounded-3xl">
                            <div className="h-16 w-16 bg-bg rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                                <FileText className="h-8 w-8 text-fg-disabled" />
                            </div>
                            <h3 className="text-lg font-bold text-fg italic">No Reports Finalized Yet</h3>
                            <p className="text-sm text-fg-muted max-w-xs mt-2">
                                Click 'Generate Final Report' to create your first PDF and DOCX artifact.
                            </p>
                            {canGenerate && (
                                <Button variant="ghost" className="mt-4 text-primary font-bold" onClick={handleGenerate} disabled={isGenerating}>
                                    {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} 
                                    Generate Report
                                </Button>
                            )}
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted/60 mb-4">Finalized Artifacts</h3>
                            {reports.map((report) => (
                                <Card key={report.id} className="bg-panel border-border hover:border-primary/30 transition-all duration-300 rounded-2xl group overflow-hidden">
                                    <div className="p-5 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 bg-bg rounded-xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                                <FileType className="h-6 w-6 text-primary" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-sm flex items-center gap-2">
                                                    {report.title}
                                                    <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase">v{report.version || 1}.0</span>
                                                </h4>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                                                    <span className="text-[10px] font-bold text-fg-muted flex items-center gap-1">
                                                        <Clock className="h-3 w-3" /> 
                                                        {new Date(report.created_at).toLocaleDateString()} at {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-fg-muted flex items-center gap-1">
                                                        <User className="h-3 w-3" /> {report.profiles?.full_name || "System"}
                                                    </span>
                                                    <Badge variant="outline" className="text-[9px] h-4 font-black uppercase tracking-tighter bg-success/5 text-success border-success/20">
                                                        {report.total_findings || report.report_content?.findings?.length || 0} Findings
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {report.docx_url && (
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    disabled={!canDownload}
                                                    onClick={() => downloadFile(report.docx_url, "DOCX")}
                                                    className="h-9 rounded-lg font-bold text-[10px] uppercase border-primary/20 hover:border-primary hover:bg-primary/5"
                                                >
                                                    <FileType className="h-3.5 w-3.5 mr-2" />
                                                    Download DOCX
                                                </Button>
                                            )}
                                            {report.pdf_url && (
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    disabled={!canDownload}
                                                    onClick={() => downloadFile(report.pdf_url, "PDF")}
                                                    className="h-9 rounded-lg font-bold text-[10px] uppercase border-primary/20 hover:border-primary hover:bg-primary/5"
                                                >
                                                    <FileType className="h-3.5 w-3.5 mr-2" />
                                                    Download PDF
                                                </Button>
                                            )}

                                            {canGenerate && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            disabled={isDeleting === report.id}
                                                            className="h-9 w-9 rounded-lg text-fg-muted hover:text-danger hover:bg-danger/5"
                                                        >
                                                            {isDeleting === report.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent className="bg-panel border-border rounded-2xl">
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle className="text-xl font-bold italic uppercase text-danger">Purge Artifact?</AlertDialogTitle>
                                                            <AlertDialogDescription className="text-fg-muted text-sm leading-relaxed">
                                                                This action will strictly delete the report record and its associated artifacts from secure storage. This cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter className="mt-4 gap-2">
                                                            <AlertDialogCancel className="rounded-xl border-border hover:bg-bg-subtle text-[10px] font-black uppercase tracking-widest">Cancel</AlertDialogCancel>
                                                            <AlertDialogAction 
                                                                onClick={() => handleDelete(report.id)}
                                                                className="rounded-xl bg-danger hover:bg-danger/90 text-white text-[10px] font-black uppercase tracking-widest"
                                                            >
                                                                Purge Permanently
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <Card className="bg-panel border-border rounded-2xl p-6 relative overflow-hidden shadow-sm">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                            <FileText className="h-12 w-12 text-primary" />
                        </div>
                        <h3 className="font-black text-[10px] uppercase tracking-widest text-primary mb-4 italic">Automated Reporting</h3>
                        <p className="text-xs leading-relaxed text-fg-muted">
                            Your report is fully automated based on the latest findings. Click <span className="text-fg font-bold">Generate Final Report</span> to instantly create polished PDF and DOCX artifacts for your clients.
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    )
}
