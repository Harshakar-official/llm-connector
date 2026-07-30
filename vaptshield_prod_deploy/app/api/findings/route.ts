import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/utils/audit-server"
import { headers } from "next/headers"
import { getSafeSession, verifyProjectAccess } from "@/lib/utils/security-guard"
import { hasPermission } from "@/lib/utils/permissions"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { createNotification } from "@/lib/supabase/notification-actions"
import { validateCveId } from "@/lib/ai/cve"
import { calculateCvss40, getSeverityFromScore } from "@/lib/utils/cvss-official"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"
import { validateOrigin } from "@/lib/utils/csrf"
import sanitizeHtml from "sanitize-html"

export const dynamic = 'force-dynamic'

// Whitelist of allowed sort columns to prevent SQL injection via column name
const ALLOWED_SORT_COLUMNS = [
  "created_at",
  "updated_at",
  "title",
  "severity",
  "status",
  "cvss_score",
  "project_id",
  "assigned_to",
] as const

// Whitelist of allowed MIME types for attachment uploads (defense-in-depth)
const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "text/plain",
  "application/vnd.tcpdump.pcap",
  "application/octet-stream", // pcap fallback
  "application/json",
  "application/x-yaml",
  "text/yaml",
  "text/markdown",
]

// ─── Z+ SECURITY: CVSS INTEGRITY GUARD ───
/**
 * Ensures that if a CVSS vector is provided, the score and severity
 * are mathematically correct. If no vector is provided (Manual Mode),
 * it preserves the user's manual score and derives severity from it.
 */
function normalizeCvssData(data: { cvss_vector?: string | null; cvss_score?: number | null; severity: string }) {
    const vector = data.cvss_vector?.trim()
    let score = data.cvss_score ?? 0
    let severity = data.severity as "critical" | "high" | "medium" | "low" | "informational"

    if (vector && vector.startsWith("CVSS:4.0")) {
        const calc = calculateCvss40(vector)
        if (calc.success) {
            // Vector is the source of truth
            score = calc.score
            severity = calc.severity
        }
    } else {
        // Manual Mode: Derives severity from manual score
        severity = getSeverityFromScore(score)
    }

    return { cvss_score: score, severity, cvss_vector: vector || null }
}

const querySchema = z.object({
  page: z.string().transform(Number).pipe(z.number().min(1)).default(1),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default(25),
  search: z.string().default(""),
  severity: z.string().optional(),
  status: z.string().optional(),
  project: z.string().optional(),
  assignee: z.string().optional(),
  sort: z.string().default("created_at").refine(
    (val) => ALLOWED_SORT_COLUMNS.includes(val as typeof ALLOWED_SORT_COLUMNS[number]),
    { message: "Invalid sort column" }
  ),
  order: z.enum(["asc", "desc"]).default("desc"),
})

const createSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(5).max(200),
  description: z.string().min(10),
  severity: z.enum(["critical", "high", "medium", "low", "informational"]),
  status: z.enum(["open", "reopened", "in_progress", "resolved", "verified", "closed", "accepted_risk", "false_positive"]).default("open"),
  cve_id: z.string().nullable().optional(),
  cwe_id: z.string().nullable().optional(),
  owasp_category: z.string().nullable().optional(),
  cvss_score: z.number().min(0).max(10).nullable().optional(),
  cvss_vector: z.string().nullable().optional(),
  endpoint_url: z.string().nullable().optional(),
  affected_component: z.string().nullable().optional(),
  proof_of_concept: z.string().nullable().optional(),
  impact: z.string().nullable().optional(),
  remediation: z.string().nullable().optional(),
  reference_links: z.array(z.string()).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  version: z.number().default(1),
  is_ai_generated: z.boolean().default(false),
  ai_model_used: z.string().nullable().optional(),
  attachments: z.array(z.object({
      id: z.string(),
      name: z.string(),
      size: z.number().max(10 * 1024 * 1024, "File size must not exceed 10MB"),
      type: z.string().refine(
          (t) => ALLOWED_ATTACHMENT_MIME_TYPES.includes(t),
          { message: `File type not allowed. Allowed: ${ALLOWED_ATTACHMENT_MIME_TYPES.join(", ")}` }
      ),
      url: z.string().min(1, "Storage path must not be empty"),
  })).optional(),
})

const updateSchema = createSchema.extend({
    id: z.string().uuid(),
    version: z.number(),
    removed_attachment_ids: z.array(z.string()).optional(),
})

// ─── Z+ SECURITY: SERVER-SIDE SANITIZATION ───
// Defense-in-depth: Even though the client sanitizes, we re-sanitize server-side
// to protect against direct API calls bypassing the client.
const sanitizeFinding = (data: Record<string, any>) => {
    const fieldsToSanitize = ["description", "impact", "proof_of_concept", "remediation"]
    const sanitized = { ...data }

    fieldsToSanitize.forEach(field => {
        if (typeof sanitized[field] === "string") {
            sanitized[field] = sanitizeHtml(sanitized[field], {
                allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'pre', 'code', 'br']),
                allowedAttributes: {
                    ...sanitizeHtml.defaults.allowedAttributes,
                    '*': ['class', 'style'],
                    'img': ['src', 'alt', 'width', 'height', 'loading']
                }
            })
        }
    })

    return sanitized
}

export async function GET(req: NextRequest) {
  try {
    const { orgId, error } = await getSafeSession()
    if (error || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const ip = req.headers.get("x-forwarded-for") || "anonymous"
    const rateResult = await slidingWindowRateLimit(`findings:get:${ip}`, 60, 60)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const params = Object.fromEntries(searchParams.entries())
    const validation = querySchema.safeParse(params)

    if (!validation.success) {
        return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { page, limit, search, severity, status, project, assignee, sort, order } = validation.data
    const offset = (page - 1) * limit
    const supabase = await getServerClient()

    let query = supabase
      .from("vulnerabilities")
      .select(`
        *,
        projects (id, name),
        profiles!vulnerabilities_found_by_fkey (id, full_name, avatar_url),
        assigned_to_profile:profiles!vulnerabilities_assigned_to_fkey (id, full_name, avatar_url)
      `, { count: "exact" })
      .eq("org_id", orgId)

    // Filtering
    if (search) {
      // Use full-text search (fts) for title and description to leverage GIN index,
      // keep ilike for cve_id since CVE IDs are short exact-ish strings
      query = query.or(`title.fts.${search},description.fts.${search},cve_id.ilike.%${search}%`)
    }

    if (severity && severity !== "all") {
      const severityList = severity.split(",")
      query = query.in("severity", severityList)
    }

    if (status && status !== "all") {
      const statusList = status.split(",")
      query = query.in("status", statusList)
    }

    if (project && project !== "all") {
      query = query.eq("project_id", project)
    }

    if (assignee && assignee !== "all") {
      if (assignee === "none") {
        query = query.is("assigned_to", null)
      } else {
        query = query.eq("assigned_to", assignee)
      }
    }

    // ─── TIERED SORTING LOGIC (RISK PRIORITY) ───
    // Primary: CVSS Score (Highest First, 10.0 -> 0.1)
    // Secondary: Severity Rank (Critical -> Informational)
    // Tertiary: Creation Date (Newest First)
    
    if (sort === "cvss_score" || sort === "severity") {
        query = query
            .order("cvss_score", { ascending: order === "asc", nullsFirst: false })
            // Custom severity mapping is not possible in simple .order(),
            // but since higher severity usually has higher CVSS, score leads.
            // If scores are equal, we sort by created_at.
            .order("created_at", { ascending: false })
    } else {
        query = query.order(sort, { ascending: order === "asc" })
    }

    // Pagination
    query = query.range(offset, offset + limit - 1)

    // ─── Efficient Summary Query ───
    // Fetch only the 'severity' column for all active findings in this context
    // This avoids the 'mutating query' bug and is very fast
    let summaryQuery = supabase
      .from("vulnerabilities")
      .select("severity")
      .eq("org_id", orgId)
      .not("status", "in", '("closed","false_positive")')

    if (project && project !== "all") {
      summaryQuery = summaryQuery.eq("project_id", project)
    }

    const [
        { data, count, error: queryError },
        { data: summaryData }
    ] = await Promise.all([
        query,
        summaryQuery
    ])

    if (queryError) throw queryError

    // Aggregate counts in Node.js
    const summary = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
    summaryData?.forEach(v => {
        const sev = v.severity as keyof typeof summary
        if (sev in summary) summary[sev]++
    })

    return NextResponse.json({
      rows: data || [],
      total: count ?? -1,
      page,
      limit,
      summary
    })
  } catch (err) {
    console.error("Findings GET API Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
    try {
      const csrf = validateOrigin(req)
      if (!csrf.valid) return csrf.error

      console.log("[Findings API] POST Request received")
      const body = await req.json()
      console.log("[Findings API] Body:", JSON.stringify(body))
      const validation = createSchema.safeParse(body)
  
      if (!validation.success) {
          console.error("[Findings API] Validation failed:", validation.error.issues)
          return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 })
      }
      console.log("[Findings API] Validation success")

      // ─── Z+ SECURITY: RATE LIMIT ───
      const ip = req.headers.get("x-forwarded-for") || "anonymous"
      const rateResult = await slidingWindowRateLimit(`findings:post:${ip}`, 30, 60)
      if (!rateResult.success) {
        return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 })
      }

      // ─── Z+ SECURITY: PROJECT ACCESS GUARD ───
      const { allowed, orgId, user, role, error: accessError } = await verifyProjectAccess(validation.data.project_id)
      
      if (!allowed || !orgId) {
          console.error("[Findings API] Access denied:", accessError)
          return NextResponse.json({ error: accessError || "Access denied to project" }, { status: 403 })
      }
  
      if (!hasPermission(role, "findings:create")) {
          return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }

      console.log("[Findings API] Access granted")

      // ─── Z+ SECURITY: CVSS INTEGRITY ENFORCEMENT ───
      console.log("[Findings API] Normalizing CVSS...")
      const { cvss_score, severity, cvss_vector } = normalizeCvssData({
          cvss_vector: validation.data.cvss_vector,
          cvss_score: validation.data.cvss_score,
          severity: validation.data.severity
      })
      console.log("[Findings API] Normalized:", { cvss_score, severity, cvss_vector })

      // ─── Z+ SECURITY: NVD CVE VALIDATION ───
      if (validation.data.cve_id) {
          const cveValidation = await validateCveId(validation.data.cve_id)
          if (!cveValidation.valid) {
              return NextResponse.json({
                  error: `Fake or Invalid CVE ID: ${validation.data.cve_id}. Could not verify against NVD.`
              }, { status: 400 })
          }
      }

      const supabase = await getServerClient()
  
      // Extract attachments metadata before insert
      const { attachments, ...rawFindingData } = validation.data
      const findingData = sanitizeFinding({
          ...rawFindingData,
          cvss_score,
          severity,
          cvss_vector
      })

      // Create finding
      const { data, error } = await supabase
        .from("vulnerabilities")
        .insert({
          ...findingData,
          org_id: orgId,
          found_by: user!.id,
          version: 1, // Reset version for new creation
        })
        .select()
        .single()
  
      if (error) throw error

      // Handle Attachments
      if (attachments && attachments.length > 0) {
          const attachmentEntries = attachments.map(att => ({
              vuln_id: data.id,
              original_filename: att.name,
              stored_filename: att.url.split('/').pop(),
              file_url: att.url,
              file_size_bytes: att.size,
              mime_type: att.type,
              uploaded_by: user!.id
          }))

          await supabase.from("vuln_attachments").insert(attachmentEntries)
      }
  
      // Audit Log
      await logAudit({
          org_id: orgId,
          actor_id: user!.id,
          action: "create_finding",
          resource_type: "vulnerability",
          resource_id: data.id,
          new_value: { title: data.title, cvss: data.cvss_score }
      })

      // ─── ENTERPRISE NOTIFICATIONS: CRITICAL/HIGH ALERTS ───
      if (severity === 'critical' || severity === 'high') {
          // Notify Admins and PMs of the organization
          const { data: managers } = await supabase
            .from("profiles")
            .select("id")
            .eq("org_id", orgId)
            .in("role", ["admin", "program_manager"])
          
          if (managers && managers.length > 0) {
              const { data: project } = await supabase
                .from("projects")
                .select("name")
                .eq("id", validation.data.project_id)
                .single()
              
              const projectName = project?.name || "Unknown Project"

              await Promise.all(managers.map(mgr => 
                createNotification({
                    user_id: mgr.id,
                    org_id: orgId,
                    title: `SECURITY ALERT: ${severity.toUpperCase()}`,
                    message: `${severity.toUpperCase()} finding found in ${projectName}: ${validation.data.title}`,
                    type: 'finding_critical'
                })
              ))
          }
      }

      revalidatePath("/findings")
      revalidatePath(`/projects/${validation.data.project_id}`)
  
      return NextResponse.json({ success: true, data })
    } catch (err) {
      console.error("Findings POST API Error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }

export async function PATCH(req: NextRequest) {
    try {
        const csrf = validateOrigin(req)
        if (!csrf.valid) return csrf.error

        const body = await req.json()
        const validation = updateSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 })
        }

        const { id, project_id, version, attachments, removed_attachment_ids, ...rawFindingData } = validation.data

        // ─── Z+ SECURITY: RATE LIMIT ───
        const ip = req.headers.get("x-forwarded-for") || "anonymous"
        const rateResult = await slidingWindowRateLimit(`findings:patch:${ip}`, 30, 60)
        if (!rateResult.success) {
          return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 })
        }

        // ─── Z+ SECURITY: PROJECT ACCESS GUARD ───
        const { allowed, orgId, user, role, error: accessError } = await verifyProjectAccess(project_id)
        
        if (!allowed || !orgId || !user) {
            return NextResponse.json({ error: accessError || "Access denied to project" }, { status: 403 })
        }

        if (!hasPermission(role, "findings:edit_own")) {
            return NextResponse.json({ error: "Permission denied" }, { status: 403 })
        }

        // ─── Z+ SECURITY: CVSS INTEGRITY ENFORCEMENT ───
        const { cvss_score, severity, cvss_vector } = normalizeCvssData({
            cvss_vector: rawFindingData.cvss_vector,
            cvss_score: rawFindingData.cvss_score,
            severity: rawFindingData.severity
        })

        // ─── Z+ SECURITY: NVD CVE VALIDATION ───
        if (rawFindingData.cve_id) {
            const cveValidation = await validateCveId(rawFindingData.cve_id)
            if (!cveValidation.valid) {
                return NextResponse.json({ 
                    error: `Fake or Invalid CVE ID: ${rawFindingData.cve_id}. Could not verify against NVD.` 
                }, { status: 400 })
            }
        }

        const findingData = sanitizeFinding({
            ...rawFindingData,
            cvss_score,
            severity,
            cvss_vector
        })

        const supabase = await getServerClient()

        // ─── OPTIMISTIC LOCKING CHECK ───
        const { data: current, error: fetchError } = await supabase
            .from("vulnerabilities")
            .select("version, project_id, found_by, title")
            .eq("id", id)
            .eq("org_id", orgId)
            .single()
        
        if (fetchError || !current) {
            return NextResponse.json({ error: "Finding not found" }, { status: 404 })
        }

        // If project is being changed, verify access to the original project as well
        if (current.project_id !== project_id) {
            const { allowed: oldProjectAllowed } = await verifyProjectAccess(current.project_id)
            if (!oldProjectAllowed) {
                return NextResponse.json({ error: "Access denied to the original project" }, { status: 403 })
            }
        }
        
        if (current.version !== version) {
            return NextResponse.json({ 
                error: "Conflict Detected: This finding has been modified by another user. Please refresh and try again." 
            }, { status: 409 })
        }

        const { error: updateError } = await supabase
            .from("vulnerabilities")
            .update({
                ...findingData,
                project_id, // Ensure project_id is updated if changed
                version: current.version + 1,
                updated_at: new Date().toISOString()
            })
            .eq("id", id)
            .eq("org_id", orgId)

        if (updateError) throw updateError


        // Handle Attachments (Update logic: add new ones, delete removed ones)
        if (attachments && attachments.length > 0) {
            const attachmentEntries = attachments.map(att => ({
                vuln_id: id,
                original_filename: att.name,
                stored_filename: att.url.split('/').pop(),
                file_url: att.url,
                file_size_bytes: att.size,
                mime_type: att.type,
                uploaded_by: user!.id
            }))

            await supabase.from("vuln_attachments").upsert(attachmentEntries, { onConflict: 'file_url' })
        }

        // Handle removed attachments: delete from storage and DB
        if (removed_attachment_ids && removed_attachment_ids.length > 0) {
            // Fetch file_urls for the removed attachments so we can delete from storage
            const { data: removedAtts } = await supabase
                .from("vuln_attachments")
                .select("id, file_url")
                .in("id", removed_attachment_ids)
                .eq("vuln_id", id)

            if (removedAtts && removedAtts.length > 0) {
                const storagePaths = removedAtts.map((a: { file_url: string }) => a.file_url)
                await supabase.storage.from("poc-files").remove(storagePaths)
                await supabase
                    .from("vuln_attachments")
                    .delete()
                    .in("id", removedAtts.map((a: { id: string }) => a.id))
            }
        }

        // Audit Log
        await logAudit({
            org_id: orgId,
            actor_id: user!.id,
            action: "update_finding",
            resource_type: "vulnerability",
            resource_id: id,
            old_value: { title: current.title },
            new_value: { title: findingData.title }
        })

        revalidatePath("/findings")
        revalidatePath(`/findings/${id}`)
        revalidatePath(`/projects/${project_id}`)

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error("Findings PATCH API Error:", err)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
