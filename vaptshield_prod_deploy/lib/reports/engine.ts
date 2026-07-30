// ============================================================
// VAPTShield — Report Generation Engine (Next-Gen Hub)
// Fetches data, manages editable drafts, and orchestrates rendering.
// ============================================================

import { getServerClient } from '@/lib/supabase/server'
import type { Vulnerability, VulnAttachment, Project } from '@/lib/supabase/types'
import { getGroqRaw, DEFAULT_MODEL } from '@/lib/ai/groq'
import { REPORT_FULL_NARRATIVE_PROMPT } from '@/lib/ai/prompts'
import crypto from 'crypto'

// ─── AI Narrative Logic ───────────────────────────────────────

/**
 * GENERATE AI NARRATIVE
 * Analyzes findings and produces elite strategic text.
 */
async function generateAINarrative(orgName: string, projectName: string, findings: any[]): Promise<Partial<ReportContent>> {
    const groq = getGroqRaw()
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: REPORT_FULL_NARRATIVE_PROMPT.system },
                { role: "user", content: REPORT_FULL_NARRATIVE_PROMPT.user(orgName, projectName, findings) }
            ],
            model: DEFAULT_MODEL,
            response_format: { type: "json_object" }
        })

        const res = JSON.parse(completion.choices[0].message.content || '{}')
        return {
            executive_summary: res.executive_summary,
            technical_summary: res.technical_summary,
            recommendations: res.recommendations
        }
    } catch (err) {
        console.error("[AINarrative] AI generation failed, falling back to smart defaults:", err)
        return {}
    }
}

// ─── Types ────────────────────────────────────────────────────

export interface ImageBuffer {
  id: string
  buffer: Buffer
  mimeType: string
}

export interface FindingSnapshot extends Vulnerability {
    found_by_name?: string
    found_by_avatar?: string
}

// ─── Smart-merge metadata types (Phase 1 — V2 architecture) ───

/**
 * Snapshot of what triggered the last AI generation.
 * Used by detectChanges() to decide if a regen is needed.
 */
export interface AITrigger {
  finding_count: number
  finding_ids: string[]
  finding_hashes: Record<string, string>  // id -> sha256 prefix
  generated_at: string
}

/**
 * Per-user version history entry. One row per save/sync.
 * Captures WHO, WHEN, WHERE, WHAT, and WHY.
 */
export interface VersionHistoryEntry {
  v: number                          // monotonic version number
  at: string                         // ISO timestamp
  by_user_id: string                 // auth.uid() of the editor
  by_user_name: string               // profiles.full_name at time of save
  by_user_avatar: string | null      // profiles.avatar_url at time of save
  by_org_id: string                  // org_id of the report
  by_project_id: string              // project_id of the report
  by_project_name: string            // projects.name at time of save
  reason: 'initial' | 'manual_edit' | 'finding_change' | 'reset_to_ai' | 'restore_version' | 'sync' | 'generate'
  finding_count: number
  findings_added: number
  findings_removed: number
  narrative_preserved: number        // count of fields where user's edit was kept
  derived_regenerated: number        // count of auto-derived fields re-computed
  trigger: 'count_changed' | 'findings_added_or_removed' | 'finding_content_changed' | 'no_change' | 'manual_only' | 'forced'
  snapshot?: any                     // The full content snapshot at this version
}

export interface ReportContent {
  executive_summary: string
  technical_summary: string
  methodology: string
  scope: string
  disclaimer: string
  findings: FindingSnapshot[]
  severity_counts: Record<string, number>
  risk_grade: string
  generated_at: string
  template_type: 'classic' | 'modern'
  org_logo_url?: string | null

  // Professional DNA additions (Cybernerds Spec)
  project_details: {
      version: string
      document_id: string
      document_hash: string
      assessment_type: string
      testing_type: string
      environment: string
      assessment_start: string
      assessment_end: string
      client_name: string
      tester_name: string
      tester_role: string
      reviewer_name: string
      reviewer_role: string
      approver_name: string
      approver_role: string
  }

  owasp_compliance: {
      id: string
      name: string
      status: 'Safe' | 'Unsafe'
  }[]


  url_risk_table: {
      url: string
      risk_level: string
  }[]

  recommendations: string

  conclusions: {
      summary_text: string
      severity_chart_data: { label: string, count: number, color: string }[]
  }

  severity_rating_definitions: {
      severity: string
      cvss_range: string
      definition: string
  }[]

  annexures: {
      test_list: { category: string, tests: string[] }[]
      glossary: { term: string, definition: string }[]
      methodology_details: string
      test_types: { type: string, description: string }[]
      application_vulnerabilities: string[]
      web_based_attacks: string
  }

  // ─── Smart-merge meta (Phase 1 — not rendered) ─────────────
  // Findings the user soft-deleted in V2 (kept in project DB, hidden in this report)
  _excluded_finding_ids?: string[]
  // AI's last-generated snapshot — used to detect user edits
  _ai_baseline?: Partial<ReportContent>
  // What the last AI run was based on (findings count/IDs/hashes)
  _ai_trigger?: AITrigger
  // Per-user version history (most recent last, capped at 20)
  _version_history?: VersionHistoryEntry[]
}

export interface ReportData {
  id?: string
  version?: number         // Optimistic locking — Task 19
  project: Project
  orgName: string
  content: ReportContent
  poc_image_buffers?: Record<string, ImageBuffer>
}

// ─── Smart-merge helpers (Phase 1 — V2 architecture) ──────────

