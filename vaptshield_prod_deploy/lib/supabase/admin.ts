import { createClient, SupabaseClient } from "@supabase/supabase-js"

// ─── Z+ SECURITY: Admin Client (SERVER ONLY) ───
// This client uses the Service Role Key to bypass RLS.
// It must NEVER be used on the client side or leaked to users.

export const getSupabaseAdmin = (): SupabaseClient | null => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceRoleKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️ Supabase Admin env vars missing. Admin features will fail.")
    }
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
