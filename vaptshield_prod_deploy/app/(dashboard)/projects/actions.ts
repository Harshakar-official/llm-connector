"use server"

import { z } from "zod"
import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { getSafeSession } from "@/lib/utils/security-guard"
import { checkQuota } from "@/lib/utils/quota-engine"

// ─── Z+ Injection Attack Hardening ───
// Strips HTML/script tags, trims whitespace, blocks dangerous patterns
const sanitizeText = (v: string) =>
  v
    .trim()
    .replace(/<[^>]*>/g, "")           // strip HTML tags (XSS)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") // strip control chars
    .replace(/\\/g, "\\\\")            // escape backslashes
    .replace(/'/g, "''")              // escape single quotes (SQL)

const dangerousPattern = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|EXEC|EXECUTE|SCRIPT|ONERROR|ONLOAD)\b|<script|javascript:|on\w+\s*=)/i

const projectSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(200, "Name must be under 200 characters")
    .trim()
    .refine(v => !dangerousPattern.test(v), "Name contains potentially dangerous content")
    .transform(sanitizeText),
  description: z
    .string()
    .max(5000, "Description must be under 5000 characters")
    .trim()
    .refine(v => !dangerousPattern.test(v), "Description contains potentially dangerous content")
    .transform(sanitizeText)
    .optional()
    .nullable(),
  project_type: z.enum(["web_app", "mobile_app", "api", "network", "cloud", "red_team", "thick_client"]),
  scope: z
    .string()
    .max(5000, "Scope must be under 5000 characters")
    .trim()
    .refine(v => !dangerousPattern.test(v), "Scope contains potentially dangerous content")
    .transform(sanitizeText)
    .optional()
    .nullable(),
  methodology: z
    .string()
    .max(200, "Methodology must be under 200 characters")
    .trim()
    .optional()
    .nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
}).refine(
  (data) => {
    // Z+ Date Validation: end_date must be on or after start_date
    if (data.start_date && data.end_date) {
      return new Date(data.end_date) >= new Date(data.start_date)
    }
    return true
  },
  { message: "End date must be on or after start date", path: ["end_date"] }
)

export type FormValues = z.infer<typeof projectSchema>

const updateSchema = projectSchema.extend({
  id: z.string().uuid(),
  status: z.enum(["planning", "active", "in_review", "completed"]).optional(),
})

const archiveSchema = z.object({
  id: z.string().uuid(),
})

const deleteSchema = z.object({
  id: z.string().uuid(),
})

