import { getServerClient } from "@/lib/supabase/server"
import { headers } from "next/headers"

type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "user.invited"
  | "user.invite_accepted"
  | "user.role_changed"
  | "user.deactivated"
  | "user.reactivated"
  | "user.removed"
  | "delete_user"
  | "project.created"
  | "project.updated"
  | "project.archived"
  | "project.restore_project"
  | "project.deleted"
  | "project.member_added"
  | "project.member_removed"
  | "finding.created"
  | "finding.updated"
  | "finding.deleted"
  | "finding.status_changed"
  | "finding.comment_added"
  | "finding.poc_attached"
  | "finding.remediated"
  | "scan.started"
  | "scan.completed"
  | "scan.failed"
  | "docker.spawned"
  | "docker.killed"
  | "report.generated"
  | "report.exported"
  | "report.deleted"
  | "settings.updated"
  | "org.updated"
  | "create_organization"
  | "transfer_ownership"
  | "stripe.payment"
  | string // fallback

type AuditEntry = {
  org_id?: string | null
  actor_id?: string | null
  action: AuditAction
  resource_type?: string
  resource_id?: string
  old_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  // Optional manual overrides, but usually auto-captured
  ip_address?: string | null
  user_agent?: string | null
}

/**
 * Z+ SECURITY: Server-side Audit Logging with Automatic IP/UA Capture.
 * Replaces direct `supabase.from("audit_log").insert()` calls.
 */
export async function logAudit(entryOrEntries: AuditEntry | AuditEntry[], customClient?: any): Promise<void> {
  try {
    const supabase = customClient || await getServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const headersList = await headers()
    const ipAddress = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                      headersList.get("x-real-ip") || 
                      null
    const userAgent = headersList.get("user-agent") || null

    const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries]
    
    // Enrich all entries with IP/UA and fetch org_id if missing
    let userOrgId: string | null = null
    const needsOrgId = user && entries.some(e => e.org_id === undefined)
    
    if (needsOrgId && user) {
        const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single()
        userOrgId = profile?.org_id || null
    }

    const enrichedEntries = entries.map(entry => ({
      org_id: entry.org_id !== undefined ? entry.org_id : userOrgId,
      actor_id: entry.actor_id || user?.id || null,
      action: entry.action,
      resource_type: entry.resource_type || null,
      resource_id: entry.resource_id || null,
      old_data: entry.old_value || null,
      new_value: entry.new_value || null,
      ip_address: entry.ip_address || ipAddress,
      user_agent: entry.user_agent || userAgent,
    }))

    await supabase.from("audit_log").insert(enrichedEntries)
  } catch (err) {
    console.error("Failed to write audit log:", err)
  }
}
