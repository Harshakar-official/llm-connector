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
    const pool = getPool()

    await pool.query(
      `UPDATE connectors
       SET status = $1, models_count = $2, llm_type = $3, llm_status = $4,
           active_jobs = $5, last_heartbeat_at = NOW()
       WHERE connector_id = $6 AND org_id = $7`,
      [
        body.status || "online",
        body.models_count || 0,
        body.llm_type || "none",
        body.llm_status || "disconnected",
        body.active_jobs || 0,
        body.connector_id,
        authResult.orgId,
      ]
    )

    return NextResponse.json({ status: "ok" })
  } catch (e) {
    return NextResponse.json({ status: "error", message: sanitizeError(e) }, { status: 500 })
  }
}
