import { getGroqRaw, DEFAULT_MODEL } from '@/lib/ai/groq'
import { PATCH_PROMPT } from '@/lib/ai/prompts'
import { getSafeSession } from '@/lib/utils/security-guard'
import { sanitizeForLLM, sanitizeLabel, sanitizeCode, detectInjectionAttempt } from '@/lib/ai/sanitize'
import { getGlobalAiRatelimit, createUserRatelimit } from '@/lib/ai/ratelimit'
import { hasPermission } from '@/lib/utils/permissions'
import { z } from "zod"
import { Redis } from '@upstash/redis'
import { createHash } from 'crypto'

let redisInstance: Redis | null = null

const getRedis = () => {
  if (!redisInstance) redisInstance = Redis.fromEnv()
  return redisInstance
}

export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  vulnTitle: z.string().min(1).max(2000),
  vulnerableCode: z.string().max(32000, "Code snippet too large").optional().default(""),
})

function normalizeAiResponse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { vulnerable_lines: [], explanation: "AI Error", fixed_code: "", fix_explanation: "AI returned invalid response" }
  }
  const obj = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'vulnerable_lines') {
      if (Array.isArray(value)) {
        out[key] = value.map((v: unknown) => {
          if (v === null || v === undefined) return 0
          const n = Number(v)
          return Number.isFinite(n) ? n : 0
        })
      } else if (typeof value === 'string') {
        out[key] = value.split(',').map(s => { const n = Number(s.trim()); return Number.isFinite(n) ? n : 0 })
      } else {
        out[key] = []
      }
    } else if (['explanation', 'fixed_code', 'fix_explanation'].includes(key)) {
      out[key] = (value === null || value === undefined) ? "" : String(value)
    } else {
      out[key] = value
    }
  }

  if (!('vulnerable_lines' in out)) out.vulnerable_lines = []
  if (!('explanation' in out)) out.explanation = ""
  if (!('fixed_code' in out)) out.fixed_code = ""
  if (!('fix_explanation' in out)) out.fix_explanation = ""

  return out
}

const responseSchema = z.object({
    vulnerable_lines: z.array(z.coerce.number()),
    explanation: z.string(),
    fixed_code: z.string(),
    fix_explanation: z.string(),
})

export async function POST(req: Request) {
  try {
    const { orgId, user, role, error: authError } = await getSafeSession()
    if (authError || !orgId || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    if (!hasPermission(role, "ai:patch_suggester")) {
        return new Response(JSON.stringify({ error: "Access denied" }), { status: 403 })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 })
    }
    const validated = requestSchema.parse(body)

    // Remove injection detection since vulnerable code naturally looks like an injection payload!
    // The LLM is smart enough to handle code patching without language hints.

    const inputHash = createHash('sha256')
        .update(JSON.stringify({ v: validated.vulnTitle, c: validated.vulnerableCode }))
        .digest('hex')
    const cacheKey = `ai-cache:patch:${inputHash}`

    const redis = getRedis()
    const cached = await redis.get(cacheKey)
    if (cached) {
        return new Response(JSON.stringify(cached), {
            headers: { 'Content-Type': 'application/json', 'X-AI-Cache': 'HIT' }
        })
    }

    const userRatelimit = createUserRatelimit(5, '60 s')
    const globalRatelimit = getGlobalAiRatelimit()
    const [userRes, globalRes] = await Promise.all([
        userRatelimit.limit(`ai_patch:${user.id}`),
        globalRatelimit.limit(`ai_global_throttle`)
    ])

    if (!userRes.success || !globalRes.success) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 })
    }

    const groq = getGroqRaw()
    const completion = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: PATCH_PROMPT.system('the source code', validated.vulnTitle) },
        { role: 'user', content: `Vulnerable Code to Analyze:\n\n${sanitizeForLLM(validated.vulnerableCode, 16000)}` },
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
    const finalData = responseSchema.parse(normalized)

    if (redisInstance) {
      await redisInstance.setex(cacheKey, 3600, JSON.stringify(finalData))
    }

    return new Response(JSON.stringify(finalData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error("[AI Patch Error]:", error)
    if (error instanceof z.ZodError || (error && (error as any).errors)) {
      return new Response(JSON.stringify({ 
        error: "AI response validation failed"
      }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    
    return new Response(JSON.stringify({ 
      error: "Failed to generate patch"
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
