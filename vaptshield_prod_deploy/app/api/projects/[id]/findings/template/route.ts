import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") || "csv"

  if (format === "xlsx") {
    const { generateExcelTemplate } = await import("@/lib/utils/import-export")
    const buf = generateExcelTemplate()
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vulnerability_template.xlsx"`,
      },
    })
  }

  const { generateCsvTemplate } = await import("@/lib/utils/import-export")
  const csv = generateCsvTemplate()
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="vulnerability_template.csv"`,
    },
  })
}
