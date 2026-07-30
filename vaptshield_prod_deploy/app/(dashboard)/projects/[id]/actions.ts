"use server"

import { z } from "zod"
import { getServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const assignMembersSchema = z.object({
  project_id: z.string().uuid(),
  member_ids: z.array(z.string().uuid()),
})

export async function assignProjectMembers(data: z.infer<typeof assignMembersSchema>) {
  try {
    const validation = assignMembersSchema.safeParse(data)
    if (!validation.success) {
      return { success: false, error: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') }
    }

    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Not authenticated")
    }

    // Verify permission
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin" && profile.role !== "program_manager") {
      throw new Error("Permission denied")
    }

    // Verify project belongs to org
    const { data: project } = await supabase
      .from("projects")
      .select("org_id")
      .eq("id", validation.data.project_id)
      .single()

    if (!project || project.org_id !== profile.org_id) {
      throw new Error("Project not found")
    }

    // Delete existing members
    await supabase
      .from("project_members")
      .delete()
      .eq("project_id", validation.data.project_id)

    // Insert new members
    if (validation.data.member_ids.length > 0) {
      const memberRecords = validation.data.member_ids.map((memberId) => ({
        project_id: validation.data.project_id,
        profile_id: memberId,
        role_in_project: "engineer",
        assigned_by: user.id,
      }))

      const { error: insertError } = await supabase
        .from("project_members")
        .insert(memberRecords)

      if (insertError) {
        console.error("addTeamMembers: Insert failed", insertError.message)
        return { success: false, error: "Failed to add team members" }
      }
    }

    revalidatePath(`/projects/${validation.data.project_id}`)

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}