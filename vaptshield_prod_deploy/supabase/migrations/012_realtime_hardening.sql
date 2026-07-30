-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Realtime Synchronization Hardening (Migration 012)
-- Goal: Ensure instant UI updates for projects and memberships
-- ═══════════════════════════════════════════════════════════════

alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table project_members;
