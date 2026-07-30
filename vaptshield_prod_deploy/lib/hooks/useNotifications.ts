"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { getBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "./useAuth"
import { useSounds } from "./useSounds"
import { useLeaderElection } from "./useLeaderElection"
import { toast } from "sonner"

export interface Notification {
  id: string
  title: string
  message: string
  type: string
  is_read: boolean
  link?: string | null
  created_at: string
}

const NOTIF_BC_CHANNEL = "vaptshield-notifications"
const POLL_INTERVAL_MS = 15_000 // Safety-net poll every 15s

/**
 * useNotifications — Multi-tab aware notification hook.
 *
 * Uses shared leader election (useLeaderElection) so only ONE tab opens a
 * Supabase Realtime channel for notifications. The leader broadcasts
 * INSERT/UPDATE events to all other tabs via BroadcastChannel, eliminating
 * duplicate WebSocket connections across tabs.
 *
 * Z+ ENTERPRISE HARDENING:
 * - 15-second polling safety net ensures notifications appear even if
 *   Realtime WebSocket misses an event (network blip, reconnect gap, etc.)
 * - Leader election with stale-key recovery: if the leader key is orphaned
 *   from a crashed tab, a 30s TTL check reclaims leadership.
 */
export function useNotifications() {
  const { profile } = useAuth()
  const { playSound } = useSounds()
  const router = useRouter()
  const { isLeader } = useLeaderElection("notifications")
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const broadcastRef = useRef<BroadcastChannel | null>(null)
  const lastKnownIdRef = useRef<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return
    const supabase = getBrowserClient()
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20)

    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter((n: { is_read: boolean }) => !n.is_read).length)
      // Track latest notification ID for polling diff detection
      if (data.length > 0) {
        lastKnownIdRef.current = data[0].id
      }
    }
    setLoading(false)
  }, [profile?.id])

  // Initialize BroadcastChannel once (shared across all effects)
  useEffect(() => {
    broadcastRef.current = new BroadcastChannel(NOTIF_BC_CHANNEL)
    return () => broadcastRef.current?.close()
  }, [])

  // All tabs: listen for broadcast messages from the leader
  useEffect(() => {
    if (!profile?.id) return

    const performLogout = async () => {
        const supabase = getBrowserClient()
        await supabase.auth.signOut()
        toast.error("Security Alert", { description: "Your permissions have been modified. Please log in again." })
        router.push('/login')
    }

    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data
      if (type === "NOTIF_INSERT") {
        const newNotif = payload as Notification
        console.log(`[useNotifications] Received broadcast notification: ${newNotif.title}`)
        
        // Z+ SECURITY: Handle Force Logout for follower tabs
        if (newNotif.type === 'role_changed') {
            performLogout()
            return
        }

        setNotifications(prev => {
          // Deduplicate: don't add if already present
          if (prev.some(n => n.id === newNotif.id)) return prev
          return [newNotif, ...prev.slice(0, 19)]
        })
        setUnreadCount(prev => prev + 1)
        if (profile?.notification_sound) {
          console.log(`[useNotifications] Playing sound for broadcast...`)
          playSound('notification')
        }
      } else if (type === "NOTIF_UPDATE") {
        fetchNotifications()
      }
    }

    broadcastRef.current?.addEventListener("message", handleMessage)
    return () => {
      broadcastRef.current?.removeEventListener("message", handleMessage)
    }
  }, [profile?.id, profile?.notification_sound, playSound, fetchNotifications, router])

  // Leader: open Supabase Realtime channel + broadcast to other tabs
  useEffect(() => {
    console.log(`[useNotifications] Init. Profile: ${profile?.id}, isLeader: ${isLeader}`)
    if (!profile?.id || !isLeader) return

    const supabase = getBrowserClient()

    const performLogout = async () => {
        console.log(`[useNotifications] !!! FORCING LOGOUT NOW !!!`)
        try {
            await supabase.auth.signOut()
            console.log(`[useNotifications] Sign out successful`)
        } catch (e) {
            console.error(`[useNotifications] Sign out failed:`, e)
        }
        toast.error("Security Alert", { description: "Your permissions have been modified. Please log in again." })
        router.push('/login')
    }

    // Initial fetch when becoming leader
    fetchNotifications()

    const channelName = `user-notifs-${profile.id.substring(0, 8)}`
    console.log(`[useNotifications] Subscribing to channel: ${channelName}`)

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload: any) => {
          const newNotif = payload.new as Notification
          console.log(`[useNotifications] REALTIME RECEIVED: ${newNotif.type} - ${newNotif.title}`)
          
          // Z+ SECURITY: Handle Force Logout if notification is 'role_changed'
          if (newNotif.type === 'role_changed') {
            console.log(`[useNotifications] ROLE CHANGE DETECTED. Broadcasting and logging out...`)
            broadcastRef.current?.postMessage({ type: "NOTIF_INSERT", payload: newNotif })
            performLogout()
            return
          }

          setNotifications(prev => {
            if (prev.some(n => n.id === newNotif.id)) return prev
            return [newNotif, ...prev.slice(0, 19)]
          })
          setUnreadCount(prev => prev + 1)
          if (profile?.notification_sound) {
            playSound('notification')
          }

          toast.info(newNotif.title, {
            description: newNotif.message,
            action: (newNotif as any).link ? {
              label: "View",
              onClick: () => router.push((newNotif as any).link!)
            } : undefined,
          })

          broadcastRef.current?.postMessage({ type: "NOTIF_INSERT", payload: newNotif })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          fetchNotifications()
          broadcastRef.current?.postMessage({ type: "NOTIF_UPDATE" })
        }
      )
      .subscribe((status: string) => {
        // On reconnection, refetch to catch any missed notifications
        if (status === "SUBSCRIBED") {
          fetchNotifications()
        }
      })

    // Z+ SAFETY NET: Poll every 15s to catch any notifications missed by Realtime
    const pollInterval = setInterval(() => {
      fetchNotifications()
    }, POLL_INTERVAL_MS)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [profile?.id, isLeader, profile?.notification_sound, playSound, fetchNotifications])

  // Non-leader tabs: fetch on mount + poll as safety net
  useEffect(() => {
    if (!profile?.id || isLeader) return
    fetchNotifications()

    // Z+ SAFETY NET: Non-leader tabs also poll to catch missed broadcasts
    const pollInterval = setInterval(() => {
      fetchNotifications()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(pollInterval)
  }, [profile?.id, isLeader, fetchNotifications])

  return { notifications, unreadCount, loading }
}
