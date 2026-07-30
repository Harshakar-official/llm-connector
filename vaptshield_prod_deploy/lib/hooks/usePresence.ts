"use client"

import { useEffect, useCallback, useRef, useMemo } from "react"
import { getBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "./useAuth"

export function usePresence() {
  const { user } = useAuth()
  // Stable supabase instance - prevents infinite re-render loop
  const supabase = useMemo(() => getBrowserClient(), [])

  // Update presence to active
  const updateActive = useCallback(async () => {
    if (!user) return

    await supabase
      .from("profiles")
      .update({
        last_seen: new Date().toISOString(),
        presence_status: "active",
      })
      .eq("id", user.id)
  }, [user, supabase])

  // Update presence to away
  const updateAway = useCallback(async () => {
    if (!user) return

    await supabase
      .from("profiles")
      .update({
        presence_status: "away",
      })
      .eq("id", user.id)
  }, [user, supabase])

  // Update presence to offline
  const updateOffline = useCallback(async () => {
    if (!user) return

    await supabase
      .from("profiles")
      .update({
        presence_status: "offline",
      })
      .eq("id", user.id)
  }, [user, supabase])

  useEffect(() => {
    if (!user) return

    // Set initial active status
    updateActive()

    // Heartbeat interval - every 30 seconds
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") {
        updateActive()
      }
    }, 30000)

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updateAway()
      } else {
        updateActive()
      }
    }

    // Guard to prevent double-firing: both beforeunload and pagehide may
    // fire on the same tab close. We only send the beacon once.
    let beaconSent = false

    const sendOfflineBeacon = () => {
      if (beaconSent || !user) return
      beaconSent = true
      const payload = JSON.stringify({ userId: user.id })
      navigator.sendBeacon("/api/presence/offline", payload)
    }

    // beforeunload — fires on desktop Chrome/Firefox when tab closes or
    // user navigates away. More reliable than pagehide on desktop.
    const handleBeforeUnload = () => {
      sendOfflineBeacon()
    }

    // pagehide — fires on mobile Safari and as a fallback on desktop.
    // React's useEffect cleanup is NOT guaranteed on browser close, but
    // pagehide IS. We use sendBeacon for fire-and-forget delivery.
    const handlePageHide = () => {
      sendOfflineBeacon()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("pagehide", handlePageHide)

    // Cleanup on unmount (normal navigation / component unmount)
    // NOTE: During tab close, sendOfflineBeacon handles the offline status update.
    return () => {
      clearInterval(heartbeat)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [user, updateActive, updateAway, updateOffline])

  return { updateActive, updateAway, updateOffline }
}