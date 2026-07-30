"use client"

import { useAuth } from "./useAuth"
import type { Role } from "@/lib/supabase/types"

/**
 * Z+ SECURITY: Reactive Role Hook
 * Returns the current user's role. Automatically updates on auth changes
 * or profile updates by leveraging the centralized useAuth hook.
 */
export function useRole() {
  const { profile, loading, error } = useAuth()
  
  return { 
    role: (profile?.role as Role) ?? null, 
    loading, 
    error 
  }
}
