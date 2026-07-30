import { NextRequest, NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const format = request.nextUrl.searchParams.get("format") || "csv"
  const supabase = await getServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single()
  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { data: findings } = await supabase
    .from("vulnerabilities")
    .select("*")
    .eq("project_id", id)
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })

  if (!findings) return NextResponse.json({ error: "No findings" }, { status: 404 })

  const { exportToCsv, exportToExcel } = await import("@/lib/utils/import-export")

  if (format === "xlsx") {
    const buf = exportToExcel(findings as unknown as Record<string, unknown>[])
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="findings_${id.slice(0, 8)}.xlsx"`,
      },
    })
  }

  const csv = exportToCsv(findings as unknown as Record<string, unknown>[])
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="findings_${id.slice(0, 8)}.csv"`,
    },
  })
}
