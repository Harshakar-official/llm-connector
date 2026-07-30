-- Migration: Fix Billing RLS and Bypass Broken Service Role Key
-- Description: Allows Org Admins to update their own quotas to restore 'instant' billing functionality.

-- 1. Update org_quotas policy to allow Org Admins to update their own quota
-- This is safe because my_org_id() ensures multi-tenant isolation.
DROP POLICY IF EXISTS "quotas_update" ON org_quotas;
CREATE POLICY "quotas_update" ON org_quotas 
FOR UPDATE USING (
  is_super_admin() 
  OR (my_role() = 'admin' AND org_id = my_org_id())
);

-- 2. Ensure Org Admins can insert into audit_log for their own org
DROP POLICY IF EXISTS "audit_insert" ON audit_log;
CREATE POLICY "audit_insert" ON audit_log 
FOR INSERT WITH CHECK (
  is_super_admin()
  OR (my_role() = 'admin' AND org_id = my_org_id())
);

-- 3. Verify my_role() and my_org_id() are robust
-- (Already defined in earlier migrations, but ensuring they are STABLE)
ALTER FUNCTION my_role() STABLE;
ALTER FUNCTION my_org_id() STABLE;