/** Stable hash of a finding's user-visible fields. Used to detect content changes. */
export function hashFinding(f: any): string {
  const payload = JSON.stringify({
    title: f.title || '',
    severity: (f.severity || '').toLowerCase(),
    cvss_score: f.cvss_score ?? 0,
    cve_id: f.cve_id || '',
    cwe_id: f.cwe_id || '',
    owasp_category: f.owasp_category || '',
    status: f.status || '',
    endpoint_url: f.endpoint_url || '',
    cvss_vector: f.cvss_vector || '',
    description: f.description || '',
    impact: f.impact || '',
    remediation: f.remediation || '',
  })
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

/** Build a trigger snapshot from a list of findings. */
export function buildAITrigger(findings: any[]): AITrigger {
  const finding_hashes: Record<string, string> = {}
  for (const f of findings) {
    if (f.id) finding_hashes[f.id] = hashFinding(f)
  }
  return {
    finding_count: findings.length,
    finding_ids: findings.map(f => f.id).filter(Boolean),
    finding_hashes,
    generated_at: new Date().toISOString(),
  }
}

export interface ChangeDetectionResult {
  regenerate: boolean
  trigger: VersionHistoryEntry['trigger']
  reason: string
  oldCount: number
  newCount: number
  addedFindings: any[]
  removedFindingIds: string[]
  changedFindingId?: string
}

/**
 * DECIDE: should the AI regen this report?
 * - Count changed (15 → 16)                 → regen
 * - Same count, IDs added/removed            → regen
 * - Same count + IDs, but content hash differs → regen
 * - Nothing changed                          → no regen (return user's preserved version)
 */
export function detectChanges(
  currentFindings: any[],
  trigger?: AITrigger
): ChangeDetectionResult {
  const newCount = currentFindings.length
  const oldCount = trigger?.finding_count ?? newCount
  const noTrigger = !trigger

  if (noTrigger) {
    return {
      regenerate: true,
      trigger: 'no_change',
      reason: 'no_previous_trigger',
      oldCount,
      newCount,
      addedFindings: currentFindings,
      removedFindingIds: [],
    }
  }

  // Case 1: count changed
  if (oldCount !== newCount) {
    return {
      regenerate: true,
      trigger: 'count_changed',
      reason: `finding count changed (${oldCount} → ${newCount})`,
      oldCount,
      newCount,
      addedFindings: currentFindings.filter(f => !trigger.finding_ids.includes(f.id)),
      removedFindingIds: trigger.finding_ids.filter(id => !currentFindings.find(f => f.id === id)),
    }
  }

  // Case 2: same count, but IDs differ
  const currentIds = new Set(currentFindings.map(f => f.id))
  const oldIds = new Set(trigger.finding_ids)
  const sameIds = currentIds.size === oldIds.size && [...currentIds].every(id => oldIds.has(id))
  if (!sameIds) {
    return {
      regenerate: true,
      trigger: 'findings_added_or_removed',
      reason: 'findings added or removed (count unchanged but IDs differ)',
      oldCount,
      newCount,
      addedFindings: currentFindings.filter(f => !oldIds.has(f.id)),
      removedFindingIds: [...oldIds].filter(id => !currentIds.has(id)),
    }
  }

  // Case 3: same count + same IDs, but content changed
  for (const f of currentFindings) {
    const newHash = hashFinding(f)
    if (trigger.finding_hashes?.[f.id] !== newHash) {
      return {
        regenerate: true,
        trigger: 'finding_content_changed',
        reason: `finding content changed (${f.title || f.id})`,
        oldCount,
        newCount,
        addedFindings: [],
        removedFindingIds: [],
        changedFindingId: f.id,
      }
    }
  }

  return {
    regenerate: false,
    trigger: 'no_change',
    reason: 'no changes detected',
    oldCount,
    newCount,
    addedFindings: [],
    removedFindingIds: [],
  }
}

export interface SmartMergeResult {
  merged: Partial<ReportContent>
  preserved: string[]   // field names where user edit was kept
  regenerated: string[] // field names where new AI value was used
}

/**
 * SMART MERGE: combine fresh AI output with user's current content.
 * Rule: if user edited a field (user ≠ AI baseline), keep user's version.
 *       otherwise, use the new AI value.
 */
export function smartMerge(
  aiNewContent: Partial<ReportContent>,
  userContent: ReportContent,
  aiBaseline: Partial<ReportContent> | undefined
): SmartMergeResult {
  const userEditableFields = [
    'executive_summary',
    'technical_summary',
    'methodology',
    'scope',
    'disclaimer',
    'recommendations',
    'appendix',
  ]

  const preserved: string[] = []
  const regenerated: string[] = []
  const merged: any = { ...aiNewContent }

  for (const field of userEditableFields) {
    const userVal = (userContent as any)[field]
    const baselineVal = aiBaseline ? (aiBaseline as any)[field] : undefined

    if (typeof userVal === 'string' && typeof baselineVal === 'string' && userVal !== baselineVal) {
      // User edited this field — preserve
      merged[field] = userVal
      preserved.push(field)
    } else {
      // User didn't touch (or no baseline) — use new AI value
      if ((aiNewContent as any)[field] !== undefined) {
        merged[field] = (aiNewContent as any)[field]
      }
      regenerated.push(field)
    }
  }

  return { merged, preserved, regenerated }
}

/** Deep strip of all `_`-prefixed meta fields from a content object. */
export function stripMeta<T extends Partial<ReportContent>>(content: T): T {
  const result: any = {}
  for (const k of Object.keys(content)) {
    if (!k.startsWith('_')) result[k] = content[k as keyof T]
  }
  return result
}

/** Append (or initialize) the version history array, capped at 20 entries. */
export function appendVersion(
  content: ReportContent,
  entry: VersionHistoryEntry
): VersionHistoryEntry[] {
  const history = content._version_history || []
  
  // Clone the snapshot and remove recursive history to prevent exponential bloat
  if (entry.snapshot) {
      entry.snapshot = { ...entry.snapshot }
      delete entry.snapshot._version_history
      delete entry.snapshot._ai_baseline
  }
  
  const next = [...history, entry]
  // Keep most recent 10 to conserve JSON payload size
  return next.slice(-10)
}

// ─── Draft Management ─────────────────────────────────────────

/**
 * FETCH OR INITIALIZE DRAFT
 */
export async function getOrCreateReportDraft(
  projectId: string,
  orgId: string,
  userId: string
): Promise<ReportData> {
  const supabase = await getServerClient()

  // 1. Check for existing draft
  const { data: existingReport } = await supabase
    .from('reports')
    .select('*, profiles:created_by(full_name, avatar_url)')
    .eq('project_id', projectId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingReport && existingReport.report_content) {
    const project = await fetchProjectDetails(projectId, orgId)
    const org = await fetchOrgDetails(orgId)
    const content = existingReport.report_content as unknown as ReportContent
    
    // Forensic DNA Auto-Healing: Ensure high-fidelity boilerplate is applied
    if (!content.disclaimer || content.disclaimer.length < 500) {
        content.disclaimer = `<b>Confidentiality & Disclaimer Notice</b><br/><br/>All information contained within this document is strictly confidential and proprietary to VAPTShield and ${org.name}. This report pertains exclusively to the security assessment conducted against the target environment defined in the scope and is intended solely for internal security review and remediation purposes by authorized personnel.<br/><br/>Any unauthorized disclosure, reproduction, distribution, or use of this document — in whole or in part — through electronic, photographic, mechanical, or any other means is strictly prohibited without prior written consent from VAPTShield.<br/><br/><b>Scope of Assessment & Testing Conclusion</b><br/><br/>This penetration test was formally concluded against the agreed-upon build and environment defined at the outset of the engagement. All testing activities were carried out under a structured, controlled methodology during the designated assessment window. The security findings and observations documented herein reflect the posture of the application as it existed at the precise time of testing.<br/><br/>VAPTShield assumes no responsibility for any vulnerabilities, exposures, or security gaps identified by any other vendor, third-party assessor, or internal team — whether before, during, or after this engagement.<br/><br/><b>Limitations & Exclusions</b><br/><br/>The following exclusions and limitations apply: 1. <b>Post-Assessment Changes</b>: VAPTShield bears no responsibility for any vulnerabilities arising from changes, patches, or code modifications made following the completion of testing. 2. <b>Zero-Day Vulnerabilities</b>: This assessment does not account for zero-day vulnerabilities or newly emerging threats identified after the conclusion of testing. VAPTShield shall bear no liability in the event of a zero-day attack or any exploit leveraging previously unknown vulnerabilities.`;
    }

    if (!content.methodology || content.methodology.length < 300) {
        content.methodology = `<b>1. Information Gathering</b>: Collected details about the platform’s structure, technologies used, and exposed endpoints. Mapped user roles, workflows, and privilege levels.<br/><br/><b>2. Threat Modelling & Role-Based Testing</b>: Identified potential threats unique to the platform. Tested role-based access control (RBAC) by verifying whether each user role was restricted to its intended permissions.<br/><br/><b>3. Vulnerability Assessment</b>: Performed automated and manual scans to detect weaknesses such as misconfigurations, insecure session handling, and outdated components.<br/><br/><b>4. Exploitation & Proof-of-Concept</b>: Safely attempted to exploit identified vulnerabilities to validate impact. Demonstrated real-world scenarios without disrupting production stability.<br/><br/><b>5. Impact Analysis</b>: Assessed the real-world business and operational impact of each confirmed vulnerability across the CIA triad (Confidentiality, Integrity, Availability).<br/><br/><b>6. Reporting</b>: Documented all findings with step-by-step reproduction details, proof-of-concept evidence, and mapped them to CVSS v4.0 severity ratings.`;
    }

    // Professional DNA: Ensure metadata isn't N/A or empty
    if (!content.project_details?.document_id || content.project_details.document_id === 'N/A') {
        if (!content.project_details) content.project_details = {} as any;
        content.project_details.document_id = `CNS/R/${new Date().getFullYear()}/${projectId.slice(0, 8).toUpperCase()}`
    }
    if (!content.project_details.document_hash || content.project_details.document_hash === 'N/A') {
        content.project_details.document_hash = crypto.createHash('sha512').update(projectId + Date.now().toString()).digest('hex').toUpperCase()
    }
    if (!content.methodology || content.methodology === 'N/A') {
        content.methodology = "Standard VAPT methodology including Passive Reconnaissance, Active Scanning, Manual Exploitation, and Post-Exploitation analysis. Testing modeled after OWASP WSTG v4.2 and NIST SP 800-115 frameworks."
    }
    if (!content.scope || content.scope === 'N/A') {
        content.scope = project.scope || "Assessment focused on all public-facing endpoints and authenticated user workflows of the application."
    }

    // Backward-compat auto-heal: drafts created before these fields existed
    // don't have them. Populate them from the latest engine data without
    // touching the user's manually-edited narrative (executive_summary,
    // technical_summary, recommendations).
    const needsBackfill =
      !content.severity_rating_definitions ||
      !content.conclusions ||
      !content.annexures ||
      !content.owasp_compliance ||
      !content.url_risk_table ||
      !content.project_details?.client_name

    if (needsBackfill) {
      try {
        const findings = await fetchProjectFindings(projectId, orgId)
        const severityCounts = computeSeverityCounts(findings)
        const sortedFindings = [...findings].sort((a, b) => {
          const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 }
          return (order[a.severity?.toLowerCase() || 'informational'] ?? 5) - (order[b.severity?.toLowerCase() || 'informational'] ?? 5)
        })

        if (!content.severity_rating_definitions || content.severity_rating_definitions.length === 0) {
          content.severity_rating_definitions = [
            { severity: "Critical", cvss_range: "9.0 – 10.0", definition: "Total compromise of system integrity, confidentiality, or availability. Immediate exploitation possible with severe business impact." },
            { severity: "High", cvss_range: "7.0 – 8.9", definition: "Significant vulnerability that can be exploited to gain elevated access or cause substantial damage to the application or its data." },
            { severity: "Medium", cvss_range: "4.0 – 6.9", definition: "Exploitable vulnerability requiring specific conditions. May lead to partial data exposure or limited system compromise." },
            { severity: "Low", cvss_range: "0.1 – 3.9", definition: "Minor security weakness with minimal direct impact. These issues are often used as part of a larger, chained attack." },
            { severity: "Informational", cvss_range: "N/A", definition: "No direct exploitability. These are observations for security hardening and alignment with industry best practices." }
          ]
        }

        if (!content.conclusions) {
          content.conclusions = {
            summary_text: `The security assessment of ${project.name} revealed a total of ${findings.length} findings, with ${severityCounts.critical} critical and ${severityCounts.high} high severity issues.`,
            severity_chart_data: [
              { label: "Critical", count: severityCounts.critical || 0, color: "#DC2626" },
              { label: "High", count: severityCounts.high || 0, color: "#EA580C" },
              { label: "Medium", count: severityCounts.medium || 0, color: "#F59E0B" },
              { label: "Low", count: severityCounts.low || 0, color: "#10B981" },
              { label: "Informational", count: severityCounts.informational || 0, color: "#3B82F6" }
            ]
          }
        }

        if (!content.annexures) {
          content.annexures = {
            test_list: [
              { category: "Information Gathering", tests: ["Search Engine Discovery", "Fingerprint Web Server", "Review Webserver Metafiles", "Enumerate Applications"] },
              { category: "Configuration Management", tests: ["Test SSL/TLS", "Test HTTP Methods", "Test Cross Site Tracing", "Review Security Headers"] },
              { category: "Authentication Testing", tests: ["Test for Default Credentials", "Test for Weak Lock Out Mechanism", "Test for Browser Cache Weaknesses"] },
              { category: "Authorization Testing", tests: ["Test Directory Traversal", "Test for Bypassing Authorization Schema", "Test for Privilege Escalation"] },
              { category: "Input Validation", tests: ["Reflected XSS", "Stored XSS", "SQL Injection", "XML Injection", "OS Command Injection"] }
            ],
            glossary: [
              { term: "Vulnerability", definition: "A flaw or weakness in a system's design, implementation, or operation." },
              { term: "PoC", definition: "Proof of Concept – evidence of exploitability." },
              { term: "CVSS", definition: "Common Vulnerability Scoring System." },
              { term: "OWASP", definition: "Open Worldwide Application Security Project." },
              { term: "CWE", definition: "Common Weakness Enumeration." },
              { term: "Risk", definition: "The probability that a particular threat will exploit a particular vulnerability." },
              { term: "Mitigation", definition: "A process of resolving or reducing a risk." }
            ],
            methodology_details: "Testing modeled after OWASP WSTG and NIST frameworks.",
            test_types: [
              { type: "WHITE-BOX", description: "Complete access to source code and architecture." },
              { type: "GREY-BOX", description: "Partial access such as low-level user credentials." },
              { type: "BLACK-BOX", description: "No prior knowledge of the internal systems." }
            ],
            application_vulnerabilities: ["Injection", "Broken Authentication", "Sensitive Data Exposure", "XML External Entities (XXE)", "Broken Access Control", "Security Misconfiguration", "Cross-Site Scripting (XSS)", "Insecure Deserialization", "Using Components with Known Vulnerabilities", "Insufficient Logging & Monitoring"],
            web_based_attacks: "Web-based attacks target client browsers and end users through XSS, CSRF, phishing, and malicious redirects."
          }
        }

        if (!content.owasp_compliance || content.owasp_compliance.length === 0) {
          const owaspCategories = [
            { id: "A01:2025", name: "Broken Access Control", pattern: [/access control/i, /authorization/i, /idor/i, /CWE-285/i, /CWE-639/i, /CWE-22/i, /path traversal/i] },
            { id: "A02:2025", name: "Cryptographic Failures", pattern: [/crypto/i, /ssl/i, /tls/i, /encryption/i, /hashing/i, /CWE-311/i, /CWE-327/i] },
            { id: "A03:2025", name: "Injection", pattern: [/injection/i, /sqli/i, /xss/i, /rce/i, /command/i, /CWE-89/i, /CWE-79/i] },
            { id: "A04:2025", name: "Insecure Design", pattern: [/design/i, /logic/i, /architectural/i, /CWE-1059/i] },
            { id: "A05:2025", name: "Security Misconfiguration", pattern: [/configuration/i, /misconfig/i, /default/i, /header/i, /CWE-16/i, /CWE-2/i] },
            { id: "A06:2025", name: "Vulnerable and Outdated Components", pattern: [/outdated/i, /vulnerable component/i, /version/i, /CWE-1104/i] },
            { id: "A07:2025", name: "Identification and Authentication Failures", pattern: [/auth/i, /login/i, /password/i, /session/i, /CWE-287/i, /CWE-304/i] },
            { id: "A08:2025", name: "Software and Data Integrity Failures", pattern: [/integrity/i, /deserialization/i, /CWE-502/i] },
            { id: "A09:2025", name: "Security Logging and Monitoring Failures", pattern: [/logging/i, /monitoring/i, /audit/i, /CWE-778/i] },
            { id: "A10:2025", name: "Server-Side Request Forgery", pattern: [/ssrf/i, /request forgery/i, /CWE-918/i] }
          ]
          content.owasp_compliance = owaspCategories.map(cat => ({
            id: cat.id,
            name: cat.name,
            status: sortedFindings.some(f => cat.pattern?.some(p => p.test(f.title) || p.test(f.description || '') || p.test(f.owasp_category || '') || p.test(f.cwe_id || ''))) ? 'Unsafe' : 'Safe'
          })) as any
        }

        if (!content.url_risk_table || content.url_risk_table.length === 0) {
          const urlRiskTable = Array.from(new Set(sortedFindings.filter(f => f.endpoint_url).map(f => f.endpoint_url))).map(url => {
            const highestRisk = sortedFindings.filter(f => f.endpoint_url === url).sort((a, b) => {
              const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 }
              return (order[a.severity?.toLowerCase() || 'informational'] ?? 5) - (order[b.severity?.toLowerCase() || 'informational'] ?? 5)
            })[0]
            return { url, risk_level: highestRisk?.severity || 'N/A' }
          })
          content.url_risk_table = (urlRiskTable.length > 0 ? urlRiskTable : [{ url: "No endpoints defined", risk_level: "N/A" }]) as any
        }

        // Persist the backfilled fields so we don't repeat the work
        try {
          await supabase.from('reports').update({ report_content: content }).eq('id', existingReport.id)
        } catch (saveErr) {
          console.warn('[ReportEngine] Could not persist backfilled fields (non-fatal):', saveErr)
        }
      } catch (backfillErr) {
        console.warn('[ReportEngine] Backfill failed (non-fatal):', backfillErr)
      }
    }

    // Always refresh org_logo_url from the latest org data
    content.org_logo_url = org.logo_url || content.org_logo_url
    
    return {
      id: existingReport.id,
      version: existingReport.version ?? 0,
      project,
      orgName: org.name,
      content
    }
  }

  // 2. No draft? Perform Fresh Synthesis
  console.log(`[ReportEngine] Initializing professional DNA synthesis for project ${projectId}`)
  const [project, findings, org, userProfile] = await Promise.all([
    fetchProjectDetails(projectId, orgId),
    fetchProjectFindings(projectId, orgId),
    fetchOrgDetails(orgId),
    fetchUserProfile(userId)
  ])

  // AI Narrative: Generate personalized strategic text
  const aiNarrative = await generateAINarrative(org.name, project.name, findings)

  // Sort findings: Critical -> High -> Medium -> Low -> Informational
  const sortedFindings = [...findings].sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 }
      const aOrder = order[a.severity?.toLowerCase() || 'informational'] ?? 5
      const bOrder = order[b.severity?.toLowerCase() || 'informational'] ?? 5
      if (aOrder !== bOrder) return aOrder - bOrder
      return (b.cvss_score || 0) - (a.cvss_score || 0)
  })

  const severityCounts = computeSeverityCounts(findings)
  const riskGrade = calculateRiskGrade(severityCounts)
  
  // Robust OWASP 2025 mapping logic
  const owaspCategories = [
      { id: "A01:2025", name: "Broken Access Control", pattern: [/access control/i, /authorization/i, /idor/i, /broken access/i, /CWE-285/i, /CWE-639/i, /CWE-22/i, /path traversal/i] },
      { id: "A02:2025", name: "Cryptographic Failures", pattern: [/crypto/i, /ssl/i, /tls/i, /encryption/i, /hashing/i, /CWE-311/i, /CWE-327/i] },
      { id: "A03:2025", name: "Injection", pattern: [/injection/i, /sqli/i, /xss/i, /rce/i, /command/i, /CWE-89/i, /CWE-79/i] },
      { id: "A04:2025", name: "Insecure Design", pattern: [/design/i, /logic/i, /architectural/i, /CWE-1059/i] },
      { id: "A05:2025", name: "Security Misconfiguration", pattern: [/configuration/i, /misconfig/i, /default/i, /header/i, /CWE-16/i, /CWE-2/i] },
      { id: "A06:2025", name: "Vulnerable and Outdated Components", pattern: [/outdated/i, /vulnerable component/i, /version/i, /CWE-1104/i] },
      { id: "A07:2025", name: "Identification and Authentication Failures", pattern: [/auth/i, /login/i, /password/i, /session/i, /CWE-287/i, /CWE-304/i] },
      { id: "A08:2025", name: "Software and Data Integrity Failures", pattern: [/integrity/i, /deserialization/i, /CWE-502/i] },
      { id: "A09:2025", name: "Security Logging and Monitoring Failures", pattern: [/logging/i, /monitoring/i, /audit/i, /CWE-778/i] },
      { id: "A10:2025", name: "Server-Side Request Forgery", pattern: [/ssrf/i, /request forgery/i, /CWE-918/i] }
  ]

  const owaspData = owaspCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      status: sortedFindings.some(f => 
          cat.pattern?.some(p => 
            p.test(f.title) || 
            p.test(f.description || '') || 
            p.test(f.owasp_category || '') || 
            p.test(f.cwe_id || '')
          )
      ) ? 'Unsafe' : 'Safe'
  }))

  const unsafeCount = owaspData.filter(o => o.status === 'Unsafe').length;
  const technicalSummaryDefault = unsafeCount > 0 
    ? `The assessment identified ${findings.length} security vulnerabilities mapped against the OWASP Top 10 (2025) framework. The application shows significant exposure in ${unsafeCount} critical areas, primarily ${owaspData.filter(o => o.status === 'Unsafe').map(o => o.name).join(', ')}. Immediate remediation of Critical and High findings is recommended to restore organizational security posture.`
    : `The assessment did not identify any vulnerabilities matching the OWASP Top 10 (2025) categories. However, general hardening of the application infrastructure is recommended.`;

  const urlRiskTable = Array.from(new Set(sortedFindings.filter(f => f.endpoint_url).map(f => f.endpoint_url))).map(url => {
      const highestRisk = sortedFindings.filter(f => f.endpoint_url === url).sort((a, b) => {
          const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 }
          return (order[a.severity?.toLowerCase() || 'informational'] ?? 5) - (order[b.severity?.toLowerCase() || 'informational'] ?? 5)
      })[0]?.severity || 'Informational'
      return { url: url!, risk_level: highestRisk }
  })

  // Professional Disclaimer (Long version)
  const professionalDisclaimer = `This document has been prepared by VAPTShield's Cyber Security team for the consideration of ${org.name}. Whilst all due care and diligence have been taken in the preparation of this document it is not impossible that a document of this nature may contain errors or omissions as a result of a misunderstanding of Clients' requirements. In particular, any recommendations are made in good faith as guidelines to assist the client in the evaluation and must not be constructed as warranties of any kind. Findings in this report are based on various tests conducted using third-party tools and VAPTShield has put its best efforts to eliminate all the false positives reported by these tools. All terms mentioned in this document that are known to be trademarks or service marks have been appropriately capitalized. VAPTShield cannot attest to the accuracy of this information. Use of a term in this document should not be regarded as affecting the validity of any trademark or service mark. Reproduction of this report without explicit permission from VAPTShield is strictly prohibited.`;

  const initialContent: ReportContent = {
    template_type: 'classic',
    executive_summary: aiNarrative.executive_summary || `VAPTShield conducted a comprehensive security assessment of "${project.name}" for ${org.name}. The audit revealed a total of ${findings.length} vulnerabilities. Of these, ${severityCounts.critical} were classified as Critical, ${severityCounts.high} as High, ${severityCounts.medium} as Medium, and ${severityCounts.low + severityCounts.informational} as Low/Informational. The overall risk posture is graded as "${riskGrade}". We recommend immediate patching of the critical injection and access control vulnerabilities identified in the detailed findings section.`,
    technical_summary: aiNarrative.technical_summary || technicalSummaryDefault,
    methodology: project.methodology || "Standard VAPT methodology including Passive Reconnaissance, Active Scanning, Manual Exploitation, and Post-Exploitation analysis. Testing modeled after OWASP WSTG v4.2 and NIST SP 800-115 frameworks.",
    scope: project.scope || "Assessment focused on all public-facing endpoints and authenticated user workflows of the application.",
    disclaimer: professionalDisclaimer,
    findings: sortedFindings.map(f => ({
        ...f,
        reference_links: (f as any).reference_links || [
            "https://owasp.org/www-community/vulnerabilities/",
            "https://cwe.mitre.org/data/definitions/" + (f.cwe_id?.replace('CWE-', '') || 'Unknown'),
            "https://nvd.nist.gov/vuln/detail/" + (f.cve_id || '')
        ]
    })) as any,
    severity_counts: severityCounts,
    risk_grade: riskGrade,
    generated_at: new Date().toISOString(),
    org_logo_url: org.logo_url,

    project_details: {
        version: "1.0",
        document_id: `CNS/R/${new Date().getFullYear()}/${projectId.slice(0, 8).toUpperCase()}`,
        document_hash: crypto.createHash('sha512').update(projectId + Date.now().toString()).digest('hex').toUpperCase(),
        assessment_type: project.project_type === 'web_app' ? "Web Application Security Testing" : "Infrastructure Security Assessment",
        testing_type: "Black Box and Grey Box",
        environment: "Production",
        assessment_start: project.start_date || new Date().toISOString(),
        assessment_end: project.end_date || new Date().toISOString(),
        client_name: org.name,
        tester_name: userProfile.full_name || "Security Engineer",
        tester_role: "Security Engineer",
        reviewer_name: "Internal Peer Review",
        reviewer_role: "Senior Security Consultant",
        approver_name: "Technical Director",
        approver_role: "Principal Security Consultant"
    },
    
    owasp_compliance: owaspData as any,
    

    url_risk_table: urlRiskTable.length > 0 ? urlRiskTable : [{ url: "No endpoints defined", risk_level: "N/A" }],

    recommendations: aiNarrative.recommendations || `
        <ul style="list-style-type: disc; padding-left: 1.5rem; space-y: 0.5rem;">
            <li><strong>Immediate Remediation:</strong> Patch all CRITICAL and HIGH vulnerabilities within 15 days to mitigate active exploitation risk.</li>
            <li><strong>Input Sanitization:</strong> Implement a centralized input validation and output encoding framework to prevent injection attacks globally.</li>
            <li><strong>Access Control:</strong> Review and enforce strict Object-Level Authorization (BOLA/IDOR) checks across all API endpoints.</li>
            <li><strong>Security Hardening:</strong> Deploy robust HSTS, Content Security Policy (CSP), and X-Frame-Options headers to protect against client-side attacks.</li>
            <li><strong>Continuous Monitoring:</strong> Integrate automated vulnerability scanning into your CI/CD pipeline for early detection of security regressions.</li>
            <li><strong>Security Training:</strong> Provide quarterly secure coding workshops for the development team focused on the OWASP Top 10.</li>
        </ul>
    `,

    conclusions: {
        summary_text: `The security assessment of ${project.name} revealed a total of ${findings.length} findings, with ${severityCounts.critical} critical and ${severityCounts.high} high severity issues. The following graph and table summarize the overall security assessment:`,
        severity_chart_data: [
            { label: "Critical", count: severityCounts.critical || 0, color: "#DC2626" },
            { label: "High", count: severityCounts.high || 0, color: "#EA580C" },
            { label: "Medium", count: severityCounts.medium || 0, color: "#F59E0B" },
            { label: "Low", count: severityCounts.low || 0, color: "#10B981" },
            { label: "Informational", count: severityCounts.informational || 0, color: "#3B82F6" }
        ]
    },

    severity_rating_definitions: [
        { severity: "Critical", cvss_range: "9.0 – 10.0", definition: "Total compromise of system integrity, confidentiality, or availability. Immediate exploitation possible with severe business impact." },
        { severity: "High", cvss_range: "7.0 – 8.9", definition: "Significant vulnerability that can be exploited to gain elevated access or cause substantial damage to the application or its data." },
        { severity: "Medium", cvss_range: "4.0 – 6.9", definition: "Exploitable vulnerability requiring specific conditions. May lead to partial data exposure or limited system compromise." },
        { severity: "Low", cvss_range: "0.1 – 3.9", definition: "Minor security weakness with minimal direct impact. These issues are often used as part of a larger, chained attack." },
        { severity: "Informational", cvss_range: "N/A", definition: "No direct exploitability. These are observations for security hardening and alignment with industry best practices." }
    ],

    annexures: {
        test_list: [
          { category: "Information Gathering", tests: ["Search Engine Discovery", "Fingerprint Web Server", "Review Webserver Metafiles", "Enumerate Applications"] },
          { category: "Configuration Management", tests: ["Test SSL/TLS", "Test HTTP Methods", "Test Cross Site Tracing", "Review Security Headers"] },
          { category: "Authentication Testing", tests: ["Test for Default Credentials", "Test for Weak Lock Out Mechanism", "Test for Browser Cache Weaknesses"] },
          { category: "Authorization Testing", tests: ["Test Directory Traversal", "Test for Bypassing Authorization Schema", "Test for Privilege Escalation"] },
          { category: "Input Validation", tests: ["Reflected XSS", "Stored XSS", "SQL Injection", "XML Injection", "OS Command Injection"] }
        ],
        glossary: [
          { term: "Vulnerability", definition: "A flaw or weakness in a system's design, implementation, or operation." },
          { term: "PoC", definition: "Proof of Concept – evidence of exploitability." },
          { term: "CVSS", definition: "Common Vulnerability Scoring System." },
          { term: "OWASP", definition: "Open Worldwide Application Security Project." },
          { term: "CWE", definition: "Common Weakness Enumeration." },
          { term: "Exploit", definition: "A piece of software or sequence of commands that takes advantage of a vulnerability." },
          { term: "Threat", definition: "A potential cause of an unwanted impact to a system or organization." },
          { term: "Risk", definition: "The probability that a particular threat will exploit a particular vulnerability." },
          { term: "Mitigation", definition: "A process of resolving or reducing a risk." }
        ],
        methodology_details: "Testing modeled after OWASP WSTG and NIST SP 800-115 frameworks. Severity ratings are computed using CVSS v4.0 base scores.",
        test_types: [
          { type: "WHITE-BOX", description: "Complete access to source code and architecture." },
          { type: "GREY-BOX", description: "Partial access such as low-level user credentials." },
          { type: "BLACK-BOX", description: "No prior knowledge of the internal systems." }
        ],
        application_vulnerabilities: ["Injection", "Broken Authentication", "Sensitive Data Exposure", "XML External Entities (XXE)", "Broken Access Control", "Security Misconfiguration", "Cross-Site Scripting (XSS)", "Insecure Deserialization", "Using Components with Known Vulnerabilities", "Insufficient Logging & Monitoring"],
        web_based_attacks: "Web-Based client Attacks\nPhishing is the criminally fraudulent process of attempting to acquire sensitive information such as usernames, passwords, and credit card details by masquerading as a trustworthy entity in an electronic communication. Client-side attacks often utilize malicious scripts executing within the victim's browser."
    }
  }

  // Phase 1: Initialise smart-merge meta. The initial AI output becomes the
  // baseline against which future user edits are measured. The version
  // history starts with this generation entry attributed to the user who
  // triggered the first open.
  initialContent._excluded_finding_ids = []
  initialContent._ai_baseline = stripMeta(initialContent)
  initialContent._ai_trigger = buildAITrigger(initialContent.findings)
  initialContent._version_history = [{
    v: 1,
    at: new Date().toISOString(),
    by_user_id: userId,
    by_user_name: userProfile?.full_name || 'Unknown User',
    by_user_avatar: userProfile?.avatar_url || null,
    by_org_id: orgId,
    by_project_id: projectId,
    by_project_name: project.name,
    reason: 'initial',
    finding_count: findings.length,
    findings_added: findings.length,
    findings_removed: 0,
    narrative_preserved: 0,
    derived_regenerated: 0,
    trigger: 'no_change',
  }]

  // 3. Create record
  const { data: newReport, error: createError } = await supabase
    .from('reports')
    .insert({
      org_id: orgId,
      project_id: projectId,
      title: `VAPT Report — ${project.name}`,
      status: 'draft',
      template_type: 'standard_vapt',
      created_by: userId,
      report_content: initialContent as any
    })
    .select('id')
    .single()

  if (createError) {
    console.error("[engine] Draft creation failed:", createError.message)
    throw new Error("Failed to create report draft")
  }

  return {
    id: newReport.id,
    version: 1,  // New reports start at version 1
    project,
    orgName: org.name,
    content: initialContent
  }
}

