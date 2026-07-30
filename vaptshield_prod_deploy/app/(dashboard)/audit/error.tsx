"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

export default function AuditError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Audit error:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
      <div className="bg-danger/10 p-4 rounded-full">
        <AlertTriangle className="h-10 w-10 text-danger" />
      </div>
      <h1 className="text-xl font-semibold text-fg">Audit Log Failed to Load</h1>
      <p className="text-sm text-fg-muted text-center max-w-md">
        {error.message || "An unexpected error occurred while loading audit logs. Please try again."}
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 text-sm font-medium text-fg border border-border rounded-md px-4 py-2 hover:bg-panel-hover transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Try Again
      </button>
    </div>
  )
}