// ============================================================
// VAPTShield — TypeScript Database Types
// Auto-generated from supabase/migrations/001_initial_schema.sql
// ============================================================

export type Role =
  | "super_admin"
  | "admin"
  | "program_manager"
  | "security_engineer"
  | "guest"
  | "developer"

export type OrgPlanTier = "free" | "starter" | "pro" | "enterprise"

export type ProjectStatus =
  | "planning"
  | "active"
  | "in_review"
  | "completed"
  | "archived"

export type ProjectType =
  | "web_app"
  | "mobile_app"
  | "api"
  | "network"
  | "cloud"
  | "red_team"
  | "thick_client"

export type VulnerabilitySeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "informational"

export type VulnerabilityStatus =
  | "open"
  | "reopened"
  | "in_progress"
  | "resolved"
  | "verified"
  | "closed"
  | "accepted_risk"
  | "false_positive"

export type ScanType =
  | "zap"
  | "kali"
  | "semgrep"
  | "trivy"
  | "gitleaks"
  | "manual"

export type ScanStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export type DockerSessionStatus =
  | "starting"
  | "running"
  | "idle"
  | "stopping"
  | "stopped"

export type NotificationType =
  | "scan_complete"
  | "finding_critical"
  | "finding_approved"
  | "report_ready"
  | "invite_received"
  | "role_changed"
  | "member_assigned"
  | "system"
  | "finding_resolved"
  | "finding_reopened"
  | "finding_assigned"

export type TrackerStatus = "pending" | "in_progress" | "resolved" | "verified"

export type TrackerPriority = "critical" | "high" | "medium" | "low"

export type ReportStatus = "draft" | "in_review" | "final"

export type ReportTemplateType =
  | "standard_vapt"
  | "executive_summary"
  | "compliance"
  | "web_app"
  | "mobile_app"

// ============================================================
// Database Row Types
// ============================================================

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  website: string | null
  industry: string | null
  is_active: boolean
  suspended_at: string | null
  suspended_reason: string | null
  created_by_super_admin: string | null
  created_at: string
  updated_at: string
}

export interface OrgQuota {
  org_id: string
  max_docker_containers: number
  active_docker_containers: number
  paid_extra_docker: number
  extra_docker_paid_at: string | null
  max_ci_scans_per_day: number
  ci_scans_today: number
  ci_scans_reset_at: string
  max_projects: number
  max_users: number
  storage_limit_gb: number
  storage_used_gb: number
  plan_tier: OrgPlanTier
  updated_at: string
}

export interface Profile {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  org_id: string | null
  department_id: string | null
  role: Role
  is_active: boolean
  last_seen: string
  presence_status: "active" | "away" | "offline"
  notification_sound: boolean
  theme_preference: "system" | "light" | "dark"
  failed_login_attempts: number
  locked_until: string | null
  has_seen_onboarding: boolean
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  name: string
  org_id: string
  description: string | null
  manager_id: string | null
  created_at: string
}

export interface Team {
  id: string
  org_id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  profile_id: string
  added_by: string | null
  created_at: string
}

export interface Invitation {
  id: string
  email: string
  org_id: string
  department_id: string | null
  role: Exclude<Role, "super_admin">
  token: string
  invited_by: string
  accepted_at: string | null
  expires_at: string
  is_expired: boolean
  created_at: string
}

export interface Project {
  id: string
  org_id: string
  name: string
  description: string | null
  status: ProjectStatus
  project_type: ProjectType
  scope: string | null
  methodology: string | null
  start_date: string | null
  end_date: string | null
  created_by: string
  is_archived: boolean
  banner_color: string
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  profile_id: string
  role_in_project: string
  assigned_by: string
  assigned_at: string
}

export interface Vulnerability {
  id: string
  org_id: string
  project_id: string
  ticket_id: string | null
  title: string
  description: string | null
  severity: VulnerabilitySeverity
  status: VulnerabilityStatus
  cvss_score: number | null
  cvss_vector: string | null
  cve_id: string | null
  cve_verified: boolean
  cwe_id: string | null
  owasp_category: string | null
  affected_component: string | null
  endpoint_url: string | null
  proof_of_concept: string | null
  impact: string | null
  remediation: string | null
  remediation_proof_url: string | null
  remediation_notes: string | null
  reference_links: string[] | null
  tags: string[] | null
  found_by: string | null
  assigned_to: string | null
  verified_by: string | null
  resolved_by: string | null
  resolved_at: string | null
  is_ai_generated: boolean
  ai_model_used: string | null
  raw_scanner_data: Record<string, unknown> | null
  approved_by: string | null
  approved_at: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface VulnAttachment {
  id: string
  vuln_id: string
  original_filename: string
  stored_filename: string
  file_url: string
  file_type: string | null
  file_size_bytes: number | null
  mime_type: string | null
  is_safe: boolean
  uploaded_by: string
  created_at: string
}

export interface Tracker {
  id: string
  org_id: string
  project_id: string
  vuln_id: string | null
  title: string
  status: TrackerStatus
  priority: TrackerPriority
  assigned_to: string | null
  due_date: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface DockerSession {
  id: string
  org_id: string
  user_id: string
  container_id: string
  container_name: string
  container_type: "kali" | "zap"
  port: number
  ws_url: string
  status: DockerSessionStatus
  last_heartbeat: string
  max_lifetime_at: string
  created_at: string
}

export interface ScanQueueItem {
  id: string
  org_id: string
  user_id: string | null
  project_id: string | null
  scan_type: ScanType
  scan_config: Record<string, unknown>
  status: ScanStatus
  queue_position: number | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
}

export interface ScanHistory {
  id: string
  org_id: string
  project_id: string | null
  scan_type: ScanType
  scan_target: string | null
  docker_session_id: string | null
  status: "running" | "completed" | "failed" | "cancelled"
  raw_output: string | null
  raw_output_json: Record<string, unknown> | null
  findings_found: number
  findings_approved: number
  started_by: string
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  error_message: string | null
}

export interface ScanFinding {
  id: string
  scan_id: string
  project_id: string
  org_id: string
  raw_data: Record<string, unknown>
  ai_normalized: Record<string, unknown> | null
  title: string | null
  severity: VulnerabilitySeverity | null
  description: string | null
  status: "pending" | "approved" | "rejected"
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  vuln_id: string | null
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  org_id: string
  title: string
  message: string
  type: NotificationType
  group_key: string | null
  is_grouped: boolean
  grouped_count: number
  is_read: boolean
  sound_played: boolean
  link: string | null
  created_at: string
}

export interface Report {
  id: string
  org_id: string
  project_id: string
  title: string
  executive_summary: string | null
  methodology: string | null
  scope: string | null
  status: ReportStatus
  template_type: ReportTemplateType
  created_by: string
  version: number
  locked_by: string | null
  locked_at: string | null
  docx_url: string | null
  pdf_url: string | null
  pdf_generation_status: "idle" | "generating" | "ready" | "failed"
  report_content: Record<string, any> | null
  created_at: string
  updated_at: string
}

export interface AuditLogEntry {
  id: string
  org_id: string | null
  actor_id: string
  action: string
  resource_type: string | null
  resource_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}
