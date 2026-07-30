"use server"

import { getServerClient } from "@/lib/supabase/server"

/**
 * Z+ SECURITY: Activity Heartbeat
 * This action silently updates the user's 'last_seen' timestamp and 
 * sets their status to 'active'. This is critical for security audits 
 * and session management.
 */
export async function updateUserPulseAction() {
    try {
        const supabase = await getServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) return { success: false, error: "Not authenticated" }

        // Update last_seen and presence_status
        // RLS policy 'profiles_update_self' ensures only the user can update their own profile
        const { error } = await supabase
            .from("profiles")
            .update({
                last_seen: new Date().toISOString(),
                presence_status: "active",
                updated_at: new Date().toISOString()
            })
            .eq("id", user.id)

        if (error) throw error

        return { success: true }
    } catch (error) {
        console.error("[Pulse] Failed to update heartbeat:", error)
        return { success: false }
    }
}
