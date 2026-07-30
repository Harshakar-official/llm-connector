import { NextResponse } from "next/server"
import { validateConnectorKey } from "@/lib/utils/connector-auth"
import { getPool } from "@/lib/supabase/local-adapter"
import { sanitizeError } from "@/lib/utils/api-error"

const registerSchema = {
  connector_id: (v: unknown) => typeof v === "string" && v.length > 0,
  version: (v: unknown) => typeof v === "string",
  platform: (v: unknown) => typeof v === "string",
  hostname: (v: unknown) => typeof v === "string",
}

function validate(body: Record<string, unknown>): string | null {
  for (const [key, check] of Object.entries(registerSchema)) {
    if (!check(body[key])) return `${key} is required or invalid`
  }
  return null
}

export async function POST(req: Request) {
  try {
    const authResult = await validateConnectorKey(req)
    if (!authResult.valid) {
      return NextResponse.json({ status: "error", message: "unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const err = validate(body)
    if (err) {
      return NextResponse.json({ status: "error", message: err }, { status: 400 })
    }

    const pool = getPool()
    const { connector_id, version, platform, hostname } = body as {
      connector_id: string
      version: string
      platform: string
      hostname: string
    }

    await pool.query(
      `INSERT INTO connectors (org_id, connector_id, version, platform, hostname, api_key_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'online')
       ON CONFLICT (connector_id)
       DO UPDATE SET version = EXCLUDED.version, platform = EXCLUDED.platform,
                      hostname = EXCLUDED.hostname, status = 'online',
                      updated_at = NOW()`,
      [authResult.orgId, connector_id, version, platform, hostname, authResult.keyId]
    )

    return NextResponse.json({ status: "ok", message: "registered" })
  } catch (e) {
    return NextResponse.json({ status: "error", message: sanitizeError(e) }, { status: 500 })
  }
}
