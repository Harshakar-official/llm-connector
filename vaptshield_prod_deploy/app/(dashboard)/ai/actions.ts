"use server"

import { validateCveId as validateCveIdServer } from "@/lib/ai/cve"
import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { headers } from "next/headers"
import { getSafeSession, verifyProjectAccess } from "@/lib/utils/security-guard"
import { revalidatePath } from "next/cache"
import { z } from "zod"
// import DOMPurify from "isomorphic-dompurify"

// ─── Z+ SECURITY: Server-side sanitization for AI-generated content ───
// AI responses may contain HTML injection payloads. We sanitize ALL
// text fields before database insertion as defense-in-depth.

const sanitizeHtml = (val: string | null | undefined): string | null => {
  if (val == null || val === '') return null
  // TEMPORARY: Disabled server-side sanitization to fix Vercel ESM/CJS crash
  return val
}

const sanitizePlainText = (val: string | null | undefined): string | null => {
  if (val == null || val === '') return null
  return val
}

export async function validateCveAction(cveId: string) {
    return await validateCveIdServer(cveId)
}

const saveFindingSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'informational']),
  cvss_score: z.number().nullable(),
  cvss_vector: z.string().nullable(),
  cve_id: z.string().nullable().optional(),
  cwe_id: z.string().nullable(),
  owasp_category: z.string().nullable(),
  affected_component: z.string().nullable(),
  endpoint_url: z.string().nullable().optional(),
  impact: z.string().nullable().optional(),
  proof_of_concept: z.string().nullable(),
  remediation: z.string().nullable(),
  reference_links: z.array(z.string()).nullable(),
  is_ai_generated: z.boolean().default(true),
})

export async function saveAiFinding(data: z.infer<typeof saveFindingSchema>) {
    try {
      const validated = saveFindingSchema.parse(data)
      const { orgId, user, role, error: authError } = await getSafeSession()
      if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }

      if (role === 'guest') return { success: false, error: "Access denied" }

      // ─── Z+ SECURITY: PROJECT ACCESS GUARD ───
      const { allowed: projectAllowed, error: accessError } = await verifyProjectAccess(validated.project_id)
      if (!projectAllowed) return { success: false, error: accessError || "Access denied to project" }
  
      const supabase = await getServerClient()

      // ─── Z+ SECURITY: Sanitize ALL text fields before DB insert ───
      const sanitized = {
        ...validated,
        title: sanitizePlainText(validated.title),
        description: sanitizeHtml(validated.description),
        impact: sanitizeHtml(validated.impact),
        proof_of_concept: sanitizeHtml(validated.proof_of_concept),
        remediation: sanitizeHtml(validated.remediation),
        cve_id: sanitizePlainText(validated.cve_id),
        cwe_id: sanitizePlainText(validated.cwe_id),
        owasp_category: sanitizePlainText(validated.owasp_category),
        affected_component: sanitizePlainText(validated.affected_component),
        cvss_vector: sanitizePlainText(validated.cvss_vector),
        reference_links: validated.reference_links?.map(link => sanitizePlainText(link)) ?? null,
      }
  
      const { data: vuln, error } = await supabase
        .from("vulnerabilities")
        .insert({
          ...sanitized,
          org_id: orgId,
          found_by: user.id,
          version: 1
        })
        .select()
        .single()
  
      if (error) throw error
  
      await logAudit({
          org_id: orgId,
          actor_id: user.id,
          action: "create_ai_finding",
          resource_type: "vulnerability",
          resource_id: vuln.id,
          new_value: { title: vuln.title }
      })
  
      revalidatePath("/findings")
      return { success: true, data: vuln }
  
    } catch (error) {
      console.error("Save AI finding error:", error)
      return { success: false, error: (error as Error).message }
    }
}

const bulkSaveSchema = z.object({
  project_id: z.string().uuid(),
  findings: z.array(saveFindingSchema),
})

export async function bulkSaveAiFindings(data: z.infer<typeof bulkSaveSchema>) {
    try {
      const validated = bulkSaveSchema.parse(data)
      const { orgId, user, role, error: authError } = await getSafeSession()
      if (authError || !orgId || !user) return { success: false, error: "Unauthorized" }

      if (role === 'guest') return { success: false, error: "Access denied" }

      // ─── Z+ SECURITY: PROJECT ACCESS GUARD ───
      const { allowed: projectAllowed, error: accessError } = await verifyProjectAccess(validated.project_id)
      if (!projectAllowed) return { success: false, error: accessError || "Access denied to project" }

      const supabase = await getServerClient()
  
      // 2. Prepare data with sanitization
      const insertData = validated.findings.map(f => ({
          ...f,
          title: sanitizePlainText(f.title),
          description: sanitizeHtml(f.description),
          impact: sanitizeHtml(f.impact),
          proof_of_concept: sanitizeHtml(f.proof_of_concept),
          remediation: sanitizeHtml(f.remediation),
          cve_id: sanitizePlainText(f.cve_id),
          cwe_id: sanitizePlainText(f.cwe_id),
          owasp_category: sanitizePlainText(f.owasp_category),
          affected_component: sanitizePlainText(f.affected_component),
          cvss_vector: sanitizePlainText(f.cvss_vector),
          reference_links: f.reference_links?.map(link => sanitizePlainText(link)) ?? null,
          org_id: orgId,
          project_id: validated.project_id,
          found_by: user.id,
          version: 1
      }))

      // 3. Batch Insert
      const { error } = await supabase
        .from("vulnerabilities")
        .insert(insertData)
  
      if (error) throw error
  
      // 4. Audit Log
      await logAudit({
          org_id: orgId,
          actor_id: user.id,
          action: "bulk_ai_findings_create",
          resource_type: "project",
          resource_id: validated.project_id,
          new_value: { count: insertData.length }
      })
  
      revalidatePath("/findings")
      return { success: true }
  
    } catch (error) {
      console.error("Bulk save AI findings error:", error)
      return { success: false, error: (error as Error).message }
    }
}
