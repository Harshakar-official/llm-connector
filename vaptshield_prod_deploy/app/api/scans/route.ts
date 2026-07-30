import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import { getPool } from "@/lib/supabase/local-adapter"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)))
    const typeFilter = searchParams.get("scan_type") || ""
    const statusFilter = searchParams.get("status") || ""
    const search = searchParams.get("search") || ""

    const offset = (page - 1) * limit

    let query = supabase
      .from("scan_history")
      .select(`
        id, scan_type, scan_target, status, findings_found, findings_approved,
        started_by, started_at, completed_at, duration_seconds, error_message,
        raw_output, raw_output_json, branch_name, commit_hash,
        projects (id, name),
        profiles!scan_history_started_by_fkey (id, full_name)
      `, { count: "exact" })
      .eq("org_id", profile.org_id)

    if (typeFilter && typeFilter !== "all") {
      query = query.eq("scan_type", typeFilter)
    }

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter)
    }

    if (search) {
      query = query.or(`scan_target.ilike.%${search}%,branch_name.ilike.%${search}%`)
    }

    query = query.order("started_at", { ascending: false })
    query = query.range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) throw error

    const scans = (data || []).map((row: any) => ({
      id: row.id,
      scan_type: row.scan_type,
      scan_target: row.scan_target,
      status: row.status,
      findings_found: row.findings_found,
      findings_approved: row.findings_approved,
      started_by: row.started_by,
      started_at: row.started_at,
      completed_at: row.completed_at,
      duration_seconds: row.duration_seconds,
      error_message: row.error_message,
      raw_output: row.raw_output,
      raw_output_json: row.raw_output_json,
      branch_name: row.branch_name,
      commit_hash: row.commit_hash,
      project_name: row.projects?.name || null,
      user_name: row.profiles?.full_name || null,
    }))

    return NextResponse.json({ scans, total: count ?? 0, page, limit })
  } catch (e: any) {
    console.error("[scans GET] Error:", e.message)
    return NextResponse.json({ error: "Failed to fetch scans" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    if (profile.role !== "admin" && profile.role !== "security_engineer") {
      return NextResponse.json({ error: "Forbidden: Only admins can delete scans" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    const ids = searchParams.get("ids")
    const all = searchParams.get("all") === "true"

    if (!id && !ids && !all) return NextResponse.json({ error: "Scan ID(s) or all=true is required" }, { status: 400 })

    let deleteQuery = "DELETE FROM scan_history WHERE org_id = $1"
    const params: any[] = [profile.org_id]

    if (!all) {
      if (ids) {
        const idList = ids.split(",").map(i => i.trim()).filter(Boolean)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const validIds = idList.filter(i => uuidRegex.test(i))
        if (validIds.length > 0) {
          deleteQuery += " AND id = ANY($2)"
          params.push(validIds)
        } else {
          return NextResponse.json({ error: "No valid UUIDs provided" }, { status: 400 })
        }
      } else if (id) {
        deleteQuery += " AND id = $2"
        params.push(id)
      }
    }

    const pool = getPool()
    await pool.query(deleteQuery, params)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("[scans DELETE] Error:", e.message)
    return NextResponse.json({ error: "Failed to delete scan" }, { status: 500 })
  }
}