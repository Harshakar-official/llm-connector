import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase/server"
import PDFDocument from "pdfkit"
import { hasPermission } from "@/lib/utils/permissions"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("org_id, role").eq("id", user.id).single()
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 403 })

    if (!hasPermission(profile.role, "scanners:view_history")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = await params

    const { data: scan, error: scanError } = await supabase
      .from("scan_history")
      .select("*")
      .eq("id", id)
      .eq("org_id", profile.org_id)
      .single()

    if (scanError || !scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 })

    const { data: findings } = await supabase
      .from("scan_findings")
      .select("*")
      .eq("scan_id", id)
      .eq("org_id", profile.org_id)
      .order("severity", { ascending: false })
      .limit(100)

    const doc = new PDFDocument({ margin: 50 })
    const buffers: Buffer[] = []
    
    doc.on("data", buffers.push.bind(buffers))
    
    return new Promise<NextResponse>((resolve, reject) => {
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers)
        resolve(new NextResponse(pdfData, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="VAPTShield-Report-${scan.repo_name || scan.scan_target || 'scan'}.pdf"`
          }
        }))
      })
      
      try {
        // Document Header
        doc.fontSize(24).fillColor('#1a1a2e').text("VAPTShield CI/CD Security Report", { align: "center" })
        doc.moveDown()
        doc.fontSize(12).fillColor('#4a4a5e').text(`Repository: ${scan.repo_name || scan.scan_target}`, { align: "center" })
        doc.text(`Date: ${new Date(scan.completed_at || scan.created_at).toLocaleString()}`, { align: "center" })
        doc.moveDown(2)

        // Summary
        doc.fontSize(16).fillColor('#1a1a2e').text("Executive Summary", { underline: true })
        doc.moveDown(0.5)
        const f = findings || []
        const counts = {
            critical: f.filter(x => x.severity === 'critical').length,
            high: f.filter(x => x.severity === 'high').length,
            medium: f.filter(x => x.severity === 'medium').length,
            low: f.filter(x => x.severity === 'low').length,
            info: f.filter(x => x.severity === 'informational' || x.severity === 'info').length
        }
        
        const totalFindingsCount = f.length >= 100 ? "100 (truncated for PDF size)" : f.length
        doc.fontSize(12).fillColor('#000000')
           .text(`Total Findings Shown: ${totalFindingsCount}`)
           .text(`Critical: ${counts.critical} | High: ${counts.high} | Medium: ${counts.medium} | Low: ${counts.low} | Info: ${counts.info}`)
        doc.moveDown(2)

        // Findings Details
        doc.addPage()
        doc.fontSize(16).fillColor('#1a1a2e').text("Detailed Findings", { underline: true })
        doc.moveDown()

        f.forEach((finding, index) => {
            doc.fontSize(14).fillColor('#e63946').text(`${index + 1}. ${finding.title || finding.id}`)
            doc.fontSize(10).fillColor('#1d3557').text(`Severity: ${finding.severity.toUpperCase()} | Status: ${finding.status}`)
            doc.moveDown(0.5)
            
            if (finding.description) {
                doc.fontSize(10).fillColor('#000000').text(finding.description.replace(/<[^>]+>/g, '').substring(0, 500) + '...')
            }
            
            // Output AI Patch if exists
            const aiPatch = finding.ai_normalized?.ai_patch
            if (aiPatch) {
                doc.moveDown()
                doc.fontSize(10).fillColor('#2a9d8f').text("✨ AI Generated Fix Available:")
                doc.fontSize(9).fillColor('#2b2d42')
                   .font('Courier')
                   .text(aiPatch.fixed_code || "See UI for code")
                   .font('Helvetica')
            }
            
            doc.moveDown(1.5)
        })

        if (f.length === 0) {
            doc.fontSize(12).fillColor('#2a9d8f').text("No vulnerabilities found! Your code is secure.", { align: "center" })
        }

        doc.end()
      } catch (e) {
        reject(NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 }))
      }
    })

  } catch (e: any) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 })
  }
}
