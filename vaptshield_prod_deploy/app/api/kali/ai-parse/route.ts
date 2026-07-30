import { NextResponse } from "next/server"
import crypto from "crypto"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { getGroqRaw, DEFAULT_MODEL } from "@/lib/ai/groq"
import { TERMINAL_PARSE_PROMPT } from "@/lib/ai/prompts"
import { detectInjectionAttempt } from "@/lib/ai/sanitize"
import { logAudit } from "@/lib/utils/audit-server"
import { hasPermission } from "@/lib/utils/permissions"
import { z } from "zod"
import { sanitizeError } from "@/lib/utils/api-error"
import { slidingWindowRateLimit } from "@/lib/redis/rate-limit"

const findingSchema = z.object({
  finding_name: z.string().min(1).max(300),
  severity: z.enum(["critical", "high", "medium", "low", "informational"]),
  instances_count: z.number().int().min(0).optional().default(1),
  target: z.string().optional().default(""),
  parameter: z.string().nullable().optional().default(null),
  attack: z.string().nullable().optional().default(null),
  evidence: z.string().optional().default(""),
  method: z.string().nullable().optional().default(null),
  status_code: z.number().nullable().optional().default(null),
  response_size: z.number().nullable().optional().default(null),
  description: z.string().optional().default(""),
  impact: z.string().optional().default(""),
  remediation: z.string().optional().default(""),
  references: z.array(z.string()).optional().default([]),
  cwe_id: z.string().nullable().optional().default(null),
  cvss_score: z.number().min(0).max(10).optional().default(0),
  cvss_vector: z.string().optional().default(""),
  tool: z.string().optional().default("unknown"),
})

const aiResponseSchema = z.object({
  findings: z.array(findingSchema),
})