export async function createProject(data: z.infer<typeof projectSchema>) {
  try {
    // ─── Step 1: Validate Input ───
    const validation = projectSchema.safeParse(data)
    if (!validation.success) {
      return { success: false, error: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') }
    }

    // ─── Step 2: Authenticate & Get Session ───
    const { orgId, user, role, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) {
      console.error("createProject: Auth failed", { authError, hasOrgId: !!orgId, hasUser: !!user })
      return { success: false, error: authError || "Unauthorized" }
    }

    console.log("createProject: Auth OK", { orgId, userId: user.id, role })

    // ─── Step 3: Permission Check ───
    if (role === "guest" || role === "security_engineer") {
        return { success: false, error: "Permission denied" }
    }

    // ─── Step 4: Quota Check ───
    let quota;
    try {
      quota = await checkQuota(orgId, 'projects')
    } catch (quotaErr) {
      const msg = extractErrorMessage(quotaErr)
      console.error("createProject: Quota check threw:", msg, quotaErr)
      return { success: false, error: `Quota check failed: ${msg}` }
    }

    if (!quota.allowed) {
        return { success: false, error: quota.error || "Project limit reached" }
    }

    console.log("createProject: Quota OK", { current: quota.current, limit: quota.limit })

    // ─── Step 5: Insert Project ───
    const supabase = await getServerClient()

    const insertPayload = {
        org_id: orgId,
        name: validation.data.name,
        description: validation.data.description,
        project_type: validation.data.project_type,
        scope: validation.data.scope,
        methodology: validation.data.methodology,
        start_date: validation.data.start_date ? new Date(validation.data.start_date) : null,
        end_date: validation.data.end_date ? new Date(validation.data.end_date) : null,
        created_by: user.id,
        status: "planning",
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      console.error("createProject: Insert failed", error.message)
      return { success: false, error: "Project could not be created" }
    }

    if (!project) {
      console.error("createProject: Insert returned no data")
      return { success: false, error: "Project was not created — no data returned" }
    }

    console.log("createProject: Project created", { projectId: project.id })

    // ─── Step 6: Auto-assign Creator to Project Members ───
    // Z+ SECURITY: Use the standard client. The RLS policy "members_insert" 
    // now allows PMs to assign themselves to projects they create.
    const { error: memberError } = await supabase.from("project_members").insert({
        project_id: project.id,
        profile_id: user.id,
        role_in_project: "manager",
        assigned_by: user.id
    })

    if (memberError) {
        console.error("createProject: Auto-assign failed:", memberError)
    } else {
        console.log("createProject: Auto-assign OK")
    }

    // ─── Step 7: Audit Log (non-blocking) ───
    try {
      await logAudit({
          org_id: orgId,
          actor_id: user.id,
          action: "create_project",
          ip_address: (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || (await headers()).get("x-real-ip") || null,
          user_agent: (await headers()).get("user-agent") || null,
          resource_type: "project",
          resource_id: project.id,
          new_value: { name: project.name }
      })
    } catch (auditError) {
      console.error("createProject: Audit log failed (non-blocking):", auditError)
    }

    revalidatePath("/projects")

    return { success: true, data: project }
  } catch (error) {
    const message = extractErrorMessage(error)
    console.error("createProject error:", message, error)
    return { success: false, error: message }
  }
}

// ─── Z+ Robust Error Message Extraction ───
// Handles Error, PostgrestError, plain objects, strings, and null/undefined
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === "string") return obj.message
    if (typeof obj.code === "string" && typeof obj.details === "string") {
      return `${obj.code}: ${obj.details}`
    }
    try { return JSON.stringify(err) } catch { /* fall through */ }
  }
  return "Something went wrong"
}

