"use server"

import { getServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

/**
 * Z+ SECURITY: Update User Notification Preferences
 */
export async function updateNotificationPrefsAction(preferences: Record<string, boolean>) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: "Authentication required" }

    const { error } = await supabase
      .from("profiles")
      .update({
        notification_preferences: preferences,
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id)

    if (error) throw error

    revalidatePath("/settings")
    return { success: true }
  } catch (error: any) {
    console.error("updateNotificationPrefsAction error:", error)
    return { success: false, error: error.message || "Failed to update preferences" }
  }
}

/**
 * Z+ SECURITY: Update Profile Information
 */
export async function updateProfileAction(data: { full_name: string }) {
    try {
      const supabase = await getServerClient()
      const { data: { user } } = await supabase.auth.getUser()
  
      if (!user) return { success: false, error: "Authentication required" }
  
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id)
  
      if (error) throw error
  
      revalidatePath("/settings")
      revalidatePath("/profile")
      return { success: true }
    } catch (error: any) {
      console.error("updateProfileAction error:", error)
      return { success: false, error: error.message || "Failed to update profile" }
    }
  }
