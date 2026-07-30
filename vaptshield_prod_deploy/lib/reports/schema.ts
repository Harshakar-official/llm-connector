// ============================================================
// VAPTShield — Report Content Zod Validation Schemas
// Validates all report API inputs to prevent injection, oversized
// payloads, and malformed data structures.
// ============================================================

import { z } from 'zod'

// ─── Primitive validators ──────────────────────────────────────

const SEVERITY_ENUM = z.enum(['critical', 'high', 'medium', 'low', 'informational'])
const TEMPLATE_TYPE_ENUM = z.enum(['classic', 'modern'])
const OWASP_STATUS_ENUM = z.enum(['Safe', 'Unsafe'])

// Max lengths for text fields (prevent abuse)
const MAX_TEXT_LENGTH = 100_000   // ~100KB per field
const MAX_SHORT_TEXT = 5_000      // Short text fields
const MAX_FINDING_COUNT = 500     // Max findings per report
const MAX_URL_LENGTH = 2_048
const MAX_VERSION_HISTORY = 20

// ─── Sub-schemas ───────────────────────────────────────────────

const ProjectDetailsSchema = z.object({
  version: z.string().max(20),
  document_id: z.string().max(50),
  document_hash: z.string().max(128),
  assessment_type: z.string().max(100),
  testing_type: z.string().max(100),
  environment: z.string().max(100),
  assessment_start: z.string().max(50),
  assessment_end: z.string().max(50),
  client_name: z.string().max(200),
  tester_name: z.string().max(200),
  tester_role: z.string().max(100),
  reviewer_name: z.string().max(200),
  reviewer_role: z.string().max(100),
  approver_name: z.string().max(200),
  approver_role: z.string().max(100),
}).strict()

const OWASPComplianceEntrySchema = z.object({
  id: z.string().max(20),
  name: z.string().max(100),
  status: OWASP_STATUS_ENUM,
})


const URLRiskEntrySchema = z.object({
  url: z.string().max(MAX_URL_LENGTH),
  risk_level: z.string().max(50),
})

const SeverityRatingDefinitionSchema = z.object({
  severity: z.string().max(50),
  cvss_range: z.string().max(20),
  definition: z.string().max(MAX_SHORT_TEXT),
})

const FindingSnapshotSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(500),
  severity: z.string().max(50),
  cvss_score: z.number().min(0).max(10).optional().nullable(),
  cve_id: z.string().max(50).optional().nullable(),
  cwe_id: z.string().max(50).optional().nullable(),
  owasp_category: z.string().max(100).optional().nullable(),
  status: z.string().max(50).optional().nullable(),
  endpoint_url: z.string().max(MAX_URL_LENGTH).optional().nullable(),
  cvss_vector: z.string().max(200).optional().nullable(),
  description: z.string().max(MAX_TEXT_LENGTH).optional().nullable(),
  impact: z.string().max(MAX_TEXT_LENGTH).optional().nullable(),
  remediation: z.string().max(MAX_TEXT_LENGTH).optional().nullable(),
  proof_of_concept: z.string().max(MAX_TEXT_LENGTH).optional().nullable(),
  reference_links: z.array(z.string().max(MAX_URL_LENGTH)).optional().nullable(),
  found_by_name: z.string().max(200).optional().nullable(),
  found_by_avatar: z.string().max(MAX_URL_LENGTH).optional().nullable(),
  // Allow additional Vulnerability fields but restrict unknown keys
}).passthrough()

const ConclusionsSchema = z.object({
  summary_text: z.string().max(MAX_TEXT_LENGTH),
  severity_chart_data: z.array(z.object({
    label: z.string().max(50),
    count: z.number().int().min(0),
    color: z.string().max(20),
  })).max(10),
})

const AnnexuresSchema = z.object({
  test_list: z.array(z.object({
    category: z.string().max(200),
    tests: z.array(z.string().max(500)).max(50),
  })).max(20),
  glossary: z.array(z.object({
    term: z.string().max(200),
    definition: z.string().max(MAX_SHORT_TEXT),
  })).max(50),
  methodology_details: z.string().max(MAX_TEXT_LENGTH),
  test_types: z.array(z.object({
    type: z.string().max(50),
    description: z.string().max(MAX_SHORT_TEXT),
  })).max(20),
  application_vulnerabilities: z.array(z.string().max(200)).max(50),
  web_based_attacks: z.string().max(MAX_TEXT_LENGTH),
})

