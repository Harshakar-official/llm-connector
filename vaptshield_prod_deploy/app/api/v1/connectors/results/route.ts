import { NextResponse } from "next/server"
import { validateConnectorKey } from "@/lib/utils/connector-auth"
import { getPool } from "@/lib/supabase/local-adapter"
import { sanitizeError } from "@/lib/utils/api-error"

export async function POST(req: Request) {
  try {
    const authResult = await validateConnectorKey(req)
    if (!authResult.valid) {
      return NextResponse.json({ status: "error", message: "unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const result = body.result || body
    const pool = getPool()

    await pool.query(
      `UPDATE connector_jobs
       SET status = 'completed', response = $1, latency_ms = $2,
           tokens_in = $3, tokens_out = $4, error = $5, updated_at = NOW()
       WHERE id = $6 AND org_id = $7`,
      [
        result.response || "",
        result.latency_ms || 0,
        result.tokens_in || 0,
        result.tokens_out || 0,
        result.error || null,
        result.job_id,
        authResult.orgId,
      ]
    )

    return NextResponse.json({ status: "ok", message: "result received" })
  } catch (e) {
    return NextResponse.json({ status: "error", message: sanitizeError(e) }, { status: 500 })
  }
}
