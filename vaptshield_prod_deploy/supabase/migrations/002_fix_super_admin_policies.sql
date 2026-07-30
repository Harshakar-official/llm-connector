-- ═══════════════════════════════════════════════════════════════
-- Fix Super Admin Policies - Migration 002
-- ═══════════════════════════════════════════════════════════════

-- Fix profiles: Allow users to read their own profile (including super_admin)
-- This is needed because super_admin has no org_id, so org-based policy fails

drop policy if exists "profiles_select" on profiles;

-- Policy 1: Users can read their own profile
create policy "profiles_select_own" on profiles for select
  using (id = auth.uid());

-- Policy 2: Users can read profiles within their organization (non-super_admin only)
create policy "profiles_select_org" on profiles for select
  using (org_id = my_org_id() and not is_super_admin());

-- Fix organizations: Allow super_admin to read all organizations
drop policy if exists "orgs_select" on organizations;

create policy "orgs_select" on organizations for select
  using (is_super_admin() OR id = my_org_id());

-- Fix org_quotas: Allow super_admin to read all quotas
drop policy if exists "quotas_select" on org_quotas;

create policy "quotas_select" on org_quotas for select
  using (is_super_admin() OR org_id = my_org_id());

-- Fix invitations: Allow super_admin to read all invitations
drop policy if exists "invitations_select" on invitations;

create policy "invitations_select" on invitations for select
  using (is_super_admin() OR (org_id = my_org_id() and my_role() in ('admin','program_manager')));

-- Fix projects: super_admin sees nothing (intentional per spec)
-- This keeps existing behavior - super_admin should NOT see org data

-- Fix vulnerabilities: super_admin sees nothing (intentional per spec)

-- Fix reports: super_admin sees nothing (intentional per spec)

-- Fix audit_log: Allow super_admin to see all audit logs
drop policy if exists "audit_select" on audit_log;

create policy "audit_select" on audit_log for select
  using (is_super_admin() OR (org_id = my_org_id() and my_role() = 'admin'));

-- Fix scan_history: super_admin sees nothing
-- This keeps existing behavior

-- Fix docker_sessions: super_admin sees nothing
-- This keeps existing behavior

-- Fix notifications: Allow super_admin to see their own notifications
drop policy if exists "notifs_select" on notifications;

create policy "notifs_select" on notifications for select
  using (user_id = auth.uid());

-- Ensure super_admin profile is readable (for profile page)
-- The profiles_select_own policy above handles this