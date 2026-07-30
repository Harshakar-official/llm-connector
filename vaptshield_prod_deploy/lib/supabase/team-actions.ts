"use server"

import { revalidatePath } from "next/cache"
import { getServerClient } from "@/lib/supabase/server"
import { getSafeSession } from "@/lib/utils/security-guard"
import { z } from "zod"

/**
 * Z+ SECURITY: Dynamic Teams Server Actions
 * Handles team creation, member management, and project bulk assignment.
 */

const teamSchema = z.object({
  name: z.string().min(2, "Team name must be at least 2 characters"),
  description: z.string().optional().nullable(),
  member_ids: z.array(z.string().uuid()).min(1, "Select at least one team member"),
})

export async function createTeamAction(data: z.infer<typeof teamSchema>) {
  try {
    const { orgId, user, role, error } = await getSafeSession()
    if (error || !orgId || !user) return { success: false, error: "Unauthorized" }

    // RBAC: Only Admin and PM can create teams
    if (role !== 'admin' && role !== 'program_manager') {
      return { success: false, error: "Access Denied: Insufficient permissions to create teams." }
    }

    const validation = teamSchema.safeParse(data)
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0].message }
    }

    const supabase = await getServerClient()

    // 1. Create Team (Atomic)
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        org_id: orgId,
        name: validation.data.name,
        description: validation.data.description,
        created_by: user.id
      })
      .select()
      .single()

    if (teamError) {
      if (teamError.code === '23505') return { success: false, error: "A team with this name already exists in your organization." }
      return { success: false, error: "Failed to create team." }
    }

    // 2. Add Members
    const membersData = validation.data.member_ids.map(profileId => ({
      team_id: team.id,
      profile_id: profileId,
      added_by: user.id
    }))

    const { error: membersError } = await supabase
      .from("team_members")
      .insert(membersData)

    if (membersError) {
      console.error("Team members insertion error:", membersError)
      // We don't rollback the team creation yet, but inform the user
      return { success: false, error: "Team created but failed to add some members." }
    }

    revalidatePath("/organization")
    return { success: true, teamId: team.id }

  } catch (err) {
    console.error("createTeamAction critical error:", err)
    return { success: false, error: "Internal server error" }
  }
}

export async function deleteTeamAction(teamId: string) {
  try {
    const { orgId, user, role, error } = await getSafeSession()
    if (error || !orgId || !user) return { success: false, error: "Unauthorized" }

    const supabase = await getServerClient()

    // Ownership check via RLS, but we add explicit server-side check for better errors
    if (role !== 'admin') {
        const { data: team } = await supabase
            .from("teams")
            .select("created_by")
            .eq("id", teamId)
            .single()
        
        if (team?.created_by !== user.id) {
            return { success: false, error: "You can only delete teams you created." }
        }
    }

    const { error: deleteError } = await supabase
      .from("teams")
      .delete()
      .eq("id", teamId)
      .eq("org_id", orgId)

    if (deleteError) throw deleteError

    revalidatePath("/organization")
    return { success: true }
  } catch (err) {
    console.error("deleteTeamAction error:", err)
    return { success: false, error: "Failed to delete team." }
  }
}

/**
 * Update Team (name, description, members)
 * Z+ SECURITY: Admin can edit any team; PM can only edit teams they created.
 */
