"use client"

import { useEffect, useRef, useState } from "react"

/**
 * useLeaderElection — Single shared leader election primitive.
 *
 * All realtime consumers (RealtimeProvider, useNotifications, etc.) MUST
 * use this hook instead of rolling their own localStorage-based leader
 * election. This ensures:
 *
 * 1. Consistent leader key format: `vaptshield-leader:{channel}`
 * 2. Proper cleanup on unmount (releases leadership)
 * 3. Automatic leader transfer via storage events when the leader tab closes
 *
 * @param channel - Unique channel name (e.g. "global-sync", "notifications")
 * @returns { isLeader, leaderKey } — isLeader is true when this tab holds leadership
 */
export function useLeaderElection(channel: string) {
  const leaderKey = `vaptshield-leader:${channel}`
  const [isLeader, setIsLeader] = useState(false)
  const isLeaderRef = useRef(false) // stable ref for cleanup — avoids stale closure

  useEffect(() => {
    const claimLeadership = (): boolean => {
      if (!localStorage.getItem(leaderKey)) {
        localStorage.setItem(leaderKey, Date.now().toString())
        isLeaderRef.current = true
        return true
      }
      return false
    }

    if (claimLeadership()) {
      setIsLeader(true)
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === leaderKey && !e.newValue) {
        // Leader tab closed — try to claim leadership
        if (claimLeadership()) {
          setIsLeader(true)
        }
      }
    }

    window.addEventListener("storage", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
      // Release leadership on unmount so another tab can take over
      if (isLeaderRef.current) {
        localStorage.removeItem(leaderKey)
        isLeaderRef.current = false
      }
    }
  }, [leaderKey])

  return { isLeader, leaderKey }
}