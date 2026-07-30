"use server"

import { z } from "zod"
import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { headers } from "next/headers"
import { getSafeSession, verifyProjectAccess } from "@/lib/utils/security-guard"
import { revalidatePath } from "next/cache"

const bulkStatusSchema = z.object({
  ids: z.array(z.string().uuid()),
  status: z.enum(["open", "reopened", "in_progress", "resolved", "verified", "closed", "accepted_risk", "false_positive"]),
  version: z.number().optional(), // Optional: for optimistic locking from detail page
  currentStatus: z.enum(["open", "reopened", "in_progress", "resolved", "verified", "closed", "accepted_risk", "false_positive"]).optional(), // Optional: for transition validation from detail page
})

// Allowed status transitions (workflow state machine)
// Z+ SECURITY: Strict state control to prevent unauthorized lifecycle jumps
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "resolved", "accepted_risk", "false_positive"],
  reopened: ["in_progress", "resolved", "accepted_risk", "false_positive"],
  in_progress: ["resolved", "open", "accepted_risk"],
  resolved: ["verified", "reopened"], // SE Stage: Confirm or Reject
  verified: ["closed", "reopened"],    // Final confirmation
  closed: ["reopened"],                // Only reopen if bug persists
  accepted_risk: ["open"],
  false_positive: ["open"],
}

const remediateSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().min(10, "Please provide more details about the fix."),
  proofUrl: z.string().url().optional().or(z.literal("")),
  version: z.number()
})

const bulkAssignSchema = z.object({
  ids: z.array(z.string().uuid()),
  assigneeId: z.string().uuid().nullable(),
})

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()),
})

