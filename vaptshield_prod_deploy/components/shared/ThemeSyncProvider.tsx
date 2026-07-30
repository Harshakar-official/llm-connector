"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useThemeSync } from "@/lib/hooks/useThemeSync"

interface ThemeSyncContextValue {
  persistTheme: (theme: string) => Promise<void>
}

const ThemeSyncContext = createContext<ThemeSyncContextValue>({
  persistTheme: async () => {},
})

export function useThemePersist() {
  return useContext(ThemeSyncContext)
}

/**
 * Provider that syncs theme between DB and next-themes.
 * - On mount: reads profile.theme_preference → sets next-themes (DB → localStorage)
 * - Exposes persistTheme() for toggles to save to DB
 */
export function ThemeSyncProvider({ children }: { children: ReactNode }) {
  const { persistTheme } = useThemeSync()

  return (
    <ThemeSyncContext.Provider value={{ persistTheme }}>
      {children}
    </ThemeSyncContext.Provider>
  )
}