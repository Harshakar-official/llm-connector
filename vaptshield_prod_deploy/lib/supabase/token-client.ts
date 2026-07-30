import { createServerClient } from "@supabase/ssr"

/**
 * Creates a Supabase client using an explicitly provided access token.
 * Useful for server-to-server callbacks where cookies are not available.
 */
export function getSupabaseWithToken(accessToken: string) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {
          // Read-only in this context
        },
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  )
}
