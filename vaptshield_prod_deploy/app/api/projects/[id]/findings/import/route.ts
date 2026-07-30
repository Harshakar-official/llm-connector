import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await getServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single()
  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 })
  if (!["admin", "program_manager", "security_engineer"].includes(profile.role)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .single()
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const { parseImportFile, validateRows, sanitizeRow } = await import("@/lib/utils/import-export")

  const rows = parseImportFile(buffer, file.type)
  if (rows.length === 0) return NextResponse.json({ error: "No data found in file" }, { status: 400 })
  if (rows.length > 500) return NextResponse.json({ error: "Maximum 500 rows allowed per import" }, { status: 400 })

  const { valid, errors } = validateRows(rows)

  const now = new Date().toISOString()
  const records = valid.map(row => ({
    ...sanitizeRow(row),
    org_id: profile.org_id,
    project_id: id,
    found_by: user.id,
    status: (row.status || "open").toLowerCase(),
    created_at: now,
    updated_at: now,
  }))

  if (records.length > 0) {
    const { error: insertError } = await supabase.from("vulnerabilities").insert(records)
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    imported: records.length,
    errors,
    total_rows: rows.length,
  })
}
