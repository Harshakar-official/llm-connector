"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw, Download, Rocket, Plus } from "lucide-react"
import { useState } from "react"
import { DashboardStats } from "./StatCards"
import { Alert } from "./LatestAlertsTable"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface DashboardHeaderProps {
  orgName: string
  dateRangeText: string
  stats?: DashboardStats
  alerts?: Alert[]
  showGettingStarted?: boolean
}

export function DashboardHeader({ orgName, dateRangeText, stats, alerts, showGettingStarted }: DashboardHeaderProps) {
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => setIsRefreshing(false), 800) // slight delay to show animation
  }

  const handleExport = () => {
    if (!stats) {
      toast.error("No data available to export")
      return
    }

    try {
      // Proper CSV escaping: wrap fields containing commas, quotes, or newlines
      const escapeCSV = (val: string): string => {
        const str = String(val ?? "")
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      // Create CSV Content
      const rows = [
        ["VAPTShield Security Report"],
        ["Organization", orgName],
        ["Date Range", dateRangeText],
        ["Generated At", new Date().toLocaleString()],
        [],
        ["SUMMARY STATS"],
        ["Metric", "Value"],
        ["Total Projects", stats.totalProjects],
        ["Critical Findings", stats.criticalFindings],
        ["Successful Scans", stats.successfulScans],
        ["Failed Scans", stats.failedScans],
        [],
      ]

      if (alerts && alerts.length > 0) {
        rows.push(["LATEST CRITICAL/HIGH ALERTS"])
        rows.push(["Date", "Project", "Finding", "Severity"])
        alerts.forEach(alert => {
          rows.push([
            new Date(alert.created_at).toLocaleDateString(),
            escapeCSV(alert.project_name),
            escapeCSV(alert.title),
            alert.severity.toUpperCase()
          ])
        })
      }

      const csvContent = "data:text/csv;charset=utf-8,"
        + rows.map(e => e.join(",")).join("\n")

      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", `VAPTShield_Report_${orgName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success("Report Exported Successfully", {
        description: "Your dashboard overview has been downloaded as a CSV."
      })
    } catch (error) {
      console.error("Export error:", error)
      toast.error("Export failed", {
        description: "An error occurred while generating the report."
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-fg uppercase italic">Security <span className="text-primary">Overview</span></h1>
          <p className="mt-1 text-sm text-fg-muted font-medium">
            Project status for <span className="text-fg font-bold">{orgName}</span> · {dateRangeText}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-fg-muted border border-border rounded-xl px-4 py-2 hover:bg-panel-hover hover:text-white transition-all active:scale-95 shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-primary rounded-xl px-4 py-2 hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20"
          >
            <Download className="h-3.5 w-3.5" />
            Export Data
          </button>
        </div>
      </div>

      {showGettingStarted && (
        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 animate-in slide-in-from-top-4 duration-500">
           <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 shadow-inner text-primary">
              <Rocket className="h-8 w-8" />
           </div>
           <div className="flex-1 text-center md:text-left space-y-1">
              <h3 className="text-lg font-bold text-fg">Ready to secure your organization?</h3>
              <p className="text-sm text-fg-muted max-w-[500px]">
                 It looks like you haven't created any projects yet. Start by adding a security target to run automated scans and track vulnerabilities.
              </p>
           </div>
           <div className="shrink-0 w-full md:w-auto">
              <Link href="/projects">
                <Button className="w-full h-11 px-6 rounded-xl gap-2 font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95">
                   <Plus className="h-4 w-4" />
                   Create First Project
                </Button>
              </Link>
           </div>
        </div>
      )}
    </div>
  )
}
