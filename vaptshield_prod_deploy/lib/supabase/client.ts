import { createBrowserClient } from "@supabase/ssr"

// Singleton pattern for browser client
let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function getBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    )
  }
  return browserClient
}
