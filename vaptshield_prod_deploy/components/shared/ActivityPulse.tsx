"use client"

import { useEffect, useRef } from "react"
import { updateUserPulseAction } from "@/lib/supabase/presence-actions"
import { usePathname } from "next/navigation"

/**
 * Z+ SECURITY: Activity Pulse Component
 * This is a silent client component that tracks user activity and 
 * notifies the server. It uses a combination of timed heartbeats 
 * and event-based triggers to maintain a 'last_seen' audit trail.
 */
export function ActivityPulse() {
    const pathname = usePathname()
    const lastPulseRef = useRef<number>(0)
    const PULSE_INTERVAL = 3 * 60 * 1000 // 3 minutes
    const DEBOUNCE_TIME = 30 * 1000 // 30 seconds between event-triggered pulses

    const sendPulse = async () => {
        const now = Date.now()
        // Only send pulse if the interval has passed
        if (now - lastPulseRef.current < DEBOUNCE_TIME) return
        
        lastPulseRef.current = now
        await updateUserPulseAction()
    }

    useEffect(() => {
        // 1. Send immediate pulse on mount/route change
        sendPulse()

        // 2. Set up recurring heartbeat every 3 mins
        const interval = setInterval(sendPulse, PULSE_INTERVAL)

        // 3. Listen for user activity (keyboard, touch)
        const handleActivity = () => sendPulse()

        window.addEventListener("keydown", handleActivity, { passive: true })
        window.addEventListener("touchstart", handleActivity, { passive: true })

        return () => {
            clearInterval(interval)
            window.removeEventListener("keydown", handleActivity)
            window.removeEventListener("touchstart", handleActivity)
        }
    }, [pathname])

    // This component renders nothing
    return null
}
