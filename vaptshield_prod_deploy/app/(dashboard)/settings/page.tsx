export const dynamic = "force-dynamic"
import { getServerClient } from "@/lib/supabase/server"
import { SettingsClient } from "./SettingsClient"
import { redirect } from "next/navigation"

export default async function SettingsPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role, notification_preferences")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login")

  if (profile.role === "super_admin") {
    redirect("/super-admin/settings")
  }

  return <SettingsClient profile={profile} />
}