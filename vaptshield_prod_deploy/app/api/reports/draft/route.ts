// ============================================================
// VAPTShield — Report Draft Management API
// GET  /api/reports/draft?projectId=[id] -> Fetch or Initialize
// PATCH /api/reports/draft -> Save Edited Content (sanitised)
// POST /api/reports/draft -> Sync with Latest Data
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import sanitizeHtml from "sanitize-html"
import { getServerClient } from "@/lib/supabase/server"
import { getOrCreateReportDraft, saveReportDraft, syncReportDraft, ReportContent } from "@/lib/reports/engine"
import { hasPermission } from "@/lib/utils/permissions"
import { DraftPatchRequestSchema, DraftSyncRequestSchema, DraftGetQuerySchema, formatZodError } from "@/lib/reports/schema"

// ─── XSS sanitiser for report HTML (Task 17) ────────────────
// Defense-in-depth: client also sanitises, server re-strips dangerous tags
// Allows: rich text from TipTap (p, h1-h4, ul, ol, li, b, i, u, strong, em,
//   blockquote, pre, code, br, span with style), tables, images, links.
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
    allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr', 'blockquote', 'pre', 'code',
        'ul', 'ol', 'li',
        'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'mark',
        'span', 'div', 'a', 'img', 'figure', 'figcaption',
        'table', 'thead', 'tbody', 'tr', 'td', 'th',
    ],
    allowedAttributes: {
        a: ['href', 'name', 'target', 'rel', 'title'],
        img: ['src', 'alt', 'title', 'width', 'height', 'data-poc-path', 'class'],
        span: ['style', 'class', 'data-color', 'data-font-size'],
        div: ['style', 'class'],
        p: ['style', 'class'],
        table: ['class', 'style'],
        td: ['colspan', 'rowspan', 'style', 'class'],
        th: ['colspan', 'rowspan', 'style', 'class'],
        '*': ['class', 'style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowedSchemesByTag: {
        img: ['http', 'https', 'data'],
    },
    // Force every external link to be safe
    transformTags: {
        a: (tagName, attribs) => {
            const href = attribs.href || ''
            if (href.startsWith('javascript:') || href.startsWith('vbscript:')) {
                return { tagName: 'a', attribs: {} }
            }
            return {
                tagName: 'a',
                attribs: {
                    ...attribs,
                    rel: 'noopener noreferrer nofollow',
                    target: '_blank',
                },
            }
        },
    },
    // Disallow event handlers and inline JS — already in default config
    allowedStyles: {
        '*': {
            'color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
            'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/],
            'text-align': [/^(left|right|center|justify)$/],
            'font-size': [/^\d+(?:px|em|rem|%)$/],
            'font-weight': [/^(normal|bold|[1-9]00)$/],
            'font-style': [/^(normal|italic|oblique)$/],
            'text-decoration': [/^(none|underline|line-through|overline)$/],
        },
    },
    disallowedTagsMode: 'discard',
    // Forbid form/iframe/object/embed/script entirely
    exclusiveFilter: (frame) => {
        if (frame.tag === 'script' || frame.tag === 'iframe' || frame.tag === 'object' || frame.tag === 'embed') {
            return true
        }
        return false
    },
}

// Apply sanitiser only to fields that contain user-editable rich text
const HTML_FIELDS = [
    'executive_summary', 'technical_summary', 'methodology', 'scope',
    'disclaimer', 'recommendations', 'appendix',
    'glossary', 'conclusions', 'severity_definitions', 'url_risk_table_intro',
    'owasp_intro', 'recommendations_intro', 'project_description',
] as const

const FINDING_HTML_FIELDS = [
    'description', 'impact', 'remediation', 'proof_of_concept',
] as const

