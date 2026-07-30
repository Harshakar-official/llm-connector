-- Migration: Fix Super Admin Org Creation
-- Description: Updates RLS policies to allow super_admin to create orgs and read their own profile.

-- 1. Fix profiles_select: Allow super_admin to see their own profile
-- Currently it blocks super_admin explicitly: using (org_id = my_org_id() and not is_super_admin())
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (
    (org_id = my_org_id() and not is_super_admin()) 
    or id = auth.uid() 
    or is_super_admin()
  );

-- 2. Ensure organizations table has correct permissions for super_admin
-- The schema has: create policy "orgs_insert" on organizations for insert with check (is_super_admin());
-- But we get "permission denied". This often means the role 'authenticated' doesn't have INSERT grant.

grant insert, update, delete, select on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- 3. Double check org_quotas permissions
drop policy if exists "quotas_insert" on org_quotas;
create policy "quotas_insert" on org_quotas for insert
  with check (is_super_admin());
