import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/supabase/local-adapter"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  try {
    const report = await req.json()
    const pool = getPool()
    const blockedUri = report?.["csp-report"]?.blocked_uri || report?.blocked_uri || "unknown"
    const violatedDirective = report?.["csp-report"]?.violated_directive || report?.violated_directive || "unknown"
    const documentUri = report?.["csp-report"]?.document_uri || report?.document_uri || "unknown"
    await pool.query(
      `INSERT INTO audit_log (org_id, user_id, action, resource_type, resource_id, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000000",
        "csp.violation",
        "csp_report",
        crypto.randomUUID(),
        JSON.stringify({ blocked_uri: blockedUri, violated_directive: violatedDirective, document_uri: documentUri }),
        req.headers.get("x-forwarded-for") || "unknown",
      ]
    ).catch(() => {})
  } catch {}
  return NextResponse.json({ ok: true })
}
