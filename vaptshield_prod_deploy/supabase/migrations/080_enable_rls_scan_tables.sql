-- ============================================================================
-- 080_enable_rls_scan_tables.sql
-- ----------------------------------------------------------------------------
-- Z+ SECURITY: Close cross-tenant exposure on scan tables.
--
-- Problem:
--   `zap_tasks`, `pending_alerts` and `processed_webhooks` were created WITHOUT
--   row-level security. In Supabase every table in the `public` schema is
--   auto-exposed through PostgREST to the public `anon` / `authenticated` roles.
--   With RLS disabled, anyone holding the (public) anon key could read every
--   organization's scan tasks and pending vulnerability alerts (which include
--   full HTTP request/response bodies, evidence and payloads).
--
-- Why this is safe (no server breakage):
--   All server-side access to these tables goes through the direct Postgres
--   connection (`getPool()` / DATABASE_URL, `postgres` role). That role BYPASSES
--   RLS, so enabling RLS does not affect any existing API route. No client-side
--   `supabase-js` `.from()` calls or realtime subscriptions touch these tables.
--
-- Effect:
--   - anon role: no access (default deny).
--   - authenticated role: read-only, strictly scoped to their own org.
--     (Writes remain server-only through the pooled postgres connection.)
-- ============================================================================

-- ── zap_tasks ────────────────────────────────────────────────────────────────
ALTER TABLE "public"."zap_tasks" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zap_tasks_select_own_org" ON "public"."zap_tasks";
CREATE POLICY "zap_tasks_select_own_org"
  ON "public"."zap_tasks"
  FOR SELECT
  TO "authenticated"
  USING ("org_id" = "public"."my_org_id"());

-- ── pending_alerts ───────────────────────────────────────────────────────────
ALTER TABLE "public"."pending_alerts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_alerts_select_own_org" ON "public"."pending_alerts";
CREATE POLICY "pending_alerts_select_own_org"
  ON "public"."pending_alerts"
  FOR SELECT
  TO "authenticated"
  USING ("org_id" = "public"."my_org_id"());

-- ── processed_webhooks ───────────────────────────────────────────────────────
-- Internal replay-protection ledger. No org_id, no legitimate client access.
-- Enable RLS with no policies => default-deny for anon/authenticated.
-- Server (postgres role via getPool) bypasses RLS and continues to work.
ALTER TABLE "public"."processed_webhooks" ENABLE ROW LEVEL SECURITY;
