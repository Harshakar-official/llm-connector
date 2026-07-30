import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getAllowedProjectIds } from "@/lib/utils/security-guard"

export async function GET() {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 400 })

    const allowedProjectIds = await getAllowedProjectIds()
    const safeProjectIds =
      allowedProjectIds.length > 0
        ? allowedProjectIds
        : ["00000000-0000-0000-0000-000000000000"]

    let query = supabase
      .from("projects")
      .select("id, name, project_type, status")
      .eq("org_id", profile.org_id)
      .eq("is_archived", false)
      .order("name", { ascending: true })

    if (profile.role !== "admin") {
      query = query.in("id", safeProjectIds)
    }

    const { data: projects, error } = await query
    if (error) throw error

    return NextResponse.json({ projects: projects || [] })
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 })
  }
}