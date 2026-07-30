-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Fix Notifications RLS (Migration 030)
-- Goal: Ensure PMs and Admins can create notifications for members
--       they manage without triggering RLS violations.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "notifs_insert" ON public.notifications;
CREATE POLICY "notifs_insert" ON public.notifications FOR INSERT 
WITH CHECK (
  org_id = my_org_id()
);
