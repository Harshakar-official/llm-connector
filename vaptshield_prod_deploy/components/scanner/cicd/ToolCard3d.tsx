"use client"

import { motion } from "framer-motion"

interface ToolStatus {
  status: "idle" | "running" | "passed" | "failed"
  label: string
  count: number
}

interface ToolCard3dProps {
  icon: React.ReactNode
  name: string
  accent: string
  status?: ToolStatus
}

export default function ToolCard3d({ icon, name, accent, status }: ToolCard3dProps) {
  const isRunning = status?.status === "running"
  const isFailed = status?.status === "failed"
  const isPassed = status?.status === "passed"
  const isIdle = status?.status === "idle" || !status

  const statusBg = isFailed ? "bg-severity-critical/10 border-severity-critical/30" :
    isPassed ? "bg-success/10 border-success/30" :
    isRunning ? "bg-primary/10 border-primary/30" :
    "bg-bg-muted border-border"

  const statusText = isFailed ? "Vulnerability Found" :
    isPassed ? "Pass / No Vulnerability Found" :
    isRunning ? "Scanning..." :
    "Ready"

  const statusColor = isFailed ? "text-severity-critical" :
    isPassed ? "text-success" :
    isRunning ? "text-primary" :
    "text-fg-disabled"

  return (
    <motion.div
      className="relative"
      style={{ perspective: "800px" }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <motion.div
        className="border border-border rounded-md overflow-hidden bg-panel"
        style={{ transformStyle: "preserve-3d" }}
        whileHover={{ rotateY: 5, translateZ: 8 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        <div className={`px-4 py-3 border-b border-border flex items-center gap-2.5 ${accent.includes("bg-") ? accent : "bg-bg-muted"}`}>
          <div className="w-7 h-7 rounded-md flex items-center justify-center bg-black/10">
            {icon}
          </div>
          <span className="text-sm font-semibold text-white">{name}</span>
          {!isIdle && (
            <div className={`ml-auto ${isRunning ? 'animate-pulse' : ''}`}>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${statusBg}`}>
                {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                {isFailed && <span className="w-1.5 h-1.5 rounded-full bg-severity-critical" />}
                {isPassed && <span className="w-1.5 h-1.5 rounded-full bg-success" />}
                {status?.count > 0 && <span className="font-bold">{status.count}</span>}
              </span>
            </div>
          )}
        </div>
        <div className="p-5 flex flex-col items-center justify-center gap-2 min-h-[100px]">
          <div className={`text-lg font-semibold text-center ${statusColor} ${isRunning ? 'animate-pulse' : ''}`}>
            {status && status.count > 0 && isFailed && (
              <span className="block text-3xl font-bold mb-1">{status.count}</span>
            )}
            {statusText}
          </div>
          {isIdle && (
            <p className="text-[11px] text-fg-subtle text-center">Waiting for scan to start...</p>
          )}
          {isFailed && status?.count > 0 && (
            <p className="text-[11px] text-fg-muted text-center">{status.count} finding{status.count !== 1 ? 's' : ''} detected</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}