// ============================================================
// VAPTShield — Modern HTML-Based Report Generator
// Renders reportTemplate.html via Python Jinja2,
// converts it to high-fidelity PDF via Playwright,
// and outputs DOCX via pdf2docx Converter.
// ============================================================

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'
import { ReportContent } from './engine'

interface ModernGeneratorOptions {
    date: string
    logoBuffer?: Buffer | null
    pocBuffers?: Record<string, { buffer: Buffer; mimeType: string }> | null
}

export async function generateModernReport(
    orgName: string,
    projectName: string,
    content: ReportContent,
    options: ModernGeneratorOptions
): Promise<{ pdfBuffer: Buffer; docxBuffer: Buffer }> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vapt-modern-'))
    const dataJsonPath = path.join(tempDir, 'data.json')
    const renderedHtmlPath = path.join(tempDir, 'rendered.html')
    const outputPdfPath = path.join(tempDir, 'report.pdf')
    const outputDocxPath = path.join(tempDir, 'report.docx')

    try {
        const date = options.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        const findings = content.findings || []
        const pocBuffers = options.pocBuffers || {}

        // Convert the logo buffer to base64 (if uploaded)
        let orgLogoB64 = ''
        if (options.logoBuffer) {
            orgLogoB64 = options.logoBuffer.toString('base64')
        }

        // Get the default logo (SecPrima Final Logo) from workspace
        let defaultLogoB64 = ''
        const localLogoPath = path.join(process.cwd(), 'SecPrima Final Logo.png')
        if (fs.existsSync(localLogoPath)) {
            defaultLogoB64 = fs.readFileSync(localLogoPath).toString('base64')
        }

        // Calculate severity counts
        const criticalCount = findings.filter(f => f.severity?.toLowerCase() === 'critical').length
        const highCount = findings.filter(f => f.severity?.toLowerCase() === 'high').length
        const mediumCount = findings.filter(f => f.severity?.toLowerCase() === 'medium').length
        const lowCount = findings.filter(f => f.severity?.toLowerCase() === 'low').length
        const infoCount = findings.filter(f => ['info', 'informational'].includes(f.severity?.toLowerCase() || '')).length

        // Prepare vulnerabilities list with base64 encoded poc screenshots
        const processedVulns = findings.map(f => {
            const vuln = f as any
            const poc_images_b64: string[] = []
            const rawPoc = vuln.proof_of_concept?.trim()
            
            if (rawPoc?.startsWith('[')) {
                try {
                    const steps = JSON.parse(rawPoc)
                    steps.forEach((step: any) => {
                        step.images?.forEach((img: any) => {
                            if (img.id && pocBuffers[img.id]) {
                                poc_images_b64.push(pocBuffers[img.id].buffer.toString('base64'))
                            }
                        })
                    })
                } catch (e) {}
            } else if (rawPoc) {
                // Parsing image tags
                const imgRegex = /<img[^>]+src="([^">]+)"/g
                let match
                while ((match = imgRegex.exec(rawPoc)) !== null) {
                    const src = match[1]
                    if (src.includes('path=')) {
                        const urlParts = src.split('path=')
                        if (urlParts.length >= 2) {
                            const encodedPath = urlParts[1].split('&')[0]
                            const decodedPath = decodeURIComponent(encodedPath)
                            const imgId = decodedPath.split('/').pop() || decodedPath
                            if (pocBuffers[imgId]) {
                                poc_images_b64.push(pocBuffers[imgId].buffer.toString('base64'))
                            }
                        }
                    }
                }
            }

            // Split reference links cleanly
            let refLinks: string[] = []
            if (vuln.reference_links) {
                if (Array.isArray(vuln.reference_links)) {
                    refLinks = vuln.reference_links
                } else if (typeof vuln.reference_links === 'string') {
                    refLinks = (vuln.reference_links as string).split('\n').map((l: string) => l.trim()).filter(Boolean)
                }
            }

            return {
                id: vuln.vuln_id || vuln.id || 'N/A',
                title: vuln.title || vuln.name || 'N/A',
                severity: vuln.severity || 'LOW',
                cvss_score: typeof vuln.cvss_score === 'number' ? vuln.cvss_score : parseFloat(vuln.cvss_score || '0') || 0,
                cvss_vector: vuln.cvss_vector || '',
                cwe_id: vuln.cwe_id || '',
                cwe_verified: true,
                status: vuln.status || 'open',
                affected_component: vuln.affected_component || '',
                endpoint_url: vuln.endpoint_url || '',
                description: vuln.description || '',
                impact: vuln.impact || '',
                remediation: vuln.remediation || '',
                reference_links: refLinks,
                proof_of_concept: vuln.proof_of_concept || '',
                poc_images_b64
            }
        })

        // Construct context object for renderTemplate.html
        const context = {
            client_name: content.project_details?.client_name || orgName || 'Valued Client',
            report_date: date,
            risk_score: content.risk_grade || 'A',
            org_logo_url: content.org_logo_url || '',
            org_logo_b64: orgLogoB64,
            exec_summary: {
                total_findings: findings.length,
                critical_count: criticalCount,
                high_count: highCount,
                medium_count: mediumCount,
                low_count: lowCount,
                info_count: infoCount,
                project_name: projectName,
                project_type: content.project_details?.assessment_type || 'Web Application VAPT',
                project_description: content.executive_summary || 'No description provided.',
                project_scope: content.scope || 'All specified application endpoints.',
                ai_summary: content.executive_summary || ''
            },
            vulnerabilities: processedVulns
        }

        // Save JSON context file
        fs.writeFileSync(dataJsonPath, JSON.stringify(context, null, 2), 'utf-8')

        // 1. Render HTML via Python Jinja2
        const renderScriptPath = path.join(process.cwd(), 'scripts', 'render_html.py')
        execSync(`python3 "${renderScriptPath}" "${dataJsonPath}" "${renderedHtmlPath}"`, { stdio: 'pipe' })

        // 2. Render PDF via Playwright chromium
        const browser = await chromium.launch({ headless: true })
        const page = await browser.newPage()
        const fileUrl = `file://${path.resolve(renderedHtmlPath)}`
        await page.goto(fileUrl, { waitUntil: 'load' })
        
        // Print PDF with header/footer templates and A4 paged CSS sizes
        const logoSrc = orgLogoB64 ? `data:image/png;base64,${orgLogoB64}` : `data:image/png;base64,${defaultLogoB64}`
        const clientLabel = content.project_details?.client_name || orgName || 'Valued Client'

        const pdfBuffer = await page.pdf({
            printBackground: true,
            preferCSSPageSize: true,
            displayHeaderFooter: true,
            headerTemplate: `
                <div style="font-size: 7.5pt; font-family: 'Inter', sans-serif; width: 100%; margin-left: 18mm; margin-right: 18mm; display: flex; justify-content: space-between; align-items: center; color: #94a3b8; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">
                    <span style="font-weight: 600; letter-spacing: 0.8px;">SECURITY ASSESSMENT REPORT</span>
                    <img src="${logoSrc}" style="height: 35px; width: auto; object-fit: contain; display: block;" />
                </div>
            `,
            footerTemplate: `
                <div style="font-size: 7.5pt; font-family: 'Inter', sans-serif; width: 100%; margin-left: 18mm; margin-right: 18mm; display: flex; justify-content: space-between; align-items: center; color: #94a3b8; padding-top: 5px; border-top: 1px solid #e2e8f0;">
                    <span>CONFIDENTIAL | ${clientLabel}</span>
                    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
                </div>
            `,
        })
        await browser.close()
        fs.writeFileSync(outputPdfPath, pdfBuffer)

        // 3. Convert PDF to DOCX via pdf2docx
        const pdfToDocxScriptPath = path.join(process.cwd(), 'scripts', 'pdf_to_docx.py')
        execSync(`python3 "${pdfToDocxScriptPath}" "${outputPdfPath}" "${outputDocxPath}"`, { stdio: 'pipe' })

        const finalPdfBuffer = fs.readFileSync(outputPdfPath)
        const finalDocxBuffer = fs.readFileSync(outputDocxPath)

        return {
            pdfBuffer: finalPdfBuffer,
            docxBuffer: finalDocxBuffer
        }

    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true })
        } catch (e) {
            console.warn("Failed to cleanup modern report generation temp folder:", e)
        }
    }
}