export async function updateTeamAction(teamId: string, data: z.infer<typeof teamSchema>) {
  try {
    const { orgId, user, role, error } = await getSafeSession()
    if (error || !orgId || !user) return { success: false, error: "Unauthorized" }

    // RBAC: Only Admin and PM can update teams
    if (role !== 'admin' && role !== 'program_manager') {
      return { success: false, error: "Access Denied: Insufficient permissions to update teams." }
    }

    const validation = teamSchema.safeParse(data)
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0].message }
    }

    const supabase = await getServerClient()

    // Ownership check for PMs
    if (role !== 'admin') {
      const { data: team } = await supabase
        .from("teams")
        .select("created_by")
        .eq("id", teamId)
        .single()
      
      if (team?.created_by !== user.id) {
        return { success: false, error: "You can only edit teams you created." }
      }
    }

    // 1. Update team name and description
    const { error: updateError } = await supabase
      .from("teams")
      .update({
        name: validation.data.name,
        description: validation.data.description,
      })
      .eq("id", teamId)
      .eq("org_id", orgId)

    if (updateError) {
      if (updateError.code === '23505') return { success: false, error: "A team with this name already exists." }
      return { success: false, error: "Failed to update team." }
    }

    // 2. Sync members: fetch current, compute diff
    const { data: currentMembers } = await supabase
      .from("team_members")
      .select("profile_id")
      .eq("team_id", teamId)

    const currentIds = new Set((currentMembers || []).map(m => m.profile_id))
    const newIds = new Set(validation.data.member_ids)

    // Members to add
    const toAdd = validation.data.member_ids.filter(id => !currentIds.has(id))
    // Members to remove
    const toRemove = [...currentIds].filter(id => !newIds.has(id))

    if (toAdd.length > 0) {
      const addData = toAdd.map(profileId => ({
        team_id: teamId,
        profile_id: profileId,
        added_by: user.id
      }))
      await supabase.from("team_members").insert(addData)
    }

    if (toRemove.length > 0) {
      await supabase
        .from("team_members")
        .delete()
        .eq("team_id", teamId)
        .in("profile_id", toRemove)
    }

    // 3. Notify newly added members (RLS policy allows this via standard client)
    if (toAdd.length > 0) {
      try {
        const notifications = toAdd.map(profileId => ({
          user_id: profileId,
          org_id: orgId,
          title: "Added to Team",
          message: `You have been added to the functional team: ${validation.data.name}.`,
          type: "member_assigned",
          is_read: false,
          sound_played: false,
        }))
        const { error: notifError } = await supabase.from("notifications").insert(notifications)
        if (notifError) console.error("Failed to send team update notifications:", notifError)
      } catch (e) {
        console.warn("Failed to send team update notifications:", e)
      }
    }

    revalidatePath("/organization")
    return { success: true }

  } catch (err) {
    console.error("updateTeamAction critical error:", err)
    return { success: false, error: "Internal server error" }
  }
}

/**
 * Bulk Assign Team to Project
 */
export async function assignTeamToProjectAction(teamId: string, projectId: string) {
  try {
    const { orgId, user, role, error } = await getSafeSession()
    if (error || !orgId || !user) return { success: false, error: "Unauthorized" }

    // RBAC: Only Admin and PM can assign members
    if (role !== 'admin' && role !== 'program_manager') {
      return { success: false, error: "Access Denied: Insufficient permissions." }
    }

    const supabase = await getServerClient()

    // 1. Fetch team members with their roles
    const { data: teamMembers, error: fetchError } = await supabase
      .from("team_members")
      .select(`
        profile_id,
        profiles!team_members_profile_id_fkey(role)
      `)
      .eq("team_id", teamId)

    if (fetchError || !teamMembers) return { success: false, error: "Failed to fetch team members." }

    // 2. Role Hierarchy Guard: PMs cannot assign Admins
    let filteredMembers = teamMembers
    if (role === 'program_manager') {
        filteredMembers = teamMembers.filter(tm => (tm.profiles as unknown as { role: string }).role !== 'admin')
    }

    // 3. Prepare project_members data
    const projectMembersData = filteredMembers.map(tm => ({
      project_id: projectId,
      profile_id: tm.profile_id,
      assigned_by: user.id,
      source_team_id: teamId
    }))

    if (projectMembersData.length === 0) {
        return { success: false, error: "No valid members to assign (PMs cannot assign Admins)." }
    }

    // 4. Upsert into project_members (ignore duplicates)
    const { error: upsertError } = await supabase
      .from("project_members")
      .upsert(projectMembersData, { onConflict: 'project_id,profile_id' })

    if (upsertError) {
      console.error("Bulk assignment error:", upsertError)
      return { success: false, error: "Failed to assign some team members to the project." }
    }

    revalidatePath(`/projects/${projectId}`)
    
    // ─── ENTERPRISE NOTIFICATIONS (use admin client to bypass RLS) ───
    try {
        const { data: project } = await supabase
            .from("projects")
            .select("name")
            .eq("id", projectId)
            .single()
        
        const projectName = project?.name || "a project"
        const projectLink = `/projects/${projectId}`

        const notifications = filteredMembers.map(tm => ({
            user_id: tm.profile_id,
            org_id: orgId,
            title: "Project Assigned (Team)",
            message: `Your functional team has been assigned to project: ${projectName}.`,
            type: "member_assigned",
            link: projectLink,
            is_read: false,
            sound_played: false,
        }))

        const { error: notifError } = await supabase
            .from("notifications")
            .insert(notifications)

        if (notifError) {
            console.error("Failed to insert team assignment notifications:", notifError)
        }
    } catch (e) {
        console.warn("Failed to send team assignment notifications:", e)
    }

    return { success: true, count: teamMembers.length }

  } catch (err) {
    console.error("assignTeamToProjectAction error:", err)
    return { success: false, error: "Internal server error" }
  }
}
