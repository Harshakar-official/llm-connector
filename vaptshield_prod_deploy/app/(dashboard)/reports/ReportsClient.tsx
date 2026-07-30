"use client"

import { useState } from "react"
import { FileText, Download, FileArchive, Search, ShieldCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface Report {
  id: string
  title: string
  status: string
  created_at: string
  docx_url: string | null
  pdf_url: string | null
  project_id: string
  version: number
  projects?: { name: string }
  profiles?: { full_name: string; avatar_url: string | null }
}

export default function ReportsClient({ initialReports, role }: { initialReports: Report[], role: string }) {
  const [search, setSearch] = useState("")

  const filteredReports = initialReports.filter(r => 
    r.title.toLowerCase().includes(search.toLowerCase()) || 
    r.projects?.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleDownload = (url: string) => {
    window.open(`/api/reports/download?path=${encodeURIComponent(url)}`, "_blank")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-fg-muted" />
          <Input
            placeholder="Search reports, projects or authors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Link href="/projects">
          <Button variant="outline">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Generate New Report (via Projects)
          </Button>
        </Link>
      </div>

      <div className="bg-panel border border-border rounded-md shadow-sm overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="p-8 text-center text-fg-muted">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No reports found.</p>
            {search && <p className="text-sm mt-1">Try adjusting your search query.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-fg-muted uppercase bg-bg border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Report Title / Version</th>
                  <th className="px-6 py-4 font-medium">Project</th>
                  <th className="px-6 py-4 font-medium">Generated Date & Time</th>
                  <th className="px-6 py-4 font-medium">Author</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-bg/50 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                            <FileArchive className="h-4 w-4 text-primary" />
                            {report.title}
                        </div>
                        <span className="ml-7 text-[10px] font-mono text-fg-subtle uppercase">
                            v{report.version || 1}.0
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-fg-muted">
                      {report.projects?.name || "Unknown Project"}
                    </td>
                    <td className="px-6 py-4 text-fg-muted whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium text-fg">{new Date(report.created_at).toLocaleDateString()}</span>
                        <span className="text-[10px] font-mono opacity-60">{new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <span className="text-xs text-fg-muted">{report.profiles?.full_name || "System"}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success border border-success/20">
                        {report.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {report.docx_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(report.docx_url!)}
                            className="h-8"
                          >
                            <Download className="h-4 w-4 mr-1.5" />
                            DOCX
                          </Button>
                        )}
                        {report.pdf_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(report.pdf_url!)}
                            className="h-8"
                          >
                            <Download className="h-4 w-4 mr-1.5" />
                            PDF
                          </Button>
                        )}
                        {!report.docx_url && !report.pdf_url && (
                           <span className="text-xs text-fg-muted">Processing...</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