export async function bulkUpdateStatus(data: z.infer<typeof bulkStatusSchema>) {
  try {
    const validation = bulkStatusSchema.parse(data)
    const { orgId, role, user, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }


    if (role === "guest") return { success: false, error: "Permission denied" }
    
    // Developer can only use bulkUpdateStatus for 'in_progress' or 'open' (Start/Stop Working)
    if (role === "developer" && !['in_progress', 'open'].includes(validation.status)) {
        return { success: false, error: "Developers must use the remediation form for this status change." }
    }

    const supabase = await getServerClient()

    // ─── RATE LIMITING (Audit Fix #8) ───
    // Limit: Max 10 status changes per minute per user
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    const { count: recentActions } = await supabase
        .from("audit_log")
        .select("*", { count: 'exact', head: true })
        .eq("actor_id", user.id)
        .eq("action", "finding.status_change")
        .gte("created_at", oneMinuteAgo)

    if (recentActions !== null && recentActions >= 10) {
        return { success: false, error: "Rate limit exceeded. Please wait a minute before changing more statuses." }
    }

    // ─── Z+ SECURITY: PROJECT ISOLATION GUARD ───
    if (role !== "admin") {
        const { data: findings } = await supabase
            .from("vulnerabilities")
            .select("project_id, found_by")
            .in("id", validation.ids)
            .eq("org_id", orgId)
        
        if (!findings || findings.length === 0) return { success: false, error: "No findings found" }

        const projectIds = Array.from(new Set(findings.map(f => f.project_id)))
        for (const pid of projectIds) {
            const { allowed } = await verifyProjectAccess(pid)
            if (!allowed) return { success: false, error: "Access Denied: You are not assigned to all selected projects." }
        }
    }

    // ─── OPTIMISTIC LOCKING & TRANSITION VALIDATION ───
    // Fetch current versions for ALL findings being updated
    const { data: currentFindings, error: fetchError } = await supabase
        .from("vulnerabilities")
        .select("id, version, status, remediation_notes")
        .in("id", validation.ids)
        .eq("org_id", orgId)

    if (fetchError || !currentFindings || currentFindings.length === 0) {
        return { success: false, error: "No findings found" }
    }

    // Build a map for quick lookup
    const findingsMap = new Map(currentFindings.map(f => [f.id, f]))

    // ─── WORKFLOW VALIDATION (Audit Fix #7) ───
    for (const f of currentFindings) {
        const allowedNext = ALLOWED_TRANSITIONS[f.status]
        if (!allowedNext || !allowedNext.includes(validation.status)) {
            return {
                success: false,
                error: `Invalid transition: One or more findings cannot move from "${f.status.replace("_", " ")}" to "${validation.status.replace("_", " ")}".`
            }
        }
    }

    // ─── VERSION CHECK: If caller provided versions, validate them ───
    if (validation.version !== undefined) {
        // Single-finding mode: version check against the one finding
        const current = findingsMap.get(validation.ids[0])
        if (!current) return { success: false, error: "Finding not found" }

        // ─── TRANSITION VALIDATION ───
        if (validation.currentStatus) {
            const allowedNext = ALLOWED_TRANSITIONS[validation.currentStatus]
            if (!allowedNext || !allowedNext.includes(validation.status)) {
                return {
                    success: false,
                    error: `Invalid transition: Cannot move from "${validation.currentStatus.replace("_", " ")}" to "${validation.status.replace("_", " ")}". Allowed: ${(allowedNext || []).map(s => s.replace("_", " ")).join(", ")}`
                }
            }
        }

        if (current.version !== validation.version) {
            return { success: false, error: "Conflict Detected: This finding has been modified by another user. Please refresh and try again." }
        }
    }

    // ─── BULK UPDATE: Update each finding with its own version bump ───
    // Use individual updates to ensure each finding's version is incremented correctly
    const updatePromises = currentFindings.map(finding => {
        // For single-finding mode with version check, use the validated version
        // For bulk mode, use the current version from DB
        const baseVersion = (validation.version !== undefined && validation.ids.length === 1)
            ? validation.version
            : finding.version

        const updatePayload: any = {
            status: validation.status,
            version: baseVersion + 1,
            updated_at: new Date().toISOString(),
        }

        // If marking as resolved, set attribution and notes
        if (validation.status === "resolved") {
            updatePayload.resolved_by = user.id
            updatePayload.resolved_at = new Date().toISOString()
            // Maintenance: set default notes if missing
            updatePayload.remediation_notes = finding.remediation_notes || "Manually resolved by administrator."
        } else {
            // If moving back to open, clear resolution metadata
            updatePayload.resolved_by = null
            updatePayload.resolved_at = null
        }

        return supabase
            .from("vulnerabilities")
            .update(updatePayload)
            .eq("id", finding.id)
            .eq("org_id", orgId)
    })

    const results = await Promise.all(updatePromises)
    const firstError = results.find(r => r.error)
    if (firstError?.error) throw firstError.error

    // Individual Audit Logs for each finding (Z+ Traceability)
    const logEntries = validation.ids.map(id => ({
        org_id: orgId,
        actor_id: user.id,
        action: "finding.status_change",
        resource_type: "vulnerability",
        resource_id: id,
        new_value: { status: validation.status }
    }))
    await logAudit(logEntries)

    revalidatePath("/findings")
    revalidatePath("/tracker")
    // Also revalidate individual finding detail pages
    for (const id of validation.ids) {
        revalidatePath(`/findings/${id}`)
    }
    return { success: true }
  } catch (error) {
    console.error("Bulk status error:", error)
    return { success: false, error: (error as Error).message }
  }
}