/**
 * SYNC DRAFT WITH LATEST FINDINGS (Phase 1 — smart-merge architecture)
 *
 * Flow:
 *   1. Fetch current draft + user profile (for version attribution)
 *   2. Fetch latest project findings
 *   3. Detect whether AI regen is needed (count / IDs / content hash)
 *   4. If NO change → return user's current content untouched
 *   5. If YES change → run AI narrative + recompute derived tables
 *   6. Smart-merge: preserve user's manual narrative edits
 *   7. Filter findings through _excluded_finding_ids (soft-delete in V2)
 *   8. Append a new entry to _version_history with full metadata
 */
export async function syncReportDraft(
  reportId: string,
  projectId: string,
  orgId: string,
  actorId?: string
): Promise<{ content: ReportContent; detection: ChangeDetectionResult; preserved: string[]; regenerated: string[] }> {
    const supabase = await getServerClient()

    // 1. Fetch current draft (contains user's manual edits + previous baseline)
    const { data: currentReport } = await supabase
        .from('reports')
        .select('report_content')
        .eq('id', reportId)
        .single()
    const oldContent = currentReport?.report_content as unknown as ReportContent

    // 1a. Fetch user profile for version attribution
    let userProfile: any = null
    if (actorId) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url, org_id')
            .eq('id', actorId)
            .single()
        userProfile = profile
    }

    // 2. Fetch latest actual project data
    const [findings, org, project] = await Promise.all([
        fetchProjectFindings(projectId, orgId),
        fetchOrgDetails(orgId),
        fetchProjectDetails(projectId, orgId)
    ])

    // 2a. Filter out soft-deleted findings (excluded in V2)
    const excludedIds = new Set(oldContent?._excluded_finding_ids || [])
    const visibleFindings = findings.filter(f => !excludedIds.has(f.id))

    // Sort findings: Critical -> Informational
    const sortedFindings = [...visibleFindings].sort((a, b) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 }
        const aOrder = order[a.severity?.toLowerCase() || 'informational'] ?? 5
        const bOrder = order[b.severity?.toLowerCase() || 'informational'] ?? 5
        if (aOrder !== bOrder) return aOrder - bOrder
        return (b.cvss_score || 0) - (a.cvss_score || 0)
    })

    const severityCounts = computeSeverityCounts(visibleFindings)
    const riskGrade = calculateRiskGrade(severityCounts)

    // 3. DECIDE: should AI regen?
    const detection = detectChanges(sortedFindings, oldContent?._ai_trigger)

    // 4. If nothing changed → return user content untouched, just refresh logo
    if (!detection.regenerate) {
        return {
            content: {
                ...oldContent,
                org_logo_url: org.logo_url || oldContent.org_logo_url,
                generated_at: new Date().toISOString(),
            },
            detection,
            preserved: [],
            regenerated: [],
        }
    }

    // 5. AI regen needed → run narrative + recompute derived tables
    const aiNarrative = await generateAINarrative(org.name, project.name, visibleFindings)

    // Re-run OWASP 2025 mapping
    const owaspCategories = [
        { id: "A01:2025", name: "Broken Access Control", pattern: [/access control/i, /authorization/i, /idor/i, /broken access/i, /CWE-285/i, /CWE-639/i, /CWE-22/i, /path traversal/i] },
        { id: "A02:2025", name: "Cryptographic Failures", pattern: [/crypto/i, /ssl/i, /tls/i, /encryption/i, /hashing/i, /CWE-311/i, /CWE-327/i] },
        { id: "A03:2025", name: "Injection", pattern: [/injection/i, /sqli/i, /xss/i, /rce/i, /command/i, /CWE-89/i, /CWE-79/i] },
        { id: "A04:2025", name: "Insecure Design", pattern: [/design/i, /logic/i, /architectural/i, /CWE-1059/i] },
        { id: "A05:2025", name: "Security Misconfiguration", pattern: [/configuration/i, /misconfig/i, /default/i, /header/i, /CWE-16/i, /CWE-2/i] },
        { id: "A06:2025", name: "Vulnerable and Outdated Components", pattern: [/outdated/i, /vulnerable component/i, /version/i, /CWE-1104/i] },
        { id: "A07:2025", name: "Identification and Authentication Failures", pattern: [/auth/i, /login/i, /password/i, /session/i, /CWE-287/i, /CWE-304/i] },
        { id: "A08:2025", name: "Software and Data Integrity Failures", pattern: [/integrity/i, /deserialization/i, /CWE-502/i] },
        { id: "A09:2025", name: "Security Logging and Monitoring Failures", pattern: [/logging/i, /monitoring/i, /audit/i, /CWE-778/i] },
        { id: "A10:2025", name: "Server-Side Request Forgery", pattern: [/ssrf/i, /request forgery/i, /CWE-918/i] }
    ]

    const owaspData = owaspCategories.map(cat => ({
        id: cat.id,
        name: cat.name,
        status: sortedFindings.some(f =>
            cat.pattern?.some(p => p.test(f.title) || p.test(f.description || '') || p.test(f.owasp_category || '') || p.test(f.cwe_id || ''))
        ) ? 'Unsafe' : 'Safe'
    }))

    const urlRiskTable = Array.from(new Set(sortedFindings.filter(f => f.endpoint_url).map(f => f.endpoint_url))).map(url => {
        const highestRisk = sortedFindings.filter(f => f.endpoint_url === url).sort((a, b) => {
            const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 }
            return (order[a.severity?.toLowerCase() || 'informational'] ?? 5) - (order[b.severity?.toLowerCase() || 'informational'] ?? 5)
        })[0]?.severity || 'Informational'
        return { url: url!, risk_level: highestRisk }
    })

    // 6. SMART MERGE: preserve user's manual narrative edits
    const aiNewContent: Partial<ReportContent> = {
        executive_summary: aiNarrative.executive_summary || oldContent.executive_summary,
        technical_summary: aiNarrative.technical_summary || oldContent.technical_summary,
        recommendations: aiNarrative.recommendations || oldContent.recommendations,
    }

    const { merged: smartMerged, preserved, regenerated } = smartMerge(
        aiNewContent,
        oldContent,
        oldContent?._ai_baseline
    )

    // 7. Build updated content (preserve everything not in the merge list)
    const updatedContent: ReportContent = {
        ...oldContent,
        ...smartMerged,
        findings: sortedFindings.map(f => ({
            ...f,
            reference_links: (f as any).reference_links || [
                "https://owasp.org/www-community/vulnerabilities/",
                "https://cwe.mitre.org/data/definitions/" + (f.cwe_id?.replace('CWE-', '') || 'Unknown')
            ]
        })) as any,
        severity_counts: severityCounts,
        risk_grade: riskGrade,
        owasp_compliance: owaspData as any,
        url_risk_table: urlRiskTable.length > 0 ? urlRiskTable : [{ url: "No endpoints defined", risk_level: "N/A" }],
        generated_at: new Date().toISOString(),
        org_logo_url: org.logo_url || oldContent.org_logo_url,
    }

    // Professional DNA: Ensure project_details isn't lost or missing
    if (!updatedContent.project_details) {
        updatedContent.project_details = {
            version: "1.0",
            document_id: `CNS/R/${new Date().getFullYear()}/${projectId.slice(0, 8).toUpperCase()}`,
            document_hash: crypto.createHash('sha512').update(projectId + Date.now().toString()).digest('hex').toUpperCase(),
        assessment_type: project.project_type === 'web_app' ? "Web Application Security Testing" : "Infrastructure Security Assessment",
            testing_type: "Black Box and Grey Box",
            environment: "Production",
            assessment_start: project.start_date || new Date().toISOString(),
            assessment_end: project.end_date || new Date().toISOString(),
            client_name: org.name,
            tester_name: "Security Engineer",
            tester_role: "Security Engineer",
            reviewer_name: "Internal Peer Review",
            reviewer_role: "Senior Security Consultant",
            approver_name: "Technical Director",
            approver_role: "Principal Security Consultant"
        }
    }

    // 8. Version history: append new entry with full metadata
    const newVersionNumber = (oldContent?._version_history?.length || 0) + 1
    const versionEntry: VersionHistoryEntry = {
        v: newVersionNumber,
        at: new Date().toISOString(),
        by_user_id: actorId || 'system',
        by_user_name: userProfile?.full_name || 'System',
        by_user_avatar: userProfile?.avatar_url || null,
        by_org_id: orgId,
        by_project_id: projectId,
        by_project_name: project.name,
        reason: 'sync',
        finding_count: visibleFindings.length,
        findings_added: detection.addedFindings.length,
        findings_removed: detection.removedFindingIds.length,
        narrative_preserved: preserved.length,
        derived_regenerated: regenerated.length + 4,  // +4 for OWASP, URL risk, severity chart, severity counts
        trigger: detection.trigger,
        snapshot: { ...updatedContent },
    }
    updatedContent._version_history = appendVersion(updatedContent, versionEntry)

    // Update baseline: what the user sees now becomes the new baseline
    // (so future edits are compared against this, not the original AI)
    updatedContent._ai_baseline = stripMeta(updatedContent)
    updatedContent._ai_trigger = buildAITrigger(updatedContent.findings)
    // Preserve excluded list across syncs
    updatedContent._excluded_finding_ids = oldContent?._excluded_finding_ids || []

    return {
        content: updatedContent,
        detection,
        preserved,
        regenerated,
    }
}

