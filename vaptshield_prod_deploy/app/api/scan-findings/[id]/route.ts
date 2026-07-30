import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"
import { hasPermission } from "@/lib/utils/permissions"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await getServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 403 })
    }

    if (!hasPermission(profile.role, "findings:delete")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // If the ID is a temporary AI parsed ID (not stored in DB), just return success
    if (id.startsWith("ai-")) {
      return NextResponse.json({ success: true })
    }

    const { error: err1, count: scanFindingsCount } = await supabase
      .from("scan_findings")
      .delete({ count: 'exact' })
      .eq("id", id)
      .eq("org_id", profile.org_id)

    const pool = getPool()
    let deletedCount = 0;
    try {
      const result = await pool.query('DELETE FROM pending_alerts WHERE id = $1 AND org_id = $2 RETURNING id', [id, profile.org_id])
      deletedCount = result.rowCount || 0;
    } catch (err2) {
      console.error("[DELETE /api/scan-findings] pending_alerts err:", err2)
    }

    if (deletedCount === 0 && (scanFindingsCount === 0 || scanFindingsCount === null)) {
        // Return success so the frontend UI can clear the ghost finding
        return NextResponse.json({ success: true, warning: "Finding not found or already deleted" }, { status: 200 })
    }

    // Ignore error if it's not found, we still want to return success for UI cleanup
    if (err1 && err1.code !== 'PGRST116') {
      console.error("[DELETE /api/scan-findings] err1:", err1)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
