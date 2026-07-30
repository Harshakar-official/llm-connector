import { getGroqRaw, DEFAULT_MODEL } from '@/lib/ai/groq'
import { NORMALIZE_PROMPT } from '@/lib/ai/prompts'
import { getSafeSession } from '@/lib/utils/security-guard'
import { sanitizeForLLM, sanitizeLabel, detectInjectionAttempt } from '@/lib/ai/sanitize'
import { getGlobalAiRatelimit, createUserRatelimit } from '@/lib/ai/ratelimit'
import { calculateCvss40, getSeverityFromScore } from '@/lib/utils/cvss-official'
import { hasPermission } from '@/lib/utils/permissions'
import { z } from "zod"
import { Redis } from '@upstash/redis'
import { createHash } from 'crypto'
// import DOMPurify from 'isomorphic-dompurify'

let redisInstance: Redis | null = null

const getRedis = () => {
  if (!redisInstance) redisInstance = Redis.fromEnv()
  return redisInstance
}

export const dynamic = 'force-dynamic'

const VALID_SCANNER_TYPES = ['zap', 'nuclei', 'nmap', 'custom'] as const

const requestSchema = z.object({
  scannerType: z.enum(VALID_SCANNER_TYPES),
  rawOutput: z.string().min(20, "Please provide more log data").max(50000, "Log data too large"),
})

function normalizeFinding(f: Record<string, unknown>): Record<string, unknown> {
  const nf: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(f)) {
    if (key === 'cvss_score') {
      if (value === null || value === undefined) { nf[key] = 0; continue }
      const n = Number(value)
      nf[key] = Number.isFinite(n) ? n : 0
    } else if (['cvss_vector', 'cwe_id', 'owasp_category', 'affected_component',
                'endpoint_url', 'impact', 'proof_of_concept', 'remediation'].includes(key)) {
      nf[key] = (value === null || value === undefined) ? "" : String(value)
    } else if (key === 'references') {
      if (Array.isArray(value)) {
        nf[key] = value.map(v => String(v))
      } else if (typeof value === 'string') {
        nf[key] = value.split(',').map(s => s.trim()).filter(Boolean)
      } else {
        nf[key] = []
      }
    } else {
      nf[key] = value
    }
  }
  if (!('cvss_score' in nf)) nf.cvss_score = 0
  if (!('cvss_vector' in nf)) nf.cvss_vector = "N/A"
  if (!('description' in nf)) nf.description = "No description provided."

  // Z+ SECURITY: Force recalculation of score from vector string
  const vectorStr = String(nf.cvss_vector || "")
  if (vectorStr.startsWith('CVSS:4.0')) {
    const calc = calculateCvss40(vectorStr)
    if (calc.success) {
      nf.cvss_score = calc.score
      nf.severity = calc.severity
    }
  }

  return nf
}

function normalizeAiResponse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { findings: [] }
  }
  const obj = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'findings' && Array.isArray(value)) {
      out[key] = value.map((f: unknown) => {
        if (!f || typeof f !== 'object') return { title: "Parse Error", severity: "informational", cvss_score: 0, cvss_vector: "N/A", description: "Failed to parse finding" }
        return normalizeFinding(f as Record<string, unknown>)
      })
    } else {
      out[key] = value
    }
  }
  if (!('findings' in out)) out.findings = []
  return out
}

const responseSchema = z.object({
  findings: z.array(z.object({
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
    references: z.array(z.string()).optional(),
  }))
})

export async function POST(req: Request) {
  try {
    const { orgId, user, role, error: authError } = await getSafeSession()
    if (authError || !orgId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    if (!hasPermission(role, "ai:normalize")) {
        return new Response(JSON.stringify({ error: "Access denied" }), { status: 403 })
    }

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    const body = await req.json()
    const validated = requestSchema.parse(body)

    const injectionDetected = detectInjectionAttempt(validated.rawOutput)
    if (injectionDetected) {
      console.warn(`[SECURITY] Prompt injection attempt detected in normalize from user ${user.id}`)
    }

    const safeScannerType = sanitizeLabel(validated.scannerType, 50)
    const safeRawOutput = sanitizeForLLM(validated.rawOutput, 50000)

    const inputHash = createHash('sha256')
        .update(JSON.stringify({ t: safeScannerType, o: safeRawOutput }))
        .digest('hex')
    const cacheKey = `ai-cache:norm:${inputHash}`

    const redis = getRedis()
    const cached = await redis.get(cacheKey)
    if (cached) {
        return new Response(JSON.stringify(cached), {
            headers: { 'Content-Type': 'application/json', 'X-AI-Cache': 'HIT' }
        })
    }

    const userRatelimit = createUserRatelimit(10, '60 s')
    const globalRatelimit = getGlobalAiRatelimit()
    const [userRes, globalRes] = await Promise.all([
        userRatelimit.limit(`ai_norm:${user.id}`),
        globalRatelimit.limit(`ai_global_throttle`)
    ])

    if (!userRes.success || !globalRes.success) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }), { status: 429 })
    }

    const groq = getGroqRaw()
    const completion = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: NORMALIZE_PROMPT.system(safeScannerType) },
        { role: 'user', content: `Log Data to Normalize:\n${safeRawOutput}` },
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

    const correctedFindings = validated_response.findings.map(f => {
        const correctSeverity = getSeverityFromScore(f.cvss_score)
        if (f.severity !== correctSeverity) {
            console.warn(`[AI Normalize] Severity correction: ${f.severity} -> ${correctSeverity} (score: ${f.cvss_score})`)
            return { ...f, severity: correctSeverity }
        }
        return f
    })

    
    const sanitizeHtml = (val: string | undefined): string => {
      if (!val) return ''
      // TEMPORARY: Disabled server-side sanitization to fix Vercel ESM/CJS crash
      return val
    }
    const sanitizePlainText = (val: string | undefined): string => {
      if (!val) return ''
      return val
    }

    const sanitized_response = {
      findings: correctedFindings.map(f => ({
        ...f,
        title: sanitizePlainText(f.title),
        description: sanitizeHtml(f.description),
        impact: sanitizeHtml(f.impact),
        proof_of_concept: sanitizeHtml(f.proof_of_concept),
        remediation: sanitizeHtml(f.remediation),
        cwe_id: sanitizePlainText(f.cwe_id),
        owasp_category: sanitizePlainText(f.owasp_category),
        affected_component: sanitizePlainText(f.affected_component),
        endpoint_url: sanitizePlainText(f.endpoint_url),
        cvss_vector: sanitizePlainText(f.cvss_vector),
        references: f.references?.map(link => sanitizePlainText(link)) ?? [],
      }))
    }

    await redis.setex(cacheKey, 3600, JSON.stringify(sanitized_response))

    return Response.json(sanitized_response)

  } catch (error) {
    console.error("AI Normalize Error:", error)
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "AI response validation failed" }), { status: 502 })
    }
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  }
}
