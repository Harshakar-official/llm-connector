import { getGroqRaw, DEFAULT_MODEL } from '@/lib/ai/groq'
import { VULN_GENERATOR_PROMPT } from '@/lib/ai/prompts'
import { getSafeSession } from '@/lib/utils/security-guard'
import { sanitizeForLLM, sanitizeLabel, detectInjectionAttempt } from '@/lib/ai/sanitize'
import { getGlobalAiRatelimit, createUserRatelimit } from '@/lib/ai/ratelimit'
import { calculateCvss40, getSeverityFromScore } from '@/lib/utils/cvss-official'
import { hasPermission } from '@/lib/utils/permissions'
import { z } from "zod"
import { Redis } from '@upstash/redis'
import { createHash } from 'crypto'
import sanitizeHtml from 'sanitize-html'

let redisInstance: Redis | null = null

const getRedis = () => {
  if (!redisInstance) redisInstance = Redis.fromEnv()
  return redisInstance
}

export const dynamic = 'force-dynamic'

const VALID_PROJECT_TYPES = [
  'web_app', 'api', 'mobile_app', 'desktop_app', 'network',
  'cloud', 'iot', 'blockchain', 'thick_client', 'other'
] as const

const requestSchema = z.object({
  projectId: z.string().uuid(),
  target: z.string().min(3).max(500),
  projectType: z.enum(VALID_PROJECT_TYPES),
  prompt: z.string().min(10).max(8000),
})

function normalizeAiResponse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { title: "AI Error", severity: "informational", cvss_score: 0, cvss_vector: "N/A", description: "AI returned invalid response structure" }
  }
  const obj = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'cvss_score') {
      if (value === null || value === undefined) { out[key] = 0; continue }
      const n = Number(value)
      out[key] = Number.isFinite(n) ? n : 0
    }
    else if (['cvss_vector', 'cwe_id', 'owasp_category', 'affected_component',
              'endpoint_url', 'impact', 'proof_of_concept', 'remediation'].includes(key)) {
      out[key] = (value === null || value === undefined) ? "" : String(value)
    }
    else if (key === 'reference_links' || key === 'references') {
      const targetKey = 'reference_links'
      if (Array.isArray(value)) {
        out[targetKey] = value.map(v => String(v))
      } else if (typeof value === 'string') {
        out[targetKey] = value.split(',').map(s => s.trim()).filter(Boolean)
      } else {
        out[targetKey] = []
      }
    }
    else {
      out[key] = value
    }
  }

  if (!('cvss_score' in out)) out.cvss_score = 0
  if (!('cvss_vector' in out)) out.cvss_vector = "N/A"
  if (!('description' in out)) out.description = "No description provided."

  // Z+ SECURITY: Force recalculation of score from vector string
  const vectorStr = String(out.cvss_vector || "")
  if (vectorStr.startsWith('CVSS:4.0')) {
    const calc = calculateCvss40(vectorStr)
    if (calc.success) {
      out.cvss_score = calc.score
      out.severity = calc.severity
    }
  }

  return out
}

const responseSchema = z.object({
  title: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'informational']),
  cvss_score: z.coerce.number().min(0).max(10),
  cvss_vector: z.string(),
  cwe_id: z.string().optional(),
  owasp_category: z.string().optional(),
  affected_component: z.string().optional(),
  endpoint_url: z.string().optional(),
  description: z.string(),
  impact: z.string().optional(),
  proof_of_concept: z.string().optional(),
  remediation: z.string().optional(),
  reference_links: z.array(z.string()).optional(),
})

