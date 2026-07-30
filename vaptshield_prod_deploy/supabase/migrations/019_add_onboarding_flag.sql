-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Migration 019: Add onboarding flag to profiles
-- ═══════════════════════════════════════════════════════════════
-- Tracks whether a user has seen the welcome/onboarding page.
-- Used to redirect first-time users to /welcome after login.

-- Add the column (default false so new users see onboarding)
alter table profiles
  add column if not exists has_seen_onboarding boolean default false;

-- Existing users (who already have profiles) should skip onboarding
-- so they don't get redirected unexpectedly after migration
update profiles
  set has_seen_onboarding = true
  where has_seen_onboarding = false
    and created_at < now() - interval '1 minute';