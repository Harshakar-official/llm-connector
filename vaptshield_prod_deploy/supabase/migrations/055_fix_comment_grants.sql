-- ============================================================
-- VAPTShield Migration 055: Fix Permissions & Actionable Notifications
-- 1. Grant SQL permissions for comments to authenticated users
-- 2. Ensure notification links are robust
-- ============================================================

-- 1. FIX: Missing GRANTS for vuln_comments (Error 42501)
-- Even with RLS, the role needs table-level permission in the public schema
GRANT ALL ON TABLE vuln_comments TO authenticated;
GRANT ALL ON TABLE vuln_comments TO service_role;
-- Required for the gen_random_uuid() and other sequences if any
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- 2. Ensure RLS is still solid
ALTER TABLE vuln_comments ENABLE ROW LEVEL SECURITY;

-- 3. Verify notification links logic
-- We already have the 'link' column, let's make sure it's used in future triggers.
-- (Done in Migration 052)
