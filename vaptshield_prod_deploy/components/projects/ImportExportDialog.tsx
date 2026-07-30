"use client"

import { useState, useRef } from "react"
import { Download, Upload, FileSpreadsheet, FileDown, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"

interface ValidationError {
  row: number
  field: string
  message: string
}

interface Props {
  projectId: string
}

export function ImportExportDialog({ projectId }: Props) {
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    errors: ValidationError[]
    total_rows: number
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDownloadTemplate = (format: "csv" | "xlsx") => {
    const a = document.createElement("a")
    a.href = `/api/projects/${projectId}/findings/template?format=${format}`
    a.download = `vulnerability_template.${format}`
    a.click()
    toast.success(`Template downloaded as ${format.toUpperCase()}`)
  }

  const handleExport = async (format: "csv" | "xlsx") => {
    const a = document.createElement("a")
    a.href = `/api/projects/${projectId}/findings/export?format=${format}`
    a.download = `findings_${projectId.slice(0, 8)}.${format}`
    a.click()
    toast.success(`Export started as ${format.toUpperCase()}`)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setResult(null)

    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/projects/${projectId}/findings/import`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Import failed")
        return
      }
      setResult(data)
      if (data.imported > 0) {
        toast.success(`Imported ${data.imported} vulnerabilities`)
        window.location.reload()
      } else if (data.errors?.length > 0) {
        toast.error("No valid rows to import")
      }
    } catch {
      toast.error("Import failed")
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setResult(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 border-border text-xs font-bold uppercase tracking-widest">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Import/Export
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-panel border-border rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tighter italic text-fg flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            Data Transfer
          </DialogTitle>
          <DialogDescription className="text-fg-muted text-sm">
            Import vulnerabilities from CSV/Excel or export your findings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="import" className="mt-2">
          <TabsList className="bg-bg-subtle p-1 rounded-xl border border-border w-full">
            <TabsTrigger value="import" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-panel font-bold text-xs uppercase tracking-widest h-9">
              <Upload className="h-3.5 w-3.5" /> Import
            </TabsTrigger>
            <TabsTrigger value="export" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-panel font-bold text-xs uppercase tracking-widest h-9">
              <Download className="h-3.5 w-3.5" /> Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4 pt-4">
            <div className="bg-bg-subtle rounded-xl border border-border p-4 space-y-3">
              <p className="text-xs text-fg-muted font-medium">
                Download the template, fill in your vulnerability data, then upload the file.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate("csv")} className="gap-2 border-border text-xs font-bold h-8">
                  <FileDown className="h-3.5 w-3.5" /> CSV Template
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate("xlsx")} className="gap-2 border-border text-xs font-bold h-8">
                  <FileDown className="h-3.5 w-3.5" /> Excel Template
                </Button>
              </div>
            </div>

            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="ghost"
                className="w-full h-full min-h-[80px] flex flex-col gap-2"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                {importing ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <Upload className="h-6 w-6 text-fg-muted" />
                )}
                <span className="text-xs font-bold text-fg-muted">
                  {importing ? "Processing..." : "Click to upload CSV or Excel file"}
                </span>
              </Button>
            </div>

            {result && (
              <div className="rounded-xl border p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-fg">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Import complete
                </div>
                <div className="text-xs text-fg-muted space-y-1">
                  <p>Total rows: {result.total_rows}</p>
                  <p>Imported: {result.imported}</p>
                  {result.errors.length > 0 && (
                    <div className="mt-2 p-2 bg-danger/5 rounded-lg border border-danger/10">
                      <p className="text-danger font-bold flex items-center gap-1 mb-1">
                        <AlertCircle className="h-3 w-3" /> {result.errors.length} error(s)
                      </p>
                      {result.errors.slice(0, 5).map((e, i) => (
                        <p key={i} className="text-xs text-fg-muted ml-4">
                          Row {e.row}: {e.field} — {e.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="export" className="space-y-4 pt-4">
            <p className="text-xs text-fg-muted font-medium">
              Export all vulnerabilities in this project as a CSV or Excel file.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => handleExport("csv")} className="gap-2 flex-1 font-bold text-xs h-10">
                <FileDown className="h-4 w-4" /> Export CSV
              </Button>
              <Button onClick={() => handleExport("xlsx")} className="gap-2 flex-1 font-bold text-xs h-10">
                <FileDown className="h-4 w-4" /> Export Excel
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
