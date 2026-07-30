-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Master RBAC Alignment (Migration 008)
-- Goal: Align RLS with CLAUDE.md Section 4 Text Definitions
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. PROJECTS: PM can now DELETE (per Vision) ────────────────
drop policy if exists "projects_delete" on projects;
create policy "projects_delete" on projects for delete
using (
  org_id = my_org_id()
  and my_role() in ('admin', 'program_manager')
);

-- ─── 2. VULNERABILITIES: SE can now DELETE (per Vision) ─────────
drop policy if exists "vulns_delete" on vulnerabilities;
create policy "vulns_delete" on vulnerabilities for delete
using (
  org_id = my_org_id()
  and (
    my_role() in ('admin', 'program_manager', 'security_engineer')
  )
);

-- ─── 3. SCANNERS: PM explicitly BLOCKED from sessions/queue ─────
-- Only Admin and SE can use scanners
drop policy if exists "docker_select" on docker_sessions;
drop policy if exists "docker_insert" on docker_sessions;
create policy "docker_select" on docker_sessions for select
  using (org_id = my_org_id() and my_role() in ('admin', 'security_engineer'));
create policy "docker_insert" on docker_sessions for insert
  with check (org_id = my_org_id() and my_role() in ('admin', 'security_engineer'));

drop policy if exists "scan_queue_insert" on scan_queue;
create policy "scan_queue_insert" on scan_queue for insert
  with check (org_id = my_org_id() and my_role() in ('admin', 'security_engineer'));

-- ─── 4. REPORTS: SE explicitly BLOCKED from generation ──────────
drop policy if exists "reports_insert" on reports;
create policy "reports_insert" on reports for insert
with check (
  org_id = my_org_id()
  and my_role() in ('admin', 'program_manager')
);

-- ─── 5. USER MANAGEMENT: PM restricted to Guest/SE invites ──────
-- This is mostly handled by the invitations logic, but RLS should be aware.
-- (Existing policies are already quite good here)
