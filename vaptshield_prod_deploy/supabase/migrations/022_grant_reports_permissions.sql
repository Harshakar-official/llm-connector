-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Grant Reports Permissions (Migration 022)
-- ═══════════════════════════════════════════════════════════════
-- Fixes "permission denied for table reports" when using Admin Client.
-- ═══════════════════════════════════════════════════════════════

-- Grant full access to service_role (Admin Client bypasses RLS)
GRANT ALL ON TABLE public.reports TO service_role;
GRANT ALL ON TABLE public.reports TO postgres;

-- Ensure authenticated users can also see reports (RLS already exists but just in case)
GRANT SELECT ON TABLE public.reports TO authenticated;

-- If there are any sequences (ID auto-increments), grant those too
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
