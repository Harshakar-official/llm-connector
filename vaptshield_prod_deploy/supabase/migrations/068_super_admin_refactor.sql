-- ============================================================
-- VAPTShield Migration 068: Super Admin Platform Settings Refactor
-- 1. Remove redundant/obsolete settings keys
-- 2. Add new enterprise-standard settings keys
-- 3. Fix stale audit_log FK name to match renamed column (Critical #2)
-- ============================================================

-- 1. CLEANUP: REMOVE OBSOLETE KEYS
DELETE FROM public.platform_settings 
WHERE key IN (
    'password_min_length', 
    'session_timeout_minutes', 
    'mfa_enforced', 
    'max_failed_attempts', 
    'ai_features_enabled'
);

-- 2. INSERT NEW ENTERPRISE KEYS
INSERT INTO public.platform_settings (key, value, category, description)
VALUES 
    ('default_org_plan_tier', 'starter', 'quotas', 'Default subscription tier for newly created organizations.'),
    ('allowed_email_domains', '', 'security', 'Comma-separated list of allowed email domains for registration (empty allows all).'),
    ('audit_log_retention_days', '365', 'general', 'Number of days to retain security audit logs before purging.'),
    ('notification_retention_days', '30', 'general', 'Number of days to keep in-app notifications before purging.')
ON CONFLICT (key) DO NOTHING;

-- 3. FIX STALE FK NAME (Critical #2 Resolution)
-- The column was renamed from user_id to actor_id, but FK kept the old name.
ALTER TABLE public.audit_log 
RENAME CONSTRAINT audit_log_user_id_fkey TO audit_log_actor_id_fkey;

-- 4. VERIFY / HARDEN is_super_admin function
-- Ensure it's stable and performs well for middleware
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT role = 'super_admin'
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
