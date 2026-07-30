-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Add notifications to Realtime publication (Migration 020)
-- Fix: PM→SE assignment notifications only appeared on manual refresh
-- Root cause: notifications table was NOT in supabase_realtime publication
-- ═══════════════════════════════════════════════════════════════

alter publication supabase_realtime add table notifications;