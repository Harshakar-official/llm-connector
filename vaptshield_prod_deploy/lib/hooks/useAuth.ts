"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { getBrowserClient } from "@/lib/supabase/client"
import type { Profile, Organization } from "@/lib/supabase/types"
import type { User } from "@supabase/supabase-js"

export interface AuthState {
  user: User | null
  profile: Profile | null
  organization: Organization | null
  loading: boolean
  error: string | null
  isAuthenticated: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    organization: null,
    loading: true,
    error: null,
    isAuthenticated: false,
  })

  // Track mounted state to prevent updates after unmount
  const mountedRef = useRef(true)
  const cachedOrgRef = useRef<Organization | null>(null)
  const orgFetchPromise = useRef<Promise<void> | null>(null)

  const fetchAuth = useCallback(async (forceOrgFetch = false) => {
    const supabase = getBrowserClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!mountedRef.current) return

    if (!user) {
      cachedOrgRef.current = null
      setState({
        user: null,
        profile: null,
        organization: null,
        loading: false,
        error: null,
        isAuthenticated: false,
      })
      return
    }

    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (!mountedRef.current) return

    if (profileError) {
      cachedOrgRef.current = null
      setState({
        user,
        profile: null,
        organization: null,
        loading: false,
        error: profileError.message,
        isAuthenticated: true,
      })
      return
    }

    // ─── OPTIMIZED ORG FETCH ───
    // Only fetch if org_id changed, force fetch requested, or no cache exists
    const shouldFetchOrg = profile?.org_id && (
        forceOrgFetch || 
        !cachedOrgRef.current || 
        cachedOrgRef.current.id !== profile.org_id
    )

    if (shouldFetchOrg && profile?.org_id) {
        // Prevent concurrent duplicate fetches
        if (!orgFetchPromise.current) {
            orgFetchPromise.current = (async () => {
                const { data: org } = await supabase
                    .from("organizations")
                    .select("*")
                    .eq("id", profile.org_id!)
                    .single()
                cachedOrgRef.current = org
                orgFetchPromise.current = null
            })()
        }
        await orgFetchPromise.current
    } else if (!profile?.org_id) {
        cachedOrgRef.current = null
    }

    if (!mountedRef.current) return

    setState({
      user,
      profile,
      organization: cachedOrgRef.current,
      loading: false,
      error: null,
      isAuthenticated: true,
    })
  }, [])

  useEffect(() => {
    mountedRef.current = true

    fetchAuth()

    // Listen for auth changes
    const supabase = getBrowserClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string) => {
      // Re-fetch org only on SIGNED_IN. TOKEN_REFRESHED/USER_UPDATED use cache.
      const shouldForceOrg = event === "SIGNED_IN"
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        fetchAuth(shouldForceOrg)
      }
    })

    // Listen for cross-component profile updates
    function handleProfileUpdated() {
      fetchAuth(false)
    }
    
    // Listen for organization updates (e.g. name change in settings)
    function handleOrgUpdated() {
        fetchAuth(true) // Force re-fetch org data
    }

    window.addEventListener("profile-updated", handleProfileUpdated)
    window.addEventListener("vaptshield:org-updated", handleOrgUpdated)

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
      window.removeEventListener("profile-updated", handleProfileUpdated)
      window.removeEventListener("vaptshield:org-updated", handleOrgUpdated)
    }
  }, [fetchAuth])

  return { ...state, refetch: (forceOrg = false) => fetchAuth(forceOrg) }
}
