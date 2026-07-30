-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Enable Notification Inserts (Migration 026)
-- Goal: Allow authenticated users to create notifications for others
-- in their organization, removing dependency on the corrupted admin key.
-- ═══════════════════════════════════════════════════════════════

create policy "notifs_insert" on public.notifications for insert
with check (
  org_id = my_org_id()
);