export async function updateProject(data: z.infer<typeof updateSchema>) {
  try {
    const validation = updateSchema.safeParse(data)
    if (!validation.success) {
      return { success: false, error: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') }
    }

    const { orgId, user, role, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) return { success: false, error: authError || "Unauthorized" }

    if (role === "guest" || role === "security_engineer") {
        return { success: false, error: "Permission denied" }
    }

    const supabase = await getServerClient()

    // PMs can only edit their own projects (server-side enforcement)
    if (role === "program_manager") {
      const projectCheck = await supabase
        .from("projects")
        .select("created_by")
        .eq("org_id", orgId)
        .eq("id", validation.data.id)
        .single() as { data: { created_by: string } | null, error: unknown }

      if (!projectCheck.data || projectCheck.data.created_by !== user.id) {
        return { success: false, error: "Access Denied: Program Managers can only edit their own projects" }
      }
    }

    // Verify project belongs to org using org_id filter
    const updatePayload: Record<string, unknown> = {
        name: validation.data.name,
        description: validation.data.description,
        project_type: validation.data.project_type,
        scope: validation.data.scope,
        methodology: validation.data.methodology,
        start_date: validation.data.start_date ? new Date(validation.data.start_date) : null,
        end_date: validation.data.end_date ? new Date(validation.data.end_date) : null,
    }

    // Z+ ENTERPRISE: Allow status updates (planning → active → in_review → completed)
    if (validation.data.status) {
        updatePayload.status = validation.data.status
    }

    const { data: project, error } = await supabase
        .from("projects")
        .update(updatePayload)
        .eq("org_id", orgId)
        .eq("id", validation.data.id)
        .select()
        .single()

    if (error) {
      console.error("updateProject: Update failed", error.message)
      return { success: false, error: "Project could not be updated" }
    }

    // Audit Log
    await logAudit({
        org_id: orgId,
        actor_id: user.id,
        action: "update_project",
        resource_type: "project",
        resource_id: project.id,
        new_value: { name: project.name }
    })

    revalidatePath("/projects")
    revalidatePath(`/projects/${validation.data.id}`)

    return { success: true, data: project }
  } catch (error) {
    console.error("updateProject: Unexpected error", error)
    return { success: false, error: "Project could not be updated" }
  }
}

export async function archiveProject(data: z.infer<typeof archiveSchema>) {
  try {
    const validation = archiveSchema.safeParse(data)
    if (!validation.success) {
      return { success: false, error: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') }
    }

    const { orgId, user, role, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) return { success: false, error: authError || "Unauthorized" }

    // Z+ Permission Logic: Guests are strictly denied.
    // Admins have global power. PMs and SEs have scoped power.
    if (role === "guest") {
        return { success: false, error: "Permission denied" }
    }

    const supabase = await getServerClient()

    // ─── Scoped Permission Enforcement ───
    if (role === "security_engineer") {
        // SE can only archive projects they are a member of
        const { data: isMember } = await supabase
            .from("project_members")
            .select("id")
            .eq("project_id", validation.data.id)
            .eq("profile_id", user.id)
            .maybeSingle()

        if (!isMember) {
            return { success: false, error: "Access Denied: You must be a project member to manage its status" }
        }
    } else if (role === "program_manager") {
      // PMs can only archive their own projects (or ones they created)
      const projectCheck = await supabase
        .from("projects")
        .select("created_by")
        .eq("org_id", orgId)
        .eq("id", validation.data.id)
        .single() as { data: { created_by: string } | null, error: unknown }

      if (!projectCheck.data || projectCheck.data.created_by !== user.id) {
        return { success: false, error: "Access Denied: Program Managers can only archive their own projects" }
      }
    }

    // ─── Step 4: Toggle Archive Status ───
    // Get current state to toggle
    const { data: currentProject, error: fetchError } = await supabase
        .from("projects")
        .select("is_archived")
        .eq("org_id", orgId)
        .eq("id", validation.data.id)
        .maybeSingle()

    if (fetchError) {
      console.error("toggleArchive: Fetch failed", fetchError.message)
      return { success: false, error: "Archive operation failed" }
    }
    if (!currentProject) {
        return { success: false, error: "Project not found or access denied." }
    }

    const { data: project, error: updateError } = await supabase
        .from("projects")
        .update({ is_archived: !currentProject.is_archived })
        .eq("org_id", orgId)
        .eq("id", validation.data.id)
        .select()
        .maybeSingle()

    if (updateError || !project) {
        console.error("toggleArchive: Update failed", updateError?.message)
        return { success: false, error: "Archive operation failed" }
    }

    // Audit Log
    await logAudit({
        org_id: orgId,
        actor_id: user.id,
        action: project.is_archived ? "archive_project" : "restore_project",
        resource_type: "project",
        resource_id: project.id
    })

    revalidatePath("/projects")

    return { success: true, data: project }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export async function deleteProject(data: z.infer<typeof deleteSchema>) {
  try {
    const validation = deleteSchema.safeParse(data)
    if (!validation.success) {
      return { success: false, error: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') }
    }

    const { orgId, user, role, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) return { success: false, error: authError || "Unauthorized" }

    // Only admin and program_manager can delete
    if (role !== "admin" && role !== "program_manager") {
      return { success: false, error: "You don't have permission to delete projects" }
    }

    const supabase = await getServerClient()

    // ─── Z+ STORAGE PURGE: Cleanup physical files before DB deletion ───
    try {
        // 1. Fetch all PoC attachments for all findings in this project
        const { data: attachments } = await supabase
            .from("vuln_attachments")
            .select("file_url")
            .eq("project_id", validation.data.id) // Migration 049 added project_id to vuln_attachments for this reason
        
        if (attachments && attachments.length > 0) {
            const pocPaths = attachments.map(a => a.file_url)
            await supabase.storage.from("poc-files").remove(pocPaths)
        }

        // 2. Fetch all Report artifacts (PDF/DOCX)
        const { data: reports } = await supabase
            .from("reports")
            .select("docx_url, pdf_url")
            .eq("project_id", validation.data.id)
        
        if (reports && reports.length > 0) {
            const reportPaths = reports.flatMap(r => [r.docx_url, r.pdf_url].filter(Boolean) as string[])
            if (reportPaths.length > 0) {
                await supabase.storage.from("reports").remove(reportPaths)
            }
        }
    } catch (purgeError) {
        console.error("[deleteProject] Physical storage purge error (non-blocking):", purgeError)
    }

    // PMs can only delete their own projects (server-side enforcement)
    if (role === "program_manager") {
      const project = await supabase
        .from("projects")
        .select("created_by")
        .eq("org_id", orgId)
        .eq("id", validation.data.id)
        .single() as { data: { created_by: string } | null, error: unknown }

      if (!project.data || project.data.created_by !== user.id) {
        return { success: false, error: "Access Denied: Program Managers can only delete their own projects" }
      }
    }

    const { error } = await supabase
        .from("projects")
        .delete()
        .eq("org_id", orgId)
        .eq("id", validation.data.id)

    if (error) {
      console.error("deleteProject: Delete failed", error.message)
      return { success: false, error: "Project could not be deleted" }
    }

    // Audit Log
    await logAudit({
        org_id: orgId,
        actor_id: user.id,
        action: "delete_project",
        resource_type: "project",
        resource_id: validation.data.id
    })

    revalidatePath("/projects")

    return { success: true }
  } catch (error) {
    console.error("deleteProject: Unexpected error", error)
    return { success: false, error: "Project could not be deleted" }
  }
}

export async function assignMembers(projectId: string, memberIds: string[]) {
  const opStart = Date.now()
  console.log(`[assignMembers] Starting operation for project ${projectId}`, { memberIds })

  try {
    const { orgId, user, role, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) return { success: false, error: authError || "Unauthorized" }

    // 1. Strict Permission Check
    if (role === "guest" || role === "security_engineer") {
        return { success: false, error: "Access denied: You don't have permission to manage team members" }
    }

    const supabase = await getServerClient()

    // 2. Fetch current members AND all involved profiles to check roles
    const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("org_id", orgId)
    
    const roleMap = new Map(allProfiles?.map(p => [p.id, p.role]) || [])

    // Get current project members
    const { data: currentMembers } = await supabase
      .from("project_members")
      .select("profile_id")
      .eq("project_id", projectId)
    
    const currentMemberIds = new Set(currentMembers?.map(m => m.profile_id) || [])

    // 3. Permission logic for PM
    if (role === "program_manager") {
        // PM MUST be the creator or a current member
        const { data: project } = await supabase
            .from("projects")
            .select("created_by")
            .eq("id", projectId)
            .single()
        
        const isCreator = project?.created_by === user.id
        const isMember = currentMemberIds.has(user.id)

        if (!isCreator && !isMember) {
            console.error(`[assignMembers] PM ${user.id} denied access to project ${projectId}`)
            return { success: false, error: "Access Denied: You must be a project member to manage the team" }
        }
    }

    // 4. Calculate Final List (Z+ SECURITY: Preservation Logic)
    let finalMemberIds = [...memberIds]
    
    if (role === "program_manager") {
        const protectedIds = Array.from(currentMemberIds).filter(id => {
            const r = roleMap.get(id)
            return r === "admin" || r === "program_manager"
        })

        const trulyNewIds = memberIds.filter(id => !currentMemberIds.has(id))
        const hasNewAdmin = trulyNewIds.some(id => roleMap.get(id) === "admin")
        
        if (hasNewAdmin) {
            return { success: false, error: "Access Denied: Program Managers cannot assign new Administrators to projects" }
        }

        const mergedIds = new Set([...finalMemberIds, ...protectedIds])
        finalMemberIds = Array.from(mergedIds)
    }

    const newMemberIds = finalMemberIds.filter(id => !currentMemberIds.has(id))
    const removedMemberIds = Array.from(currentMemberIds).filter(id => !finalMemberIds.includes(id))

    // 5. Database Operations
    // 5a. Removal (Unassignment)
    if (removedMemberIds.length > 0) {
        let deletableIds = [...removedMemberIds]
        
        // PMs can only remove SE, Guest and Developer. They cannot remove Admins or other PMs.
        if (role === "program_manager") {
            deletableIds = removedMemberIds.filter(id => {
                const r = roleMap.get(id)
                return r === "security_engineer" || r === "guest" || r === "developer"
            })
        }

        if (deletableIds.length > 0) {
            const { error: deleteError } = await supabase
                .from("project_members")
                .delete()
                .eq("project_id", projectId)
                .in("profile_id", deletableIds)
            
            if (deleteError) {
                console.error("[assignMembers] Delete operation failed:", deleteError)
                return { success: false, error: "Failed to update project members" }
            }
        }
    }

    // 5b. Addition (Upsert)
    if (finalMemberIds.length > 0) {
        let allowedUpsertIds = [...finalMemberIds]
        if (role === "program_manager") {
            allowedUpsertIds = finalMemberIds.filter(id => {
                const r = roleMap.get(id)
                // PM can add SE, Guest, Developer or keep themselves
                return id === user.id || r === "security_engineer" || r === "guest" || r === "developer"
            })
        }

        const insertData = allowedUpsertIds.map(profileId => {
            const userOrgRole = roleMap.get(profileId)
            let projectRole = "engineer"
            
            if (profileId === user.id && role === "program_manager") {
                projectRole = "manager"
            } else if (userOrgRole === "developer") {
                projectRole = "remediator"
            } else if (userOrgRole === "guest") {
                projectRole = "viewer"
            }

            return {
                project_id: projectId,
                profile_id: profileId,
                role_in_project: projectRole,
                assigned_by: user.id,
            }
        })
        
        if (insertData.length > 0) {
            const { error: upsertError } = await supabase
                .from("project_members")
                .upsert(insertData, { onConflict: 'project_id, profile_id' })
            if (upsertError) {
              console.error("[assignMembers] Upsert failed:", upsertError.message)
              return { success: false, error: "Failed to update project members" }
            }
        }
    } else if (role === "admin") {
        // Only admin can completely clear a team
        const { error: clearError } = await supabase.from("project_members").delete().eq("project_id", projectId)
        if (clearError) {
          console.error("[assignMembers] Clear failed:", clearError.message)
          return { success: false, error: "Failed to update project members" }
        }
    }

    // 6. Notifications
    try {
        const { data: projectInfo } = await supabase.from("projects").select("name").eq("id", projectId).single()
        const projectLink = `/projects/${projectId}`
        const allNotifications = []

        if (newMemberIds.length > 0) {
            allNotifications.push(...newMemberIds.map(profileId => ({
                user_id: profileId,
                org_id: orgId,
                title: "New Project Assignment",
                message: `You have been assigned to project: ${projectInfo?.name || 'a project'}`,
                type: "member_assigned" as const,
                link: projectLink,
                is_read: false,
                sound_played: false,
            })))
        }

        if (removedMemberIds.length > 0) {
            allNotifications.push(...removedMemberIds.map(profileId => ({
                user_id: profileId,
                org_id: orgId,
                title: "Project Unassigned",
                message: `You have been removed from project: ${projectInfo?.name || 'a project'}`,
                type: "member_assigned" as const,
                link: projectLink,
                is_read: false,
                sound_played: false,
            })))
        }

        if (allNotifications.length > 0) {
            await supabase.from("notifications").insert(allNotifications)
        }
    } catch (nErr) {
        console.error("[assignMembers] Notification error (silent):", nErr)
    }

    revalidatePath("/projects")
    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error("[assignMembers] CRITICAL ERROR:", error)
    return { success: false, error: (error as Error).message }
  }
}
