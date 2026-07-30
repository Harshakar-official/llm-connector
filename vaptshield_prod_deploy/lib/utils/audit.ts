import { getBrowserClient } from "@/lib/supabase/client"

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
  | "project.created"
  | "project.updated"
  | "project.archived"
  | "project.deleted"
  | "project.member_added"
  | "project.member_removed"
  | "finding.created"
  | "finding.updated"
  | "finding.deleted"
  | "finding.status_changed"
  | "scan.started"
  | "scan.completed"
  | "scan.failed"
  | "docker.spawned"
  | "docker.killed"
  | "report.generated"
  | "report.exported"
  | "settings.updated"
  | "org.updated"
  | "stripe.payment"
  | "kali.ai_parse_complete"
  | "kali.parse_failed"
  | "kali.vulns_auto_created"
  | "kali.parse_complete"
  | "scanner.parse_error"
  | "scanner.parse"
  | "clipboard.import"
  | string

type AuditEntry = {
  action: AuditAction
  resource_type?: string
  resource_id?: string
  old_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
}

export async function createAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const supabase = getBrowserClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single()

    await supabase.from("audit_log").insert({
      org_id: profile?.org_id || null,
      actor_id: user.id,
      action: entry.action,
      resource_type: entry.resource_type || null,
      resource_id: entry.resource_id || null,
      old_value: entry.old_value || null,
      new_value: entry.new_value || null,
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
    })
  } catch (err) {
    console.error("Failed to write audit log:", err)
  }
}

export type { AuditAction, AuditEntry }