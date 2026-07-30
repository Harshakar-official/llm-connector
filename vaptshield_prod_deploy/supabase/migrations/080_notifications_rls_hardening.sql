-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Notifications RLS Hardening (Migration 080)
-- Fix 1: DELETE policy was missing entirely — deleteNotification()
--         silently failed (200, 0 rows). Users can delete OWN rows.
-- Fix 2: INSERT policy only checked org_id = my_org_id(), but NOT
--         the target user_id. Any org member could create a
--         notification (incl. phishing link) for a user of ANOTHER
--         org (cross-tenant, OWASP A01 Broken Access Control).
--         Now the target user must belong to the sender's org.
-- ═══════════════════════════════════════════════════════════════

-- Fix 1: allow users to delete their own notifications
DROP POLICY IF EXISTS "notifs_delete" ON public.notifications;
CREATE POLICY "notifs_delete" ON public.notifications FOR DELETE
USING (user_id = auth.uid());

-- Fix 2: tighten insert — target user must be in the sender's org
DROP POLICY IF EXISTS "notifs_insert" ON public.notifications;
CREATE POLICY "notifs_insert" ON public.notifications FOR INSERT
WITH CHECK (
  org_id = my_org_id()
  AND user_id IN (SELECT id FROM public.profiles WHERE org_id = my_org_id())
);
