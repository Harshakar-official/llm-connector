import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No org found" }, { status: 400 })

    const { id } = await params
    const pool = getPool()

    // 1. Get current scan details
    const { rows: currentScans } = await pool.query(
      `SELECT id, scan_target, created_at, status FROM scan_history 
       WHERE id = $1 AND org_id = $2`,
      [id, profile.org_id]
    )
    if (currentScans.length === 0) return NextResponse.json({ error: "Scan not found" }, { status: 404 })
    const currentScan = currentScans[0]

    // 2. Find the previous completed scan for the same target
    const { rows: prevScans } = await pool.query(
      `SELECT id, created_at FROM scan_history 
       WHERE org_id = $1 AND scan_target = $2 AND scan_type = 'zap' AND status = 'completed' AND created_at < $3
       ORDER BY created_at DESC LIMIT 1`,
      [profile.org_id, currentScan.scan_target, currentScan.created_at]
    )

    if (prevScans.length === 0) {
      return NextResponse.json({
        comparison: {
          hasPrevious: false,
          newAlerts: [],
          resolvedAlerts: [],
          persistedAlerts: []
        }
      })
    }

    const prevScanId = prevScans[0].id

    // 3. Fetch alerts for both scans
    // Using pending_alerts because ZAP stores raw alerts there
    const { rows: currentAlerts } = await pool.query(
      `SELECT alert_name, url FROM pending_alerts WHERE task_id = $1`,
      [id]
    )
    
    const { rows: prevAlerts } = await pool.query(
      `SELECT alert_name, url FROM pending_alerts WHERE task_id = $1`,
      [prevScanId]
    )

    // 4. Compare (using a simple composite key of alert_name + url)
    const currentKeys = new Set(currentAlerts.map((a: any) => `${a.alert_name}::${a.url}`))
    const prevKeys = new Set(prevAlerts.map((a: any) => `${a.alert_name}::${a.url}`))

    const newAlerts = currentAlerts.filter((a: any) => !prevKeys.has(`${a.alert_name}::${a.url}`))
    const resolvedAlerts = prevAlerts.filter((a: any) => !currentKeys.has(`${a.alert_name}::${a.url}`))
    const persistedAlerts = currentAlerts.filter((a: any) => prevKeys.has(`${a.alert_name}::${a.url}`))

    return NextResponse.json({
      comparison: {
        hasPrevious: true,
        previousScanId: prevScanId,
        newAlerts,
        resolvedAlerts,
        persistedAlerts,
        summary: {
          newCount: newAlerts.length,
          resolvedCount: resolvedAlerts.length,
          persistedCount: persistedAlerts.length,
        }
      }
    })

  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
