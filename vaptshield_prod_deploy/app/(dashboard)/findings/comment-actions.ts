"use server"

import { getServerClient } from "@/lib/supabase/server"
import { getSafeSession } from "@/lib/utils/security-guard"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createNotification } from "@/lib/supabase/notification-actions"

const commentSchema = z.object({
  vuln_id: z.string().uuid(),
  content: z.string().min(1, "Comment cannot be empty").max(2000, "Comment is too long"),
})

const editCommentSchema = z.object({
  comment_id: z.string().uuid(),
  content: z.string().min(1).max(2000),
  vuln_id: z.string().uuid(), // Need for revalidation
})

export async function addComment(data: z.infer<typeof commentSchema>) {
  try {
    const validation = commentSchema.parse(data)
    const { orgId, user, error: authError } = await getSafeSession()
    
    if (authError || !orgId || !user) {
      return { success: false, error: "Unauthorized" }
    }

    const supabase = await getServerClient()

    // ─── RATE LIMITING (Audit Fix #8) ───
    // Limit: Max 10 comments per minute per user
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    const { count: recentComments } = await supabase
        .from("vuln_comments")
        .select("*", { count: 'exact', head: true })
        .eq("author_id", user.id)
        .gte("created_at", oneMinuteAgo)

    if (recentComments !== null && recentComments >= 10) {
        return { success: false, error: "Rate limit exceeded. Please wait a minute before posting more comments." }
    }

    // 1. Insert the comment
    const { data: newComment, error } = await supabase
      .from("vuln_comments")
      .insert({
        vuln_id: validation.vuln_id,
        author_id: user.id,
        content: validation.content,
      })
      .select()
      .single()

    if (error) {
      console.error("[addComment] DB Error:", error)
      return { success: false, error: `Database Error: ${error.message} (${error.code})` }
    }

    // 2. Fetch finding details for notification routing
    const { data: finding } = await supabase
        .from("vulnerabilities")
        .select("assigned_to, found_by, ticket_id, project_id, projects(name)")
        .eq("id", validation.vuln_id)
        .single()

    // 3. Smart Notification: Don't notify the author. 
    // If Dev comments, notify SE (found_by) & PM (assigned_by maybe). If SE comments, notify Dev.
    if (finding) {
        const projectName = (finding.projects as any)?.name || "Unknown Project"
        const targets = new Set<string>()
        if (finding.assigned_to && finding.assigned_to !== user.id) targets.add(finding.assigned_to)
        if (finding.found_by && finding.found_by !== user.id) targets.add(finding.found_by)

        for (const targetId of targets) {
            await createNotification({
                user_id: targetId,
                org_id: orgId,
                title: 'New Message',
                message: `New message on finding ${finding.ticket_id} in ${projectName}`,
                type: 'system',
                group_key: `comment-${validation.vuln_id}`, // Group all comments for this finding
                link: `/findings/${validation.vuln_id}?tab=discussion`
            })
        }
    }

    revalidatePath(`/findings/${validation.vuln_id}`)
    return { success: true, data: newComment }
  } catch (error: any) {
    console.error("[addComment] Error:", error)
    return { success: false, error: error.message || "An unexpected error occurred" }
  }
}

export async function editComment(data: z.infer<typeof editCommentSchema>) {
    try {
        const validation = editCommentSchema.parse(data)
        const { orgId, user, error: authError } = await getSafeSession()
        if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }

        const supabase = await getServerClient()

        // DB RLS enforces the 2-minute rule and author check
        const { error } = await supabase
            .from("vuln_comments")
            .update({ content: validation.content })
            .eq("id", validation.comment_id)
            .eq("author_id", user.id)

        if (error) {
            return { success: false, error: "Failed to edit. Time window may have expired (2 mins)." }
        }

        revalidatePath(`/findings/${validation.vuln_id}`)
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function deleteComment(commentId: string, vulnId: string) {
    try {
        const { orgId, user, error: authError } = await getSafeSession()
        if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }

        const supabase = await getServerClient()

        // DB RLS enforces the 2-minute rule and author check
        const { error } = await supabase
            .from("vuln_comments")
            .delete()
            .eq("id", commentId)
            .eq("author_id", user.id)

        if (error) {
            return { success: false, error: "Failed to delete. Time window may have expired (2 mins)." }
        }

        revalidatePath(`/findings/${vulnId}`)
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}