export async function remediateFinding(data: z.infer<typeof remediateSchema>) {
    try {
        const validation = remediateSchema.parse(data)
        const { orgId, role, user, error: authError } = await getSafeSession()
        if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }

        const supabase = await getServerClient()

        // 1. Fetch current finding to verify access and version
        const { data: finding } = await supabase
            .from("vulnerabilities")
            .select("id, project_id, version, status, assigned_to")
            .eq("id", validation.id)
            .eq("org_id", orgId)
            .single()

        if (!finding) return { success: false, error: "Finding not found" }

        // ─── TRANSITION VALIDATION (Audit Fix #6) ───
        const allowedStatuses = ["open", "reopened", "in_progress"]
        if (!allowedStatuses.includes(finding.status)) {
            return { 
                success: false, 
                error: `Cannot submit fix: Finding is currently ${finding.status.replace("_", " ")}. Only actionable findings can be remediated.` 
            }
        }

        // 2. Z+ SECURITY: Access Guard
        const { allowed } = await verifyProjectAccess(finding.project_id)
        if (!allowed) return { success: false, error: "Access Denied: You are not assigned to this project." }

        // 3. OPTIMISTIC LOCKING
        if (finding.version !== validation.version) {
            return { success: false, error: "Conflict Detected: This finding has been modified. Please refresh." }
        }

        // 4. WORKFLOW GUARD: Developer can only remediate if they are the assignee or if they have higher roles
        if (role === "developer" && finding.assigned_to !== user.id) {
            return { success: false, error: "Permission Denied: You can only remediate findings assigned to you." }
        }

        // 5. UPDATE
        const { error } = await supabase
            .from("vulnerabilities")
            .update({
                status: "resolved",
                remediation_notes: validation.notes,
                remediation_proof_url: validation.proofUrl || null,
                resolved_by: user.id,
                resolved_at: new Date().toISOString(),
                version: finding.version + 1,
                updated_at: new Date().toISOString()
            })
            .eq("id", validation.id)
            .eq("org_id", orgId)

        if (error) throw error

        // 6. AUDIT LOG
        await logAudit({
            org_id: orgId,
            actor_id: user.id,
            action: "finding.remediated",
            resource_type: "vulnerability",
            resource_id: validation.id,
            new_value: { status: "resolved", notes: validation.notes }
        })

        revalidatePath(`/findings/${validation.id}`)
        revalidatePath("/findings")
        revalidatePath("/tracker")
        return { success: true }
    } catch (error: any) {
        console.error("Remediation error:", error)
        return { success: false, error: "Failed to process finding" }
    }
}

export async function bulkAssign(data: z.infer<typeof bulkAssignSchema>) {
    try {
      const validation = bulkAssignSchema.parse(data)
      const { orgId, role, user, error: authError } = await getSafeSession()
      if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }

  
      if (role === "guest") return { success: false, error: "Permission denied" }
  
      const supabase = await getServerClient()

      // ─── RATE LIMITING (Audit Fix #8) ───
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
      const { count: recentActions } = await supabase
          .from("audit_log")
          .select("*", { count: 'exact', head: true })
          .eq("actor_id", user.id)
          .eq("action", "finding.assigned")
          .gte("created_at", oneMinuteAgo)

      if (recentActions !== null && recentActions >= 10) {
          return { success: false, error: "Rate limit exceeded. Please wait a minute before changing more assignments." }
      }

      // ─── Z+ SECURITY: PROJECT ISOLATION GUARD ───

      if (role !== "admin") {
          const { data: findings } = await supabase
              .from("vulnerabilities")
              .select("project_id, found_by")
              .in("id", validation.ids)
              .eq("org_id", orgId)
          
          if (!findings || findings.length === 0) return { success: false, error: "No findings found" }

          const projectIds = Array.from(new Set(findings.map(f => f.project_id)))
          for (const pid of projectIds) {
              const { allowed } = await verifyProjectAccess(pid)
              if (!allowed) return { success: false, error: "Access Denied: You are not assigned to all selected projects." }
          }
      }
  // ─── BULK UPDATE ───
  const { error } = await supabase
    .from("vulnerabilities")
    .update({ 
        assigned_to: validation.assigneeId, 
        assigned_by: user.id, // Store who assigned it
        updated_at: new Date().toISOString() 
    })
    .in("id", validation.ids)
    .eq("org_id", orgId)

  
      if (error) throw error
  
      // Individual Audit Logs for each finding (Z+ Traceability)
      const logEntries = validation.ids.map(id => ({
          org_id: orgId,
          actor_id: user.id,
          action: "finding.assigned",
          resource_type: "vulnerability",
          resource_id: id,
          new_value: { assigned_to: validation.assigneeId }
      }))
      await logAudit(logEntries)
  
      revalidatePath("/findings")
      revalidatePath("/tracker")
      // Revalidate individual pages
      for (const id of validation.ids) {
          revalidatePath(`/findings/${id}`)
      }
      return { success: true }
    } catch (error) {
      console.error("Bulk assignment error:", error)
      return { success: false, error: (error as Error).message }
    }
  }

