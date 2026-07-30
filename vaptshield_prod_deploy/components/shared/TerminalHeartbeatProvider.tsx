"use client"

import { useEffect, useRef } from "react"
import { useTerminalStore } from "@/lib/hooks/useTerminalStore"
import { toast } from "sonner"

/**
 * Global terminal heartbeat provider.
 * Rendered once in the dashboard layout — continues sending heartbeats
 * even when user navigates away from the terminal page.
 * Also reconnects to active sessions on mount (e.g. page refresh).
 */
export function TerminalHeartbeatProvider() {
  const { session, setSession, isRunning } = useTerminalStore()
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttempted = useRef(false)

  // Reconnect to active session on mount (page refresh or navigation back)
  // Always fetch from API to get fresh wsUrl (not stale persisted store)
  useEffect(() => {
    if (reconnectAttempted.current) return
    reconnectAttempted.current = true

    fetch("/api/terminal/active")
      .then((r) => r.json())
      .then((data) => {
        if (data.active && data.session) {
          const s = data.session
          setSession({
            containerId: s.containerId,
            sessionId: s.sessionId,
            wsUrl: s.wsUrl.replace(/127\.0\.0\.1|localhost/gi, window.location.hostname),
            success: true,
          })
        } else {
          // No active session — clear stale persisted session
          const store = useTerminalStore.getState()
          if (store.session) store.setSession(null)
        }
      })
      .catch(() => {})
  }, [setSession])

  // Heartbeat: runs as long as there's an active session
  useEffect(() => {
    if (!session?.containerId) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      return
    }

    const ping = () => {
      fetch(`/api/terminal/heartbeat/${session.containerId}`, { method: "POST" })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            if (res.status === 410 || err.error === 'Session expired' || res.status === 404) {
              const store = useTerminalStore.getState()
              if (store.session) store.setSession(null)
              toast.error("Session expired and was auto-terminated")
            }
          }
        })
        .catch(() => {})
    }

    // Send heartbeat every 30 seconds
    heartbeatRef.current = setInterval(ping, 30000)

    // Also send one immediately
    ping()

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }
  }, [session?.containerId])

  // This component renders nothing — it's purely for side effects
  return null
}