// ─── Smart-merge meta schemas ──────────────────────────────────

const AITriggerSchema = z.object({
  finding_count: z.number().int().min(0),
  finding_ids: z.array(z.string().max(100)).max(MAX_FINDING_COUNT),
  finding_hashes: z.record(z.string().max(100), z.string().max(64)),
  generated_at: z.string().max(50),
})

const VersionHistoryEntrySchema = z.object({
  v: z.number().int().min(1),
  at: z.string().max(50),
  by_user_id: z.string().max(100),
  by_user_name: z.string().max(200),
  by_user_avatar: z.string().max(MAX_URL_LENGTH).nullable(),
  by_org_id: z.string().max(100),
  by_project_id: z.string().max(100),
  by_project_name: z.string().max(200),
  reason: z.enum(['initial', 'manual_edit', 'finding_change', 'reset_to_ai', 'restore_version', 'sync', 'generate']),
  finding_count: z.number().int().min(0),
  findings_added: z.number().int().min(0),
  findings_removed: z.number().int().min(0),
  narrative_preserved: z.number().int().min(0),
  derived_regenerated: z.number().int().min(0),
  trigger: z.enum(['count_changed', 'findings_added_or_removed', 'finding_content_changed', 'no_change', 'manual_only', 'forced']),
})

// ─── Main ReportContent Schema ─────────────────────────────────

export const ReportContentSchema = z.object({
  executive_summary: z.string().max(MAX_TEXT_LENGTH),
  technical_summary: z.string().max(MAX_TEXT_LENGTH),
  methodology: z.string().max(MAX_TEXT_LENGTH),
  scope: z.string().max(MAX_TEXT_LENGTH),
  disclaimer: z.string().max(MAX_TEXT_LENGTH),
  findings: z.array(FindingSnapshotSchema).max(MAX_FINDING_COUNT),
  severity_counts: z.record(z.string(), z.number().int().min(0)),
  risk_grade: z.string().max(50),
  generated_at: z.string().max(50),
  template_type: TEMPLATE_TYPE_ENUM,
  org_logo_url: z.string().max(MAX_URL_LENGTH).nullable().optional(),

  project_details: ProjectDetailsSchema,
  owasp_compliance: z.array(OWASPComplianceEntrySchema).max(10),
  url_risk_table: z.array(URLRiskEntrySchema).max(200),
  recommendations: z.string().max(MAX_TEXT_LENGTH),
  conclusions: ConclusionsSchema,
  severity_rating_definitions: z.array(SeverityRatingDefinitionSchema).max(10),
  annexures: AnnexuresSchema,

  // Smart-merge meta (optional, not rendered)
  _excluded_finding_ids: z.array(z.string().max(100)).max(MAX_FINDING_COUNT).optional(),
  _ai_baseline: z.record(z.string(), z.unknown()).optional(),
  _ai_trigger: AITriggerSchema.optional(),
  _version_history: z.array(VersionHistoryEntrySchema).max(MAX_VERSION_HISTORY).optional(),
}).strict()

// ─── API Request Schemas ───────────────────────────────────────

export const DraftPatchRequestSchema = z.object({
  reportId: z.string().uuid(),
  content: ReportContentSchema,
  expectedVersion: z.number().int().min(0).optional(),
})

export const DraftSyncRequestSchema = z.object({
  reportId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export const DraftGetQuerySchema = z.object({
  projectId: z.string().uuid(),
})

export const GenerateRequestSchema = z.object({
  reportId: z.string().uuid(),
  projectId: z.string().uuid(),
  templateType: TEMPLATE_TYPE_ENUM.optional(),
})

export const DownloadQuerySchema = z.object({
  reportId: z.string().uuid(),
})

// ─── Helper: safe parse with error formatting ──────────────────

export function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
  return `Validation failed: ${issues.join('; ')}`
}