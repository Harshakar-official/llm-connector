"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { useAuth } from "@/lib/hooks/useAuth"
import { getBrowserClient } from "@/lib/supabase/client"

/**
 * Two-way theme sync between next-themes (localStorage) and DB (profiles.theme_preference).
 *
 * On mount: If profile has a theme_preference that differs from current theme,
 *           sync it to next-themes (DB → localStorage). This enables cross-device sync.
 *
 * This hook should be used once in the dashboard layout.
 */
export function useThemeSync() {
  const { profile, user, loading } = useAuth()
  const { theme, setTheme } = useTheme()
  const syncedRef = useRef(false)

  useEffect(() => {
    // Only sync once per session, after auth is loaded
    if (loading || syncedRef.current) return
    if (!profile?.theme_preference) return

    // If DB has a preference and it differs from current, sync DB → localStorage
    if (profile.theme_preference !== theme) {
      setTheme(profile.theme_preference)
    }

    syncedRef.current = true
  }, [loading, profile?.theme_preference, theme, setTheme])

  /**
   * Save theme to DB. Call this whenever theme changes via any toggle.
   */
  async function persistTheme(newTheme: string) {
    if (!user) return
    const supabase = getBrowserClient()
    await supabase
      .from("profiles")
      .update({ theme_preference: newTheme })
      .eq("id", user.id)
  }

  return { persistTheme }
}