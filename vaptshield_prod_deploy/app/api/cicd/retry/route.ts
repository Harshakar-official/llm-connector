import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { spawnCicdSession, triggerCicdScan } from "@/lib/docker/manager"
import { decrypt } from "@/lib/utils/encryption"

export async function POST(req: Request) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 400 })

    const { scanId } = await req.json()
    if (!scanId) return NextResponse.json({ error: "scanId is required" }, { status: 400 })

    const pool = getPool()
    
    // Check if scan exists and belongs to org
    const { rows: scanRows } = await pool.query(
      `SELECT h.id, h.status, h.scan_target, h.branch_name, h.commit_hash, c.repo_url, c.encrypted_pat
       FROM scan_history h
       JOIN cicd_configs c ON c.repo_url = h.scan_target AND c.org_id = h.org_id
       WHERE h.id = $1 AND h.org_id = $2`,
      [scanId, profile.org_id]
    )

    if (scanRows.length === 0) {
      return NextResponse.json({ error: "Scan not found or unauthorized" }, { status: 404 })
    }

    const scan = scanRows[0]
    if (scan.status !== "failed" && scan.status !== "stopped") {
      return NextResponse.json({ error: "Can only retry failed or stopped scans" }, { status: 400 })
    }

    // Mark as queued and clear old findings just in case
    await pool.query(
      `UPDATE scan_history SET status = 'queued', ended_at = NULL WHERE id = $1`,
      [scanId]
    )
    
    // Optionally delete old findings for this scan so we don't duplicate
    await pool.query(
      `DELETE FROM scan_findings WHERE scan_id = $1`,
      [scanId]
    )

    const pat = scan.encrypted_pat ? decrypt(scan.encrypted_pat) : undefined

    // Spawn async (no quota decrement needed since it's a retry of an existing paid scan)
    setTimeout(async () => {
      try {
        const spawnRes = await spawnCicdSession(scanId, profile.org_id, user.id, scan.repo_url)
        if (!spawnRes.success) throw new Error(spawnRes.error)
        
        await triggerCicdScan(
          scanId,
          spawnRes.sessionId!,
          profile.org_id,
          null, // projectId
          scan.repo_url,
          pat,
          scan.branch_name || "main",
          false,
          null, // prNumber
          scan.commit_hash || null
        )
      } catch (err: any) {
        console.error(`[Retry] Failed for scan ${scanId}:`, err.message)
        await pool.query(`UPDATE scan_history SET status = 'failed' WHERE id = $1`, [scanId])
      }
    }, 0)

    return NextResponse.json({ ok: true, scanId })
  } catch (err: any) {
    console.error("Retry Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
