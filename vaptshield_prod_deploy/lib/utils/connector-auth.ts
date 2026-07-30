import crypto from "crypto"
import { getPool } from "@/lib/supabase/local-adapter"

export interface ConnectorAuthResult {
  valid: boolean
  orgId: string
  keyId: string
}

export async function validateConnectorKey(req: Request): Promise<ConnectorAuthResult> {
  const auth = req.headers.get("Authorization")
  if (!auth || !auth.startsWith("Bearer ")) {
    return { valid: false, orgId: "", keyId: "" }
  }

  const key = auth.slice(7).trim()
  if (!key) return { valid: false, orgId: "", keyId: "" }

  const hash = crypto.createHash("sha256").update(key).digest("hex")
  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT id, org_id FROM connector_api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [hash]
  )

  if (rows.length === 0) return { valid: false, orgId: "", keyId: "" }

  return { valid: true, orgId: rows[0].org_id, keyId: rows[0].id }
}

export function generateConnectorKey(): { raw: string; hash: string; prefix: string } {
  const raw = crypto.randomUUID()
  const hash = crypto.createHash("sha256").update(raw).digest("hex")
  const prefix = raw.slice(0, 8)
  return { raw, hash, prefix }
}
