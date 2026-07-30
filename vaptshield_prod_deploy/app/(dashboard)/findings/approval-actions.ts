"use server"

import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { headers } from "next/headers"
import { getSafeSession, verifyProjectAccess } from "@/lib/utils/security-guard"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const approveSchema = z.object({
  scanFindingId: z.string().uuid(),
})

const rejectSchema = z.object({
  scanFindingId: z.string().uuid(),
  reason: z.string().min(5, "Rejection reason must be at least 5 characters"),
})

/**
 * Z+ SECURITY: AI Normalize & Approve Workflow
 * Mimics high-end security platforms like Snyk/Checkmarx.
 */
export async function approveScanFinding(data: z.infer<typeof approveSchema>) {
  try {
    const { orgId, role, user, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }


    if (role === "guest") return { success: false, error: "Permission denied" }

    const supabase = await getServerClient()

    // 1. Fetch raw scan finding
    const { data: scanFinding, error: fetchError } = await supabase
      .from("scan_findings")
      .select("*")
      .eq("id", data.scanFindingId)
      .eq("org_id", orgId)
      .single()

    if (fetchError || !scanFinding) throw new Error("Scan finding not found")
    if (scanFinding.status === "approved") throw new Error("Already approved")

    // ─── Z+ SECURITY: PROJECT ACCESS GUARD ───
    const { allowed: projectAllowed, error: accessError } = await verifyProjectAccess(scanFinding.project_id)
    if (!projectAllowed) throw new Error(accessError || "Access denied to project")

    // 2. AI NORMALIZE (Scaffold/Simulation)
    // In Phase 4, we will call a real LLM here.
    const aiData = scanFinding.ai_normalized || {
        title: scanFinding.title || "Vulnerability from Scanner",
        description: scanFinding.description || "Detected during automated security scan.",
        severity: scanFinding.severity || "medium",
        remediation: "Apply latest security patches and follow OWASP best practices."
    }

    // 3. Create real vulnerability entry
    const { data: vuln, error: vulnError } = await supabase
      .from("vulnerabilities")
      .insert({
        org_id: orgId,
        project_id: scanFinding.project_id,
        title: aiData.title,
        description: aiData.description,
        severity: aiData.severity,
        status: "open",
        remediation: aiData.remediation,
        found_by: user.id,
        raw_scanner_data: scanFinding.raw_data,
        version: 1
      })
      .select()
      .single()

    if (vulnError) throw vulnError

    // 4. Update scan finding with link and status
    const { error: updateError } = await supabase
      .from("scan_findings")
      .update({
        status: "approved",
        vuln_id: vuln.id,
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .eq("id", data.scanFindingId)
      .eq("org_id", orgId)

    if (updateError) throw updateError

    // 5. Audit Log
    await logAudit({
        org_id: orgId,
        actor_id: user.id,
        action: "approve_scan_finding",
        resource_type: "vulnerability",
        resource_id: vuln.id,
        new_value: { scan_finding_id: data.scanFindingId }
    })

    revalidatePath("/findings")
    return { success: true, vulnId: vuln.id }
  } catch (error) {
    console.error("Approve finding error:", error)
    return { success: false, error: "Failed to approve finding" }
  }
}

export async function rejectScanFinding(data: z.infer<typeof rejectSchema>) {
  try {
    const { orgId, role, user, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }


    if (role === "guest") return { success: false, error: "Permission denied" }

    const supabase = await getServerClient()

    const { error } = await supabase
      .from("scan_findings")
      .update({
        status: "rejected",
        rejection_reason: data.reason,
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .eq("id", data.scanFindingId)
      .eq("org_id", orgId)

    if (error) throw error

    // Audit Log
    await logAudit({
        org_id: orgId,
        actor_id: user.id,
        action: "reject_scan_finding",
        resource_type: "scan_finding",
        resource_id: data.scanFindingId,
        new_value: { reason: data.reason }
    })

    return { success: true }
  } catch (error) {
    console.error("Reject finding error:", error)
    return { success: false, error: "Failed to reject finding" }
  }
}