/**
 * SAVE EDITED DRAFT
 */
export async function saveReportDraft(
    reportId: string,
    content: ReportContent,
    actorId?: string,
    orgId?: string,
    expectedVersion?: number
): Promise<{ version: number }> {
    const supabase = await getServerClient()

    // Optimistic locking (Task 19): refuse the save if the client
    // believes the report is at `expectedVersion` but DB has moved on.
    if (typeof expectedVersion === 'number') {
        const { data: row, error: lockErr } = await supabase
            .from('reports')
            .select('version')
            .eq('id', reportId)
            .single()
        if (lockErr) throw lockErr
        if (row && row.version !== expectedVersion) {
            const err: any = new Error(
                `Version conflict: expected ${expectedVersion} but DB is at ${row.version}. ` +
                `Another user has updated this report. Reload to see the latest version.`
            )
            err.code = 'VERSION_CONFLICT'
            err.expectedVersion = expectedVersion
            err.currentVersion = row.version
            throw err
        }
    }

    // Fetch the existing content to compute a diff summary for audit (Task 18)
    let oldContent: any = null
    let oldVersion: number | null = null
    if (actorId) {
        const { data: existing } = await supabase
            .from('reports')
            .select('report_content, project_id, title, version')
            .eq('id', reportId)
            .single()
        oldContent = existing?.report_content || null
        oldVersion = existing?.version ?? null
    }

    // Atomic update with version increment (Task 19)
    const nextVersion = (oldVersion ?? 0) + 1
    console.log(`[saveReportDraft] reportId=${reportId} oldVersion=${oldVersion} expectedVersion=${expectedVersion} nextVersion=${nextVersion}`)
    
    // Intelligent snapshotting: only create a new version history entry if 
    // it's been at least 15 minutes since the last one, or if there's no history.
    const now = Date.now()
    const history = content._version_history || []
    const lastEntry = history.length > 0 ? history[history.length - 1] : null
    const timeSinceLast = lastEntry ? (now - new Date(lastEntry.at).getTime()) : Infinity

    if (timeSinceLast > 15 * 60 * 1000) {
        const newVersionNumber = (history.length || 0) + 1
        const versionEntry: VersionHistoryEntry = {
            v: newVersionNumber,
            at: new Date(now).toISOString(),
            by_user_id: actorId || 'system',
            by_user_name: 'Manual Editor',
            by_user_avatar: null,
            by_org_id: orgId || 'unknown',
            by_project_id: 'unknown',
            by_project_name: 'Manual Save',
            reason: 'manual_edit',
            finding_count: content.findings?.length || 0,
            findings_added: 0,
            findings_removed: 0,
            narrative_preserved: 0,
            derived_regenerated: 0,
            trigger: 'finding_content_changed',
            snapshot: { ...content },
        }
        content._version_history = appendVersion(content, versionEntry)
    }

    // Base update payload
    const updatePayload: any = {
        report_content: content as any,
        updated_at: new Date().toISOString(),
        version: nextVersion,
    };

    // Atomic optimistic locking: only update if the version in DB matches what we expect.
    // This prevents race conditions where two users overwrite each other's changes.
    const query = supabase.from('reports').update(updatePayload)
        .eq('id', reportId)
        .eq('version', oldVersion ?? 0);

    const { data: updated, error } = await query.select('version').single();

    if (error) {
        throw error
    }
    const newVersion = updated?.version ?? nextVersion

    // Audit log entry (Task 18) — only emitted if actor info provided
    if (actorId && orgId) {
        try {
            const { logAudit } = await import('@/lib/utils/audit-server')
            const summary = computeEditSummary(oldContent, content)
            await logAudit({
                org_id: orgId,
                actor_id: actorId,
                action: 'report.draft_saved',
                resource_type: 'report',
                resource_id: reportId,
                old_value: oldContent ? { size_bytes: JSON.stringify(oldContent).length, version: oldVersion } : null,
                new_value: {
                    size_bytes: JSON.stringify(content).length,
                    version: newVersion,
                    ...summary,
                },
            })
        } catch (auditErr) {
            // Never let audit failure block the save
            console.error('[saveReportDraft] audit log failed:', auditErr)
        }
    }

    return { version: newVersion }
}

