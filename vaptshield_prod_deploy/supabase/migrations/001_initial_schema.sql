-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Initial Database Schema (Migration 001)
-- ═══════════════════════════════════════════════════════════════
-- Multi-tenant SaaS VAPT platform schema
-- Includes: tables, RLS policies, helper functions, triggers, RPCs
-- ═══════════════════════════════════════════════════════════════

-- ─── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ═══════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════

-- ─── Organizations (multi-tenant root) ────────────────────────
create table organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  logo_url text,
  website text,
  industry text,
  is_active boolean default true,
  suspended_at timestamptz,
  suspended_reason text,
  created_by_super_admin uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Org Quotas (resource limits) ─────────────────────────────
create table org_quotas (
  org_id uuid references organizations(id) on delete cascade primary key,
  -- Docker quotas
  max_docker_containers int default 1,
  active_docker_containers int default 0,
  paid_extra_docker int default 0,
  extra_docker_paid_at timestamptz,
  -- CI/CD quotas
  max_ci_scans_per_day int default 3,
  ci_scans_today int default 0,
  ci_scans_reset_at date default current_date,
  -- Project quotas
  max_projects int default 5,
  -- User quotas
  max_users int default 10,
  -- Storage quotas
  storage_limit_gb decimal default 2,
  storage_used_gb decimal default 0,
  -- Plan tier
  plan_tier text check (plan_tier in ('free','starter','pro','enterprise')) default 'free',
  updated_at timestamptz default now()
);

-- ─── Profiles (extends auth.users) ────────────────────────────
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  email text not null,
  avatar_url text,
  org_id uuid references organizations(id),
  role text check (role in (
    'super_admin', 'admin', 'program_manager', 'security_engineer', 'guest'
  )) default 'guest',
  is_active boolean default true,
  -- Realtime presence
  last_seen timestamptz default now(),
  presence_status text check (presence_status in ('active','away','offline')) default 'offline',
  -- Preferences
  notification_sound boolean default true,
  theme_preference text default 'system',
  -- Security
  failed_login_attempts int default 0,
  locked_until timestamptz,
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Invitations ──────────────────────────────────────────────
create table invitations (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  org_id uuid references organizations(id) on delete cascade,
  role text check (role in ('admin','program_manager','security_engineer','guest')) not null,
  token text unique default gen_random_uuid()::text,
  invited_by uuid references profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz default now() + interval '7 days',
  created_at timestamptz default now()
);

-- Helper function to check if invitation is expired (used in app code, not as generated column)
-- Note: We removed the `is_expired` generated column because PostgreSQL requires
-- generated columns to use only IMMUTABLE functions, and now() is not immutable.
-- App code can check: SELECT * FROM invitations WHERE expires_at < now() AND accepted_at IS NULL
-- Or use this helper:
create or replace function is_invitation_expired(p_invitation invitations) returns boolean as $$
  select p_invitation.expires_at < now() and p_invitation.accepted_at is null;
$$ language sql stable;

-- Index to speed up "find pending invitations" queries
create index invitations_pending on invitations(email, expires_at)
  where accepted_at is null;