export async function POST(req: Request) {
  try {
    const { orgId, user, role, error: authError } = await getSafeSession()
    if (authError || !orgId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    if (!hasPermission(role, "ai:vuln_generator")) {
        return new Response(JSON.stringify({ error: "Access denied" }), { status: 403 })
    }

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    const body = await req.json()
    const validated = requestSchema.parse(body)

    const injectionDetected = detectInjectionAttempt(validated.prompt)
        || detectInjectionAttempt(validated.target)
    if (injectionDetected) {
      console.warn(`[SECURITY] Prompt injection attempt blocked from user ${user?.id} on project ${validated.projectId}`)
      return new Response(JSON.stringify({ error: "Input rejected: potential prompt injection detected" }), { status: 400 })
    }

    const safeTarget = sanitizeLabel(validated.target, 500)
    const safeProjectType = sanitizeLabel(validated.projectType, 100)
    const safePrompt = sanitizeForLLM(validated.prompt)

    const inputHash = createHash('sha256')
        .update(JSON.stringify({ p: safePrompt, t: safeTarget }))
        .digest('hex')
    const cacheKey = `ai-cache:gen:${inputHash}`

    const redis = getRedis()
    const cached = await redis.get(cacheKey)
    if (cached) {
        console.log(`[AI Gen] Cache Hit: ${inputHash.slice(0,8)}`)
        return new Response(JSON.stringify(cached), {
            headers: { 'Content-Type': 'application/json', 'X-AI-Cache': 'HIT' }
        })
    }

    const userRatelimit = createUserRatelimit(10, '60 s')
    const globalRatelimit = getGlobalAiRatelimit()
    const [userRes, globalRes] = await Promise.all([
        userRatelimit.limit(`ai-gen:${user.id}`),
        globalRatelimit.limit(`ai_global_throttle`)
    ])

    if (!userRes.success || !globalRes.success) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }), { status: 429 })
    }

    const groq = getGroqRaw()
    const completion = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: VULN_GENERATOR_PROMPT.system },
        { role: 'user', content: VULN_GENERATOR_PROMPT.user(safeTarget, safeProjectType, safePrompt) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4096,
    })

    const rawContent = completion.choices[0]?.message?.content
    if (!rawContent) {
      return new Response(JSON.stringify({ error: "AI returned empty response" }), { status: 502 })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawContent)
    } catch {
      return new Response(JSON.stringify({ error: "AI returned invalid JSON" }), { status: 502 })
    }

    const normalized = normalizeAiResponse(parsed)
    const validated_response = responseSchema.parse(normalized)

    // Final sanity check for severity matching score
    const correctSeverity = getSeverityFromScore(validated_response.cvss_score)
    if (validated_response.severity !== correctSeverity) {
        validated_response.severity = correctSeverity
    }


    const sanitizeHtmlRich = (val: string | undefined): string => {
      if (!val) return ''
      return sanitizeHtml(val, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'pre', 'code', 'br']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          '*': ['class', 'style'],
          'img': ['src', 'alt', 'width', 'height', 'loading']
        }
      })
    }
    const sanitizePlainText = (val: string | undefined): string => {
      if (!val) return ''
      return sanitizeHtml(val, { allowedTags: [], allowedAttributes: {} })
    }

    const sanitized_response = {
      ...validated_response,
      title: sanitizePlainText(validated_response.title),
      description: sanitizeHtmlRich(validated_response.description),
      impact: sanitizeHtmlRich(validated_response.impact),
      proof_of_concept: sanitizeHtmlRich(validated_response.proof_of_concept),
      remediation: sanitizeHtmlRich(validated_response.remediation),
      cwe_id: sanitizePlainText(validated_response.cwe_id),
      owasp_category: sanitizePlainText(validated_response.owasp_category),
      affected_component: sanitizePlainText(validated_response.affected_component),
      endpoint_url: sanitizePlainText(validated_response.endpoint_url),
      cvss_vector: sanitizePlainText(validated_response.cvss_vector),
      reference_links: validated_response.reference_links?.map(link => sanitizePlainText(link)) ?? [],
    }

    await redis.setex(cacheKey, 3600, JSON.stringify(sanitized_response))

    return Response.json(sanitized_response)

  } catch (error) {
    console.error("AI Generate Error:", error)
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "AI response validation failed" }), { status: 502 })
    }
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  }
}