// Compute a brief diff summary so the audit log shows what changed (Task 18)
function computeEditSummary(oldC: any, newC: any): Record<string, any> {
    if (!oldC || !newC) return { first_save: !oldC }
    const summary: Record<string, any> = {}
    const fields = ['executive_summary', 'technical_summary', 'methodology', 'scope', 'disclaimer', 'recommendations', 'appendix']
    for (const f of fields) {
        const a = (oldC[f] || '').toString()
        const b = (newC[f] || '').toString()
        if (a !== b) summary[`${f}_changed`] = true
    }
    const oldFindings = (oldC.findings || []).length
    const newFindings = (newC.findings || []).length
    if (oldFindings !== newFindings) summary.findings_count = { before: oldFindings, after: newFindings }
    return summary
}

// ─── Helper Functions ─────────────────────────────────────────

async function fetchUserProfile(userId: string) {
    const supabase = await getServerClient()
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    return data
}

async function fetchProjectDetails(projectId: string, orgId: string): Promise<Project> {
    const supabase = await getServerClient()
    const { data } = await supabase.from('projects').select('*').eq('id', projectId).eq('org_id', orgId).single()
    return data
}

async function fetchProjectFindings(projectId: string, orgId: string): Promise<Vulnerability[]> {
    const supabase = await getServerClient()
    const { data } = await supabase.from('vulnerabilities').select('*').eq('project_id', projectId).eq('org_id', orgId)
    return data || []
}