export async function bulkDeleteFindings(data: z.infer<typeof bulkDeleteSchema>) {
  try {
    const validation = bulkDeleteSchema.parse(data)
    const { orgId, role, user, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }


    // According to CLAUDE.md permissions: findings:delete allows admin, program_manager, security_engineer
    if (role === "guest") return { success: false, error: "Permission denied" }

    const supabase = await getServerClient()

    // ─── RATE LIMITING (Audit Fix #8) ───
    // Limit: Max 10 deletions per minute per user
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    const { count: recentActions } = await supabase
        .from("audit_log")
        .select("*", { count: 'exact', head: true })
        .eq("actor_id", user.id)
        .eq("action", "bulk_delete_findings")
        .gte("created_at", oneMinuteAgo)

    if (recentActions !== null && recentActions >= 10) {
        return { success: false, error: "Rate limit exceeded. Please wait a minute before deleting more findings." }
    }

    // ─── Z+ SECURITY: PROJECT ISOLATION GUARD ───
    if (role !== "admin") {
        const { data: findings } = await supabase
            .from("vulnerabilities")
            .select("project_id, found_by")
            .in("id", validation.ids)
            .eq("org_id", orgId)
        
        if (!findings || findings.length === 0) return { success: false, error: "No findings found" }

        // Get unique project IDs
        const projectIds = Array.from(new Set(findings.map(f => f.project_id)))

        // Check access for each project
        for (const pid of projectIds) {
            const { allowed } = await verifyProjectAccess(pid)
            if (!allowed) return { success: false, error: `Access Denied: You are not assigned to project ${pid}` }
        }
    }

    // ─── Z+ STORAGE PURGE: Cleanup physical files before DB deletion ───
    try {
        const { data: attachments } = await supabase
            .from("vuln_attachments")
            .select("file_url")
            .in("vuln_id", validation.ids)
        
        if (attachments && attachments.length > 0) {
            const storagePaths = attachments.map(a => a.file_url)
            await supabase.storage.from("poc-files").remove(storagePaths)
        }
    } catch (purgeError) {
        console.error("[bulkDeleteFindings] Storage purge error (non-blocking):", purgeError)
    }

    const { error } = await supabase
      .from("vulnerabilities")
      .delete()
      .in("id", validation.ids)
      .eq("org_id", orgId)

    if (error) throw error

    // Audit Log
    await logAudit({
        org_id: orgId,
        actor_id: user.id,
        action: "bulk_delete_findings",
        resource_type: "vulnerability",
        new_value: { count: validation.ids.length }
    })

    revalidatePath("/findings")
    return { success: true }
  } catch (error) {
    console.error("Bulk delete error:", error)
    return { success: false, error: (error as Error).message }
  }
}

