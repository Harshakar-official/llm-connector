import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/utils/permissions"
import { z } from "zod"

export const dynamic = "force-dynamic"

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  enrichments: z.record(z.string(), z.any()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    if (!hasPermission(profile.role, "findings:approve_scan")) {
      return NextResponse.json({ error: "Forbidden — insufficient permissions to approve findings" }, { status: 403 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
    }

    const { ids, enrichments } = parsed.data

    // Apply AI enrichments to ai_normalized for each finding that has one
    if (enrichments) {
      for (const id of ids) {
        const enrichment = enrichments[id]
        if (enrichment) {
          await supabase
            .from("scan_findings")
            .update({ ai_normalized: enrichment })
            .eq("id", id)
            .eq("org_id", profile.org_id)
        }
      }
    }

    const { error, count } = await supabase
      .from("scan_findings")
      .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
      .in("id", ids)
      .eq("org_id", profile.org_id)

    if (error) throw error

    // Z+ FIX: Also handle pending_alerts for Kali Terminal
    const { data: pendingAlerts } = await supabase
      .from("pending_alerts")
      .select("*")
      .in("id", ids)
      .eq("org_id", profile.org_id)
      .eq("status", "pending")

    if (pendingAlerts && pendingAlerts.length > 0) {
      const vulns = pendingAlerts.map((pa: any) => {
        const enriched = enrichments?.[pa.id] || {}
        return {
          id: pa.id, // Reuse UUID so frontend can easily track it
          org_id: pa.org_id,
          project_id: pa.project_id,
          title: enriched.title || pa.alert_name,
          description: enriched.description || pa.description,
          severity: enriched.severity || pa.severity,
          endpoint_url: pa.url,
          proof_of_concept: pa.evidence,
          remediation: pa.solution,
          cwe_id: pa.cweid,
          raw_scanner_data: { ...pa.raw_data, source: "kali", original_alert_id: pa.id },
          status: "open",
          found_by: user.id,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          version: 1
        }
      })

      const { error: insertError } = await supabase.from("vulnerabilities").insert(vulns)
      if (!insertError) {
        await supabase.from("pending_alerts").delete().in("id", pendingAlerts.map((p: any) => p.id))
      }
    }

    return NextResponse.json({ success: true, count: ids.length })
  } catch (e: any) {
    console.error("[scan-findings bulk-approve] Error:", e.message)
    return NextResponse.json({ error: "Failed to bulk approve findings" }, { status: 500 })
  }
}
