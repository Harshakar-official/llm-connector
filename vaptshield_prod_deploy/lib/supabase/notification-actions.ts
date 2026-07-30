"use server"

import { getServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createNotification(data: {
    user_id: string
    org_id: string
    title: string
    message: string
    type: 'scan_complete' | 'finding_critical' | 'finding_approved' | 'report_ready' | 'invite_received' | 'role_changed' | 'member_assigned' | 'system' | 'finding_resolved' | 'finding_reopened' | 'finding_assigned'
    group_key?: string
    link?: string
}) {
    try {
        const supabase = await getServerClient()

        // ─── Z+ SECURITY: SERVER-SIDE GROUPING (RPC) ───
        // We call the database function which handles existence check and atomic updates
        const { error } = await supabase.rpc('create_grouped_notification_v2', {
            p_user_id: data.user_id,
            p_org_id: data.org_id,
            p_title: data.title,
            p_message: data.message,
            p_type: data.type,
            p_group_key: data.group_key || null,
            p_link: data.link || null
        })

        if (error) throw error

        revalidatePath("/", "layout")
        return { success: true }
    } catch (error) {
        console.error("Error creating notification via RPC:", error)
        return { success: false, error: (error as Error).message }
    }
}

export async function markAsRead(id: string) {
    try {
        const supabase = await getServerClient()
        const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", id)

        if (error) throw error
        return { success: true }
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}

export async function markAllAsRead() {
    try {
        const supabase = await getServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false }

        const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("user_id", user.id)

        if (error) throw error
        return { success: true }
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}

export async function deleteNotification(id: string) {
    try {
        const supabase = await getServerClient()
        const { error } = await supabase
            .from("notifications")
            .delete()
            .eq("id", id)

        if (error) throw error
        return { success: true }
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}