function mapSeverity(severity: string): string {
  const s = severity.toLowerCase()
  if (["critical", "high", "medium", "low", "informational"].includes(s)) return s
  if (s === "info") return "informational"
  return "medium"
}

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })
    if (!hasPermission(profile.role, "scanners:kali_terminal")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const ip = req.headers.get("x-forwarded-for") || "anonymous"
    const rateResult = await slidingWindowRateLimit(`ai-parse:${user.id}`, 10, 3600)
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const body = await req.json()
    const { output, tool_hint, project_id } = body
    if (!output || output.trim().length < 10) {
      return NextResponse.json({ error: "Output too short to parse" }, { status: 400 })
    }

    const injectionDetected = detectInjectionAttempt(output)
    if (injectionDetected) {
      console.warn(`[ai-parse] Injection attempt from user ${user.id}`)
    }

    // Truncate very large outputs to fit within model context (~8K total tokens)
    const truncated = output.slice(0, 10000)

    const groq = getGroqRaw()
    const toolHintStr = tool_hint
      ? `\nThe user indicated they ran: ${tool_hint}`
      : "\nDetect the tool from the output automatically."

    const completion = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: TERMINAL_PARSE_PROMPT.system + toolHintStr },
        { role: "user", content: `Raw terminal output to parse:\n\n${truncated}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 8192,
    })

    const content = completion.choices?.[0]?.message?.content || "{}"
    const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*$/gm, "").trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Return raw output as informational if AI fails to parse
      return NextResponse.json({
        ai_parsed: true,
        count: 0,
        findings: [],
        warning: "AI returned unstructured output. Raw terminal output is available for manual review.",
        output_preview: cleaned.slice(0, 500),
      })
    }

    const validated = aiResponseSchema.safeParse(parsed)
    if (!validated.success) {
      return NextResponse.json({
        ai_parsed: true,
        count: 0,
        findings: [],
        warning: "AI response validation failed. Some findings may not conform to expected format.",
        validation_errors: validated.error.issues.slice(0, 5),
      })
    }

    const { findings } = validated.data
    if (findings.length === 0) {
      return NextResponse.json({
        ai_parsed: true,
        count: 0,
        findings: [],
        note: "AI did not find any security-relevant findings in this output.",
      })
    }

    // ─── Save to pending_alerts always (project_id can be null) ───────────
    const pool = getPool()
    const taskId = crypto.randomUUID()
    const scanId = taskId
    let alertIds: string[] = []
    let savedCount = 0

    // Create zap_tasks entry for the approval flow
      await pool.query(
        `INSERT INTO zap_tasks (id, org_id, project_id, target_url, status, scan_config, started_by, started_at)
         VALUES ($1, $2, $3, 'ai-parse', 'completed', $4::jsonb, $5, NOW())`,
        [taskId, profile.org_id, project_id, JSON.stringify({ source: "ai-parse" }), user.id]
      )

      // Create scan_history entry
      await pool.query(
        `INSERT INTO scan_history (id, org_id, project_id, scan_type, scan_target, status, started_by, started_at, completed_at, findings_found)
         VALUES ($1, $2, $3, 'ai-parse', 'terminal-output', 'completed', $4, NOW(), NOW(), $5)`,
        [scanId, profile.org_id, project_id, user.id, findings.length]
      )

      // Save each finding as a pending_alert
      for (let i = 0; i < findings.length; i++) {
        const f = findings[i]
        const alertId = crypto.randomUUID()
        const severity = mapSeverity(f.severity)
        const cweNum = f.cwe_id ? parseInt(f.cwe_id.replace("CWE-", ""), 10) : null

        const rawData = {
          source: "ai-parse",
          tool: f.tool || tool_hint || "unknown",
          instances_count: f.instances_count || 1,
          attack: f.attack,
          parameter: f.parameter,
          method: f.method,
          status_code: f.status_code,
          response_size: f.response_size,
          impact: f.impact,
          cvss_score: f.cvss_score || 0,
          cvss_vector: f.cvss_vector || "",
          references: f.references || [],
          ai_parsed: true,
          raw_output_preview: truncated.slice(0, 500),
        }

        await pool.query(
          `INSERT INTO pending_alerts
             (id, task_id, org_id, project_id, alert_name, severity, url, description,
              raw_data, evidence, solution, reference, cweid, confidence, attack, param,
              other, method, statusCode)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            alertId, taskId, profile.org_id, project_id,
            f.finding_name, severity, f.target || null,
            f.description || null,
            JSON.stringify(rawData),
            f.evidence || null,
            f.remediation || null,
            f.references?.join("\n") || null,
            cweNum,
            2, // confidence: default medium
            f.attack || null,
            f.parameter || null,
            f.impact || null,
            f.method || null,
            f.status_code || null,
          ]
        )
        alertIds.push(alertId)
        savedCount++
      }

    await logAudit({
      action: "kali.ai_parse_complete",
      resource_type: "scan_history",
      resource_id: scanId,
      new_value: {
        findings_count: findings.length,
        saved_count: savedCount,
        tools_detected: [...new Set(findings.map(f => f.tool))],
      },
    })

    // ─── Return enriched findings to frontend ─────────────────────
    return NextResponse.json({
      ai_parsed: true,
      count: findings.length,
      saved_count: savedCount,
      task_id: taskId,
      scan_id: scanId,
      alert_ids: alertIds,
      findings: findings.map((f) => ({
        id: crypto.randomUUID(),
        tool: f.tool || "unknown",
        target: f.target || "",
        finding_name: f.finding_name,
        severity: mapSeverity(f.severity),
        description: f.description || null,
        impact: f.impact || null,
        remediation: f.remediation || null,
        evidence: f.evidence || "",
        parameter: f.parameter || null,
        attack: f.attack || null,
        method: f.method || null,
        status_code: f.status_code || null,
        response_size: f.response_size || null,
        cvss_score: f.cvss_score || null,
        cvss_vector: f.cvss_vector || null,
        cwe_id: f.cwe_id || null,
        references: f.references || [],
        instances_count: f.instances_count || 1,
        raw_data: {
          ai_parsed: true,
          tool: f.tool || "unknown",
          instances_count: f.instances_count || 1,
          impact: f.impact,
          cvss_score: f.cvss_score,
          references: f.references,
        },
        status: "pending",
        source: "ai-parse",
        task_id: taskId,
        alert_id: alertIds.length > 0 ? alertIds[findings.indexOf(f)] : null,
      })),
    })

  } catch (e) {
    console.error("[ai-parse] Error:", e)
    return NextResponse.json({
      error: sanitizeError(e),
      findings: [],
    }, { status: 500 })
  }
}