async function fetchOrgDetails(orgId: string) {
    const supabase = await getServerClient()
    const { data } = await supabase.from('organizations').select('*').eq('id', orgId).single()
    return data
}

function computeSeverityCounts(findings: Vulnerability[]) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
  findings.forEach(f => {
    const s = f.severity?.toLowerCase() || 'informational'
    if (s in counts) counts[s as keyof typeof counts]++
  })
  return counts
}

function calculateRiskGrade(counts: any) {
  if (counts.critical > 0) return 'D'
  if (counts.high > 2) return 'C'
  if (counts.high > 0) return 'B'
  return 'A'
}

export async function fetchPoCBuffers(content: ReportContent): Promise<Record<string, ImageBuffer>> {
    const supabase = await getServerClient()
    const buffers: Record<string, ImageBuffer> = {}

    const imageTasks: { id: string, path: string }[] = []
    content.findings.forEach(f => {
        const rawPoc = f.proof_of_concept?.trim()
        if (rawPoc?.startsWith('[')) {
            try {
                const steps = JSON.parse(rawPoc)
                steps.forEach((step: any) => {
                    step.images?.forEach((img: any) => {
                        const imgPath = img.remoteUrl || img.path || img.storage_path
                        if (imgPath && typeof imgPath === 'string' && imgPath.includes('/') && !imgPath.startsWith('http') && !imgPath.startsWith('blob:')) {
                            imageTasks.push({ id: img.id, path: imgPath })
                        }
                    })
                })
            } catch(e) {}
        } else if (rawPoc) {
            // HTML img tags parsing (e.g. uploaded via editor)
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
                        imageTasks.push({ id: imgId, path: decodedPath })
                    }
                }
            }
        }
    })

    if (imageTasks.length > 0) {
        await Promise.all(imageTasks.map(async (task) => {
            try {
                const { data, error } = await supabase.storage.from('poc-files').download(task.path)
                if (!error && data) {
                    const buffer = Buffer.from(await data.arrayBuffer())
                    buffers[task.id] = { id: task.id, buffer, mimeType: data.type || 'image/png' }
                }
            } catch (downloadErr) {
                console.warn(`[fetchPoCBuffers] Failed to download image ${task.id} at ${task.path}:`, downloadErr)
            }
        }))
    }
    return buffers
}

