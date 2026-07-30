import { NextRequest, NextResponse } from 'next/server'
import { validateCveId } from '@/lib/ai/cve'
import { getSafeSession } from '@/lib/utils/security-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { orgId, error: authError } = await getSafeSession()
    if (authError || !orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const cveId = searchParams.get('cveId')

    if (!cveId) {
      return NextResponse.json({ error: "Missing cveId" }, { status: 400 })
    }

    const result = await validateCveId(cveId)
    return NextResponse.json(result)

  } catch (error) {
    console.error("CVE Validation Route Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