export async function deleteFinding(id: string) {
    try {
      const { orgId, role, user, error: authError } = await getSafeSession()
      if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }

  
      if (role !== "admin" && role !== "program_manager" && role !== "security_engineer") {
          return { success: false, error: "Permission denied" }
      }
  
      const supabase = await getServerClient()

      // 1. Get finding to check project_id
      const { data: finding } = await supabase
        .from("vulnerabilities")
        .select("project_id, found_by")
        .eq("id", id)
        .eq("org_id", orgId)
        .single()
    
      if (!finding) return { success: true, warning: "Finding not found (already deleted)" }

      // 2. ─── Z+ SECURITY: PROJECT ACCESS GUARD ───
      const { allowed } = await verifyProjectAccess(finding.project_id)
      if (!allowed) return { success: false, error: "Access Denied: You are not assigned to this project." }
  
      // 3. ─── Z+ STORAGE CLEANUP: Delete all associated PoC images ───
      const { data: attachments } = await supabase
        .from("vuln_attachments")
        .select("file_url")
        .eq("vuln_id", id)
      
      if (attachments && attachments.length > 0) {
          const storagePaths = attachments.map(a => a.file_url)
          // We use the user's supabase client to delete, respecting RLS
          await supabase.storage.from("poc-files").remove(storagePaths)
      }

      const { error } = await supabase
        .from("vulnerabilities")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId)
  
      if (error) throw error
  
      // Audit Log
      await logAudit({
          org_id: orgId,
          actor_id: user.id,
          action: "delete_finding",
          resource_type: "vulnerability",
          resource_id: id
      })
  
      revalidatePath("/findings")
      return { success: true }
      } catch (error) {
      console.error("Delete finding error:", error)
      return { success: false, error: (error as Error).message }
      }
      }

      // ─── Z+ REPORT ACTIONS ───

      export async function deleteReport(reportId: string) {
      try {
          const { orgId, role, user, error: authError } = await getSafeSession()
          if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }

          // Z+ SECURITY: Admin, PM, and SE can delete reports if they have project access
          // v1.0.5 - Deployment Trigger
          if (role !== 'admin' && role !== 'program_manager' && role !== 'security_engineer') {
              return { success: false, error: "Access Denied: Your role does not have permission to purge report artifacts." }
          }

          const supabase = await getServerClient()

          // 1. Fetch Report Metadata
          const { data: report, error: fetchError } = await supabase
              .from("reports")
              .select("id, project_id, docx_url, pdf_url")
              .eq("id", reportId)
              .eq("org_id", orgId)
              .single()

          if (fetchError || !report) {
              console.error("[DeleteReportAction] Report not found or access denied:", fetchError)
              return { success: false, error: "Report not found" }
          }

          // 2. Access Guard (Verify user is assigned to the project or is admin)
          const { allowed } = await verifyProjectAccess(report.project_id)
          if (!allowed) {
              console.error(`[DeleteReportAction] User ${user.id} denied access to project ${report.project_id}`)
              return { success: false, error: "Access Denied: You are not assigned to this project." }
          }

          // 3. Storage Cleanup: Delete DOCX and PDF from 'reports' bucket
          const filesToDelete: string[] = []
          if (report.docx_url) filesToDelete.push(report.docx_url)
          if (report.pdf_url) filesToDelete.push(report.pdf_url)

          if (filesToDelete.length > 0) {
              const { error: storageError } = await supabase.storage.from("reports").remove(filesToDelete)
              if (storageError) {
                  console.error("[DeleteReportAction] Storage cleanup error (continuing):", storageError)
                  // We continue with DB deletion even if storage removal fails slightly
              }
          }

          // 4. DB Deletion
          const { error: deleteError } = await supabase
              .from("reports")
              .delete()
              .eq("id", reportId)
              .eq("org_id", orgId)

          if (deleteError) {
              console.error("[DeleteReportAction] DB Delete error:", deleteError)
              throw deleteError
          }

          // 5. Audit Log
          await logAudit({
              org_id: orgId,
              actor_id: user.id,
              action: 'report.deleted',
              resource_type: 'report',
              resource_id: reportId,
              new_value: { project_id: report.project_id, title: (report as any).title }
          })

          revalidatePath(`/projects/${report.project_id}`)
          return { success: true }

      } catch (error: any) {
          console.error("[DeleteReportAction] CRITICAL Error:", error)
          return { success: false, error: "Failed to delete report" }
      }
      }
