-- ============================================================
-- VAPTShield Migration 074: Webhook Replay Protection
-- Prevents attackers from replaying captured GitHub webhooks.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.processed_webhooks (
    delivery_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-delete records older than 7 days to keep table small
-- (Optional, can be done via a cron extension or manually, we just rely on primary key for deduping)