export async function fetchLogoBuffer(url: string | null): Promise<Buffer | null> {
    if (!url) return null
    try {
        const response = await fetch(url)
        if (!response.ok) return null
        return Buffer.from(await response.arrayBuffer())
    } catch (e) {
        return null
    }
}

export async function updateReportUrls(
    reportId: string,
    docxUrl: string | null,
    pdfUrl: string | null,
    updatedContent?: ReportContent | null,
    newVersion?: number
): Promise<void> {
    const supabase = await getServerClient()
    const updatePayload: any = {
        docx_url: docxUrl,
        pdf_url: pdfUrl,
        pdf_generation_status: pdfUrl ? 'ready' : 'idle'
    }
    if (updatedContent) {
        updatePayload.report_content = updatedContent
    }
    if (newVersion !== undefined) {
        updatePayload.version = newVersion
    }
    await supabase.from('reports').update(updatePayload).eq('id', reportId)
}

export async function uploadToStorage(
    buffer: Buffer,
    filename: string,
    contentType: string,
    projectId: string
): Promise<string> {
  const supabase = await getServerClient()
  const storagePath = `${projectId}/${filename}`
  
  // Convert Node Buffer to Uint8Array for Supabase Storage upload compatibility
  const uint8Array = new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  
  const { data, error } = await supabase.storage.from('reports').upload(storagePath, uint8Array, {
    contentType,
    upsert: true
  })
  
  if (error) {
      console.error("[uploadToStorage] Supabase Storage Error:", error);
      throw new Error("Failed to upload report file");
  }

  // The 'reports' bucket is private on Supabase, so getPublicUrl() returns
  // a URL that 404s. Return a 1-hour signed URL instead so the user can
  // actually download the PDF.
  const { data: signed, error: signErr } = await supabase.storage
    .from('reports')
    .createSignedUrl(storagePath, 3600)
    
  if (signErr || !signed?.signedUrl) {
    // Fallback to publicUrl if signed URL creation fails for any reason.
    const { data: { publicUrl } } = supabase.storage.from('reports').getPublicUrl(storagePath)
    return publicUrl
  }
  return signed.signedUrl
}
