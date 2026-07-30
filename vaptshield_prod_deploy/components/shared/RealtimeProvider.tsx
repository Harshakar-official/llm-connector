"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { getBrowserClient } from "@/lib/supabase/client"
import { usePresence } from "@/lib/hooks/usePresence"
import { useLeaderElection } from "@/lib/hooks/useLeaderElection"
import { toast } from "sonner"
import { useSounds } from "@/lib/hooks/useSounds"

/**
 * RealtimeProvider - The "Heartbeat" of VAPTShield
 *
 * Uses shared leader election (useLeaderElection) so only ONE tab opens a
 * Supabase Realtime channel for global DB changes. The leader broadcasts
 * events to all other tabs via BroadcastChannel.
 *
 * Event types:
 *  - DB_CHANGE: Full page refresh needed (org_quotas, projects, project_members)
 *  - PRESENCE_UPDATE: Lightweight targeted update (profiles last_seen/presence_status)
 *    Dispatches a custom DOM event instead of full router.refresh() to avoid
 *    heavy re-renders on every 30s heartbeat.
 *  - FORCE_LOGOUT: Security event to sign out a specific user
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = getBrowserClient()
  const { playSound } = useSounds()
  const { isLeader } = useLeaderElection("global-sync")
  const broadcastRef = useRef<BroadcastChannel | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  
  // Initialize Global Presence Tracking
  usePresence()

  useEffect(() => {
    async function getSession() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id || null)
    }
    getSession()
  }, [supabase])

  useEffect(() => {
    const channelName = "vaptshield-global-sync"
    
    broadcastRef.current = new BroadcastChannel(channelName)

    broadcastRef.current.onmessage = (event) => {
      if (event.data.type === "DB_CHANGE") {
        router.refresh()
      }
      if (event.data.type === "PRESENCE_UPDATE") {
        // Lightweight targeted update — dispatch custom event instead of full router.refresh()
        // Only components that display presence indicators (UsersClient, ActiveDot) listen for this
        window.dispatchEvent(new CustomEvent("vaptshield:presence-update", {
          detail: event.data.payload
        }))
      }
      if (event.data.type === "FORCE_LOGOUT" && event.data.userId === userId) {
        handleForceLogout()
      }
    }

    const handleForceLogout = async () => {
        toast.error("Permissions Updated", {
            description: "Your role has been changed. Logging out to refresh permissions...",
            duration: 5000
        })
        playSound('notification')
        setTimeout(async () => {
            await supabase.auth.signOut()
            localStorage.removeItem("vaptshield-terminal-store")
            window.location.href = "/login"
        }, 3000)
    }

    return () => {
      broadcastRef.current?.close()
    }
  }, [router, userId, playSound, supabase])

  useEffect(() => {
    if (!isLeader) return

    const globalChannel = supabase
      .channel("global-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "org_quotas" },
        () => {
          broadcastRef.current?.postMessage({ type: "DB_CHANGE" })
          router.refresh()
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        () => {
          // Presence heartbeats update last_seen/presence_status every 30s.
          // Use PRESENCE_UPDATE instead of DB_CHANGE to avoid full router.refresh()
          // on every heartbeat across all tabs. Only presence-aware components
          // (UsersClient, ActiveDot) respond to this lightweight event.
          broadcastRef.current?.postMessage({ type: "PRESENCE_UPDATE" })
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => {
          broadcastRef.current?.postMessage({ type: "DB_CHANGE" })
          router.refresh()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_members" },
        () => {
          broadcastRef.current?.postMessage({ type: "DB_CHANGE" })
          router.refresh()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vulnerabilities" },
        () => {
          broadcastRef.current?.postMessage({ type: "DB_CHANGE" })
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(globalChannel)
    }
  }, [isLeader, supabase, router])

  return <>{children}</>
}
