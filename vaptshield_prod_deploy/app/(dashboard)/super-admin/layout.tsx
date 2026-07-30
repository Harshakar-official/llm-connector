import { notFound, redirect } from "next/navigation"
import { getServerClient } from "@/lib/supabase/server"

/**
 * SUPER ADMIN LAYOUT GUARD
 * Strict server-side authorization for the /super-admin path.
 * This runs in the Node.js runtime, making it highly stable.
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await getServerClient()

  // 1. Auth Guard
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // 2. Role Guard
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    notFound() // Hide existence of super-admin from unauthorized users
  }

  return <>{children}</>
}
