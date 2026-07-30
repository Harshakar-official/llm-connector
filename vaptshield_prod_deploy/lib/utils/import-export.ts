import * as XLSX from "xlsx"

export const TEMPLATE_COLUMNS = [
  "title",
  "severity",
  "status",
  "cvss_score",
  "cvss_vector",
  "cve_id",
  "cwe_id",
  "owasp_category",
  "affected_component",
  "endpoint_url",
  "description",
  "impact",
  "proof_of_concept",
  "remediation",
  "reference_links",
  "tags",
] as const

export type ImportRow = Record<string, string | undefined>

const VALID_SEVERITIES = ["critical", "high", "medium", "low", "informational"]
const VALID_STATUSES = ["open", "reopened", "in_progress", "resolved", "verified", "closed", "accepted_risk", "false_positive"]

export function generateCsvTemplate(): string {
  const header = TEMPLATE_COLUMNS.join(",")
  const example = [
    "SQL Injection in Login",
    "critical",
    "open",
    "9.8",
    "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:L/SI:L/SA:L",
    "CVE-2024-1234",
    "CWE-89",
    "A03:2025-Injection",
    "/api/auth/login",
    "https://example.com/login",
    "SQL injection vulnerability in the username parameter...",
    "An attacker can bypass authentication...",
    "",
    "Use parameterized queries...",
    "https://owasp.org/www-community/attacks/SQL_Injection",
    "auth,login,high-priority",
  ].map(e => e.includes(",") || e.includes('"') ? `"${e.replace(/"/g, '""')}"` : e).join(",")
  return `${header}\n${example}\n`
}

export function generateExcelTemplate(): Buffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS as unknown as string[]])
  ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 20 }))
  XLSX.utils.book_append_sheet(wb, ws, "Template")
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}

export function parseImportFile(buffer: Buffer, mimeType: string): ImportRow[] {
  if (mimeType.includes("spreadsheet") || mimeType.includes("xlsx") || mimeType.includes("xls")) {
    return parseExcel(buffer)
  }
  return parseCsv(buffer.toString("utf-8"))
}

function parseCsv(content: string): ImportRow[] {
  const lines = content.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    const row: ImportRow = {}
    headers.forEach((h, i) => { row[h.trim()] = (values[i] || "").trim() })
    return row
  }).filter(r => r.title)
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = ""
    } else { current += ch }
  }
  result.push(current)
  return result
}

function parseExcel(buffer: Buffer): ImportRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" })
  return data.map(r => {
    const row: ImportRow = {}
    TEMPLATE_COLUMNS.forEach(col => { row[col] = String(r[col] ?? r[col.replace(/_/g, " ")] ?? "").trim() })
    return row
  }).filter(r => r.title)
}

export interface ValidationError {
  row: number
  field: string
  message: string
}

export function validateRows(rows: ImportRow[]): { valid: ImportRow[]; errors: ValidationError[] } {
  const valid: ImportRow[] = []
  const errors: ValidationError[] = []
  rows.forEach((row, idx) => {
    const rowNum = idx + 2
    if (!row.title || !row.title.trim()) {
      errors.push({ row: rowNum, field: "title", message: "Title is required" })
      return
    }
    if (row.severity && !VALID_SEVERITIES.includes(row.severity.toLowerCase())) {
      errors.push({ row: rowNum, field: "severity", message: `Must be one of: ${VALID_SEVERITIES.join(", ")}` })
      return
    }
    if (row.status && !VALID_STATUSES.includes(row.status.toLowerCase())) {
      errors.push({ row: rowNum, field: "status", message: `Must be one of: ${VALID_STATUSES.join(", ")}` })
      return
    }
    if (row.cvss_score) {
      const score = parseFloat(row.cvss_score)
      if (isNaN(score) || score < 0 || score > 10) {
        errors.push({ row: rowNum, field: "cvss_score", message: "Must be a number between 0 and 10" })
        return
      }
    }
    valid.push(row)
  })
  return { valid, errors }
}

export function sanitizeRow(row: ImportRow): Record<string, unknown> {
  const tags = row.tags ? row.tags.split("|").map(t => t.trim()).filter(Boolean) : []
  const reference_links = row.reference_links ? row.reference_links.split("|").map(t => t.trim()).filter(Boolean) : []
  const cvss_score = row.cvss_score ? parseFloat(row.cvss_score) : null
  return {
    title: row.title!.trim(),
    severity: (row.severity || "medium").toLowerCase(),
    status: (row.status || "open").toLowerCase(),
    cvss_score: isNaN(cvss_score as number) ? null : cvss_score,
    cvss_vector: row.cvss_vector?.trim() || null,
    cve_id: row.cve_id?.trim() || null,
    cwe_id: row.cwe_id?.trim() || null,
    owasp_category: row.owasp_category?.trim() || null,
    affected_component: row.affected_component?.trim() || null,
    endpoint_url: row.endpoint_url?.trim() || null,
    description: row.description?.trim() || null,
    impact: row.impact?.trim() || null,
    proof_of_concept: row.proof_of_concept?.trim() || null,
    remediation: row.remediation?.trim() || null,
    reference_links: reference_links.length > 0 ? reference_links : null,
    tags: tags.length > 0 ? tags : null,
  }
}

export function exportToCsv(findings: Record<string, unknown>[]): string {
  const escape = (val: unknown): string => {
    const str = String(val ?? "")
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  const headers = TEMPLATE_COLUMNS.map(c => escape(c)).join(",")
  const rows = findings.map(f =>
    TEMPLATE_COLUMNS.map(col => {
      let val = f[col]
      if (Array.isArray(val)) val = val.join("|")
      return escape(val ?? "")
    }).join(",")
  )
  return [headers, ...rows].join("\n")
}

export function exportToExcel(findings: Record<string, unknown>[]): Buffer {
  const data = findings.map(f => {
    const row: Record<string, unknown> = {}
    TEMPLATE_COLUMNS.forEach(col => {
      let val = f[col]
      if (Array.isArray(val)) val = val.join("|")
      row[col] = val ?? ""
    })
    return row
  })
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, "Findings")
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}