-- ─── Projects ─────────────────────────────────────────────────
create table projects (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  description text,
  status text check (status in ('planning','active','in_review','completed','archived')) default 'planning',
  project_type text check (project_type in ('web_app','mobile_app','api','network','cloud','red_team','thick_client')) default 'web_app',
  scope text,
  methodology text,
  start_date date,
  end_date date,
  created_by uuid references profiles(id),
  is_archived boolean default false,
  banner_color text default '#2563eb',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Project Members ──────────────────────────────────────────
create table project_members (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role_in_project text default 'engineer',
  assigned_by uuid references profiles(id),
  assigned_at timestamptz default now(),
  unique(project_id, profile_id)
);

-- ─── Vulnerabilities (Findings) ───────────────────────────────
create table vulnerabilities (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  -- Core fields
  title text not null,
  description text,
  severity text check (severity in ('critical','high','medium','low','informational')) not null,
  status text check (status in ('open','in_review','resolved','accepted_risk','false_positive')) default 'open',
  -- Technical details
  cvss_score decimal(3,1) check (cvss_score >= 0 and cvss_score <= 10),
  cvss_vector text,
  cve_id text,
  cve_verified boolean default false,
  cwe_id text,
  owasp_category text,
  affected_component text,
  endpoint_url text,
  -- Content
  proof_of_concept text,
  impact text,
  remediation text,
  reference_links text[],
  tags text[],
  -- Attribution
  found_by uuid references profiles(id),
  assigned_to uuid references profiles(id),
  verified_by uuid references profiles(id),
  -- AI metadata
  is_ai_generated boolean default false,
  ai_model_used text,
  raw_scanner_data jsonb,
  -- Approval workflow
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  -- Versioning (optimistic locking)
  version int default 1,
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Full-text search index
create index vuln_search_idx on vulnerabilities
  using gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')));

-- Performance indexes
create index vuln_org_sev_status on vulnerabilities(org_id, severity, status);
create index vuln_project on vulnerabilities(project_id);
create index vuln_created on vulnerabilities(created_at desc);

-- ─── Vulnerability Attachments ────────────────────────────────
create table vuln_attachments (
  id uuid default gen_random_uuid() primary key,
  vuln_id uuid references vulnerabilities(id) on delete cascade,
  original_filename text not null,
  stored_filename text not null,
  file_url text not null,
  file_type text,
  file_size_bytes int,
  mime_type text,
  is_safe boolean default false,
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ─── Tracker (Remediation) ────────────────────────────────────
create table tracker (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  vuln_id uuid references vulnerabilities(id) on delete set null,
  title text not null,
  status text check (status in ('pending','in_progress','resolved','verified')) default 'pending',
  priority text check (priority in ('critical','high','medium','low')) default 'medium',
  assigned_to uuid references profiles(id),
  due_date date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Docker Sessions ──────────────────────────────────────────
create table docker_sessions (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  container_id text unique not null,
  container_name text not null,
  container_type text check (container_type in ('kali','zap')) not null,
  port int not null,
  ws_url text not null,
  status text check (status in ('starting','running','idle','stopping','stopped')) default 'starting',
  last_heartbeat timestamptz default now(),
  max_lifetime_at timestamptz default now() + interval '4 hours',
  created_at timestamptz default now()
);

create index docker_sessions_org on docker_sessions(org_id);
create index docker_sessions_heartbeat on docker_sessions(last_heartbeat);

-- ─── Scan Queue ───────────────────────────────────────────────
create table scan_queue (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id),
  project_id uuid references projects(id),
  scan_type text check (scan_type in ('zap','kali','semgrep','trivy','gitleaks')) not null,
  scan_config jsonb not null,
  status text check (status in ('queued','running','completed','failed','cancelled')) default 'queued',
  queue_position int,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz default now()
);

-- ─── Scan History ─────────────────────────────────────────────
create table scan_history (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  project_id uuid references projects(id),
  scan_type text check (scan_type in ('zap','kali','semgrep','trivy','gitleaks','manual')) not null,
  scan_target text,
  docker_session_id uuid references docker_sessions(id),
  status text check (status in ('running','completed','failed','cancelled')) default 'running',
  raw_output text,
  raw_output_json jsonb,
  findings_found int default 0,
  findings_approved int default 0,
  started_by uuid references profiles(id),
  started_at timestamptz default now(),
  completed_at timestamptz,
  duration_seconds int,
  error_message text
);

create index scan_history_org_started on scan_history(org_id, started_at desc);

-- ─── Scan Findings (pending approval) ─────────────────────────
create table scan_findings (
  id uuid default gen_random_uuid() primary key,
  scan_id uuid references scan_history(id) on delete cascade,
  project_id uuid references projects(id),
  org_id uuid references organizations(id),
  raw_data jsonb not null,
  ai_normalized jsonb,
  title text,
  severity text,
  description text,
  status text check (status in ('pending','approved','rejected')) default 'pending',
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  vuln_id uuid references vulnerabilities(id),
  created_at timestamptz default now()
);

-- ─── Notifications ────────────────────────────────────────────
create table notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  org_id uuid references organizations(id),
  title text not null,
  message text not null,
  type text check (type in (
    'scan_complete','finding_critical','finding_approved',
    'report_ready','invite_received','role_changed',
    'member_assigned','system','docker_quota_warning','docker_expired'
  )) not null,
  group_key text,
  is_grouped boolean default false,
  grouped_count int default 1,
  is_read boolean default false,
  sound_played boolean default false,
  link text,
  created_at timestamptz default now()
);

create index notif_user_read on notifications(user_id, is_read, created_at desc);

-- ─── Reports ──────────────────────────────────────────────────
create table reports (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  executive_summary text,
  methodology text,
  scope text,
  status text check (status in ('draft','in_review','final')) default 'draft',
  template_type text check (template_type in ('standard_vapt','executive_summary','compliance','web_app','mobile_app')) default 'standard_vapt',
  created_by uuid references profiles(id),
  -- Optimistic locking
  version int default 1,
  locked_by uuid references profiles(id),
  locked_at timestamptz,
  -- Generated files
  docx_url text,
  pdf_url text,
  pdf_generation_status text check (pdf_generation_status in ('idle','generating','ready','failed')) default 'idle',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Audit Log ────────────────────────────────────────────────
create table audit_log (
  id uuid default gen_random_uuid() primary key,
  org_id uuid,
  user_id uuid references profiles(id),
  action text not null,
  resource_type text,
  resource_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index audit_org_created on audit_log(org_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════

-- Auto-update updated_at on row update
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_orgs_updated before update on organizations
  for each row execute function update_updated_at();
create trigger trg_quotas_updated before update on org_quotas
  for each row execute function update_updated_at();
create trigger trg_profiles_updated before update on profiles
  for each row execute function update_updated_at();
create trigger trg_projects_updated before update on projects
  for each row execute function update_updated_at();
create trigger trg_vulns_updated before update on vulnerabilities
  for each row execute function update_updated_at();
create trigger trg_tracker_updated before update on tracker
  for each row execute function update_updated_at();
create trigger trg_reports_updated before update on reports
  for each row execute function update_updated_at();

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS (used by RLS policies)
-- ═══════════════════════════════════════════════════════════════

create or replace function my_org_id() returns uuid as $$
  select org_id from profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function my_role() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function is_super_admin() returns boolean as $$
  select coalesce(role = 'super_admin', false) from profiles where id = auth.uid();
$$ language sql security definer stable;

create or replace function is_project_member(p_project_id uuid) returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and profile_id = auth.uid()
  );
$$ language sql security definer stable;

create or replace function count_admins_in_org(p_org_id uuid) returns int as $$
  select count(*)::int from profiles
  where org_id = p_org_id and role = 'admin' and is_active = true;
$$ language sql security definer stable;

-- ═══════════════════════════════════════════════════════════════
-- ATOMIC RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

create or replace function acquire_docker_slot(p_org_id uuid)
returns boolean as $$
declare
  v_updated_count int;
begin
  update org_quotas
  set active_docker_containers = active_docker_containers + 1
  where org_id = p_org_id
    and active_docker_containers < (max_docker_containers + paid_extra_docker);
  
  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$ language plpgsql security definer;

create or replace function release_docker_slot(p_org_id uuid)
returns void as $$
begin
  update org_quotas
  set active_docker_containers = greatest(active_docker_containers - 1, 0)
  where org_id = p_org_id;
end;
$$ language plpgsql security definer;

create or replace function check_ci_scan_quota(p_org_id uuid)
returns boolean as $$
declare
  v_updated_count int;
begin
  update org_quotas
  set ci_scans_today = 0,
      ci_scans_reset_at = current_date
  where org_id = p_org_id
    and ci_scans_reset_at < current_date;
  
  update org_quotas
  set ci_scans_today = ci_scans_today + 1
  where org_id = p_org_id
    and ci_scans_today < max_ci_scans_per_day;
  
  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$ language plpgsql security definer;

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════

alter table organizations enable row level security;
alter table org_quotas enable row level security;
alter table profiles enable row level security;
alter table invitations enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table vulnerabilities enable row level security;
alter table vuln_attachments enable row level security;
alter table tracker enable row level security;
alter table docker_sessions enable row level security;
alter table scan_queue enable row level security;
alter table scan_history enable row level security;
alter table scan_findings enable row level security;
alter table notifications enable row level security;
alter table reports enable row level security;
alter table audit_log enable row level security;

-- ─── ORGANIZATIONS ────────────────────────────────────────────
create policy "orgs_select" on organizations for select
  using (id = my_org_id() or is_super_admin());
create policy "orgs_insert" on organizations for insert
  with check (is_super_admin());
create policy "orgs_update" on organizations for update
  using ((id = my_org_id() and my_role() = 'admin') or is_super_admin());
create policy "orgs_delete" on organizations for delete
  using (is_super_admin());

-- ─── ORG QUOTAS ───────────────────────────────────────────────
create policy "quotas_select" on org_quotas for select
  using (org_id = my_org_id() or is_super_admin());
create policy "quotas_update" on org_quotas for update
  using (is_super_admin());

-- ─── PROFILES ─────────────────────────────────────────────────
create policy "profiles_select" on profiles for select
  using (org_id = my_org_id() and not is_super_admin());
create policy "profiles_update_self" on profiles for update
  using (id = auth.uid());
create policy "profiles_update_admin" on profiles for update
  using (my_role() = 'admin' and org_id = my_org_id());

-- ─── INVITATIONS ──────────────────────────────────────────────
create policy "invitations_select" on invitations for select
  using (org_id = my_org_id() and my_role() in ('admin','program_manager'));
create policy "invitations_insert" on invitations for insert
  with check (org_id = my_org_id() and my_role() in ('admin','program_manager'));
create policy "invitations_update" on invitations for update
  using (org_id = my_org_id() and my_role() in ('admin','program_manager'));

-- ─── PROJECTS ─────────────────────────────────────────────────
create policy "projects_select" on projects for select
  using (
    org_id = my_org_id()
    and not is_super_admin()
    and (
      my_role() in ('admin','program_manager','security_engineer')
      or (my_role() = 'guest' and is_project_member(id))
    )
  );
create policy "projects_insert" on projects for insert
  with check (
    org_id = my_org_id()
    and my_role() in ('admin','program_manager')
  );
create policy "projects_update" on projects for update
  using (
    org_id = my_org_id()
    and my_role() in ('admin','program_manager')
  );
create policy "projects_delete" on projects for delete
  using (
    org_id = my_org_id()
    and my_role() = 'admin'
  );

-- ─── PROJECT MEMBERS ──────────────────────────────────────────
create policy "members_select" on project_members for select
  using (
    project_id in (
      select id from projects where org_id = my_org_id()
    )
  );
create policy "members_insert" on project_members for insert
  with check (
    my_role() in ('admin','program_manager')
    and project_id in (select id from projects where org_id = my_org_id())
  );
create policy "members_delete" on project_members for delete
  using (
    my_role() in ('admin','program_manager')
    and project_id in (select id from projects where org_id = my_org_id())
  );

-- ─── VULNERABILITIES ──────────────────────────────────────────
create policy "vulns_select" on vulnerabilities for select
  using (
    org_id = my_org_id()
    and not is_super_admin()
    and (
      my_role() in ('admin','program_manager','security_engineer')
      or (my_role() = 'guest' and is_project_member(project_id))
    )
  );
create policy "vulns_insert" on vulnerabilities for insert
  with check (
    org_id = my_org_id()
    and my_role() in ('admin','program_manager','security_engineer')
  );
create policy "vulns_update" on vulnerabilities for update
  using (
    org_id = my_org_id()
    and (
      my_role() in ('admin','program_manager')
      or (my_role() = 'security_engineer' and found_by = auth.uid())
    )
  );
create policy "vulns_delete" on vulnerabilities for delete
  using (
    org_id = my_org_id()
    and my_role() in ('admin','program_manager','security_engineer')
  );

-- ─── VULN ATTACHMENTS ─────────────────────────────────────────
create policy "vuln_attachments_select" on vuln_attachments for select
  using (
    vuln_id in (select id from vulnerabilities where org_id = my_org_id())
  );
create policy "vuln_attachments_insert" on vuln_attachments for insert
  with check (
    my_role() in ('admin','program_manager','security_engineer')
    and vuln_id in (select id from vulnerabilities where org_id = my_org_id())
  );
create policy "vuln_attachments_delete" on vuln_attachments for delete
  using (
    my_role() in ('admin','program_manager','security_engineer')
    and vuln_id in (select id from vulnerabilities where org_id = my_org_id())
  );

-- ─── TRACKER ──────────────────────────────────────────────────
create policy "tracker_select" on tracker for select
  using (org_id = my_org_id() and not is_super_admin());
create policy "tracker_insert" on tracker for insert
  with check (
    org_id = my_org_id()
    and my_role() in ('admin','program_manager','security_engineer')
  );
create policy "tracker_update" on tracker for update
  using (
    org_id = my_org_id()
    and my_role() in ('admin','program_manager','security_engineer')
  );

-- ─── DOCKER SESSIONS ──────────────────────────────────────────
create policy "docker_select" on docker_sessions for select
  using (
    org_id = my_org_id()
    and my_role() in ('admin','security_engineer')
  );
create policy "docker_insert" on docker_sessions for insert
  with check (
    org_id = my_org_id()
    and my_role() in ('admin','security_engineer')
  );
create policy "docker_update" on docker_sessions for update
  using (
    org_id = my_org_id()
    and (my_role() = 'admin' or user_id = auth.uid())
  );

-- ─── SCAN QUEUE ───────────────────────────────────────────────
create policy "scan_queue_select" on scan_queue for select
  using (org_id = my_org_id());
create policy "scan_queue_insert" on scan_queue for insert
  with check (
    org_id = my_org_id()
    and my_role() in ('admin','security_engineer')
  );

-- ─── SCAN HISTORY ─────────────────────────────────────────────
create policy "scan_history_select" on scan_history for select
  using (
    org_id = my_org_id()
    and not is_super_admin()
  );
create policy "scan_history_insert" on scan_history for insert
  with check (
    org_id = my_org_id()
    and my_role() in ('admin','security_engineer')
  );

-- ─── SCAN FINDINGS ────────────────────────────────────────────
create policy "scan_findings_select" on scan_findings for select
  using (
    org_id = my_org_id()
    and not is_super_admin()
  );
create policy "scan_findings_update" on scan_findings for update
  using (
    org_id = my_org_id()
    and my_role() in ('admin','program_manager','security_engineer')
  );

-- ─── NOTIFICATIONS ────────────────────────────────────────────
create policy "notifs_select" on notifications for select
  using (user_id = auth.uid());
create policy "notifs_update" on notifications for update
  using (user_id = auth.uid());

-- ─── REPORTS ──────────────────────────────────────────────────
create policy "reports_select" on reports for select
  using (
    org_id = my_org_id()
    and not is_super_admin()
    and (
      my_role() in ('admin','program_manager','security_engineer')
      or (my_role() = 'guest' and is_project_member(project_id))
    )
  );
create policy "reports_insert" on reports for insert
  with check (
    org_id = my_org_id()
    and my_role() in ('admin','program_manager')
  );
create policy "reports_update" on reports for update
  using (
    org_id = my_org_id()
    and my_role() in ('admin','program_manager')
  );

-- ─── AUDIT LOG ────────────────────────────────────────────────
create policy "audit_select" on audit_log for select
  using (
    org_id = my_org_id()
    and my_role() = 'admin'
  );

-- ═══════════════════════════════════════════════════════════════
-- ENABLE REALTIME
-- ═══════════════════════════════════════════════════════════════

alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table vulnerabilities;
alter publication supabase_realtime add table scan_history;
alter publication supabase_realtime add table tracker;
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table docker_sessions;

-- ═══════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════
