import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getGroqRaw, DEFAULT_MODEL } from "@/lib/ai/groq"
import { sanitizeError } from "@/lib/utils/api-error"
import { sanitizeForLLM } from "@/lib/ai/sanitize"
import { hasPermission } from "@/lib/utils/permissions"

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

    const body = await req.json()
    const { title, severity, target, description, raw_data, evidence } = body
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 })

    const safeTitle = sanitizeForLLM(String(title), 200)
    const safeSeverity = sanitizeForLLM(String(severity || "unknown"), 50)
    const safeTarget = sanitizeForLLM(String(target || "unknown"), 500)
    const safeDescription = sanitizeForLLM(String(description || "N/A"), 2000)
    const safeEvidence = sanitizeForLLM(
      evidence ? String(evidence) : raw_data ? JSON.stringify(raw_data).slice(0, 1000) : "N/A",
      2000
    )

    const groq = getGroqRaw()
    const prompt = `You are a senior penetration tester. Enrich this security finding with missing details.

Finding title: ${safeTitle}
Severity: ${safeSeverity}
Target: ${safeTarget}
Raw description: ${safeDescription}
Raw evidence: ${safeEvidence}

Respond with valid JSON only (no markdown):
{
  "description": "Detailed description of the vulnerability (2-3 sentences)",
  "impact": "Business/technical impact (1-2 sentences)",
  "remediation": "Step-by-step fix (2-3 steps)",
  "cvss_score": number between 0-10,
  "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N",
  "cwe_id": "CWE-XXX",
  "owasp_category": "A1:2021-Broken Access Control or similar",
  "reference_links": ["https://example.com"]
}`

    const completion = await groq.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    })

    const content = completion.choices?.[0]?.message?.content || "{}"
    const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*$/gm, "").trim()
    let enriched
    try {
      enriched = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({
        description: "AI enrichment completed",
        enrichment: { description: content.slice(0, 500) },
      })
    }

    return NextResponse.json({
      description: "AI enrichment completed",
      enrichment: {
        description: enriched.description || null,
        impact: enriched.impact || null,
        remediation: enriched.remediation || null,
        cvss_score: enriched.cvss_score || null,
        cvss_vector: enriched.cvss_vector || null,
        cwe_id: enriched.cwe_id || null,
        owasp_category: enriched.owasp_category || null,
        reference_links: enriched.reference_links || [],
      },
    })
  } catch (e) {
    console.error("[kali/verify-finding] Error:", e)
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 })
  }
}