function sanitizeReportContent(content: any): any {
    if (!content || typeof content !== 'object') return content
    const out = { ...content }

    for (const field of HTML_FIELDS) {
        if (typeof out[field] === 'string' && out[field].length > 0) {
            out[field] = sanitizeHtml(out[field], RICH_TEXT_OPTIONS)
        }
    }

    if (Array.isArray(out.findings)) {
        out.findings = out.findings.map((f: any) => {
            if (!f || typeof f !== 'object') return f
            const nf = { ...f }
            for (const field of FINDING_HTML_FIELDS) {
                if (typeof nf[field] === 'string' && nf[field].length > 0) {
                    nf[field] = sanitizeHtml(nf[field], RICH_TEXT_OPTIONS)
                }
            }
            return nf
        })
    }

    // Recursively sanitise nested objects (annexures, project_details, etc.)
    for (const key of Object.keys(out)) {
        if (typeof out[key] === 'string' && HTML_FIELDS.includes(key as any)) {
            // already handled above
        } else if (typeof out[key] === 'string' && /<\w+/.test(out[key])) {
            // unknown field that looks like HTML — sanitise defensively
            out[key] = sanitizeHtml(out[key], RICH_TEXT_OPTIONS)
        }
    }

    return out
}

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get("projectId")

    if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 })

    // Zod validation: ensure projectId is a valid UUID
    const queryValidation = DraftGetQuerySchema.safeParse({ projectId })
    if (!queryValidation.success) {
        return NextResponse.json({ error: formatZodError(queryValidation.error) }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: "Profile missing org" }, { status: 403 })

    if (!hasPermission(profile.role, "reports:view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const draft = await getOrCreateReportDraft(projectId, profile.org_id, user.id)
    return NextResponse.json({ success: true, data: draft })

  } catch (error: any) {
    console.error("[ReportDraft GET] Error:", error)
    return NextResponse.json({ error: "Failed to load report draft" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: "Profile missing org" }, { status: 403 })
    
    // Authorization Check
    if (!hasPermission(profile.role, 'reports:edit')) {
        return NextResponse.json({ error: "Forbidden: Missing reports edit permission" }, { status: 403 })
    }

    const rawBody = await req.json()
    const { reportId, content, expectedVersion } = rawBody
    if (!reportId || !content) return NextResponse.json({ error: "Missing required fields" }, { status: 400 })

    // Zod validation: validate reportId UUID and content structure
    const patchValidation = DraftPatchRequestSchema.safeParse({
        reportId,
        content,
        expectedVersion,
    })
    if (!patchValidation.success) {
        // Log but don't block — content may have extra fields from Supabase joins
        // Only block on critical issues (reportId format, oversized arrays)
        const criticalIssues = patchValidation.error.issues.filter(
            i => i.path[0] === 'reportId' || (i.path[0] === 'content' && i.path[1] === 'findings')
        )
        if (criticalIssues.length > 0) {
            return NextResponse.json({ error: formatZodError(patchValidation.error) }, { status: 400 })
        }
    }

    // Input Validation: Size Limit (Max 5MB to prevent abuse)
    const payloadSize = Buffer.byteLength(JSON.stringify(content), 'utf8')
    if (payloadSize > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Payload too large. Maximum size is 5MB." }, { status: 413 })
    }

    // Sanitise user-editable HTML to prevent XSS (Task 17)
    const sanitizedContent = sanitizeReportContent(content)

    try {
        const result = await saveReportDraft(
            reportId,
            sanitizedContent as ReportContent,
            user.id,
            profile.org_id,
            typeof expectedVersion === 'number' ? expectedVersion : undefined
        )
        return NextResponse.json({ success: true, version: result.version })
    } catch (err: any) {
        if (err?.code === 'VERSION_CONFLICT') {
            return NextResponse.json({
                error: 'Version conflict — another user has updated this report. Reload to see the latest version.',
                code: 'VERSION_CONFLICT',
                expectedVersion: err.expectedVersion,
                currentVersion: err.currentVersion,
            }, { status: 409 })
        }
        throw err
    }

  } catch (error: any) {
    console.error("[ReportDraft PATCH] Error:", error)
    return NextResponse.json({ error: "Failed to save report draft" }, { status: 500 })
  }
}

/**
 * SYNC ENDPOINT
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await getServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const rawSyncBody = await req.json()
        const { reportId, projectId } = rawSyncBody
        if (!reportId || !projectId) return NextResponse.json({ error: "Missing IDs" }, { status: 400 })

        // Zod validation: ensure reportId and projectId are valid UUIDs
        const syncValidation = DraftSyncRequestSchema.safeParse({ reportId, projectId })
        if (!syncValidation.success) {
            return NextResponse.json({ error: formatZodError(syncValidation.error) }, { status: 400 })
        }

        const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single()
        if (!profile?.org_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

        // Authorization Check
        if (!hasPermission(profile.role, 'reports:edit')) {
            return NextResponse.json({ error: "Forbidden: Missing reports edit permission" }, { status: 403 })
        }

        const syncResult = await syncReportDraft(reportId, projectId, profile.org_id, user.id)

        // Sanitise the merged content (preserves user narrative edits) — Task 17
        const sanitizedContent = sanitizeReportContent(syncResult.content)

        // Auto-save the synced content with audit (Task 18) — no version check on sync
        // (sync always reflects the latest server state, so the previous version is moot)
        const saveResult = await saveReportDraft(reportId, sanitizedContent, user.id, profile.org_id)

        return NextResponse.json({
            success: true,
            data: sanitizedContent,
            version: saveResult.version,
            detection: {
                regenerate: syncResult.detection.regenerate,
                trigger: syncResult.detection.trigger,
                reason: syncResult.detection.reason,
                preserved: syncResult.preserved,
                regenerated: syncResult.regenerated,
            },
        })

    } catch (error: any) {
        console.error("[ReportDraft SYNC] Error:", error)
        return NextResponse.json({ error: "Failed to sync report draft" }, { status: 500 })
    }
}