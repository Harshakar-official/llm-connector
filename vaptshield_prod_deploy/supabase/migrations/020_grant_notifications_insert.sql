-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Grant INSERT on notifications to service_role (Migration 020)
-- Goal: Allow server-side admin client to insert notifications
--       for cross-user operations (e.g., PM assigning SE to project)
-- ═══════════════════════════════════════════════════════════════

-- The notifications table only had SELECT and UPDATE RLS policies.
-- Server actions that need to insert notifications for OTHER users
-- (e.g., assignMembers, assignTeamToProjectAction) must use the
-- service_role client to bypass RLS. This GRANT enables that.
GRANT INSERT ON public.notifications TO service_role;