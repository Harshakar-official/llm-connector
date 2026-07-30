# VaptShield — Enterprise Security Audit (Progress Report)

**Auditor:** Claude Code
**Started:** 2026-07-15
**Approach:** Small focused tasks, security-first, report-then-fix
**Scope:** Multi-tenant isolation + integrated tools, across frontend / backend / DB / UI-UX

---

## ✅ TASK 1 — Auth & Multi-Tenant Foundation  (DONE + FIXED)

**Overall verdict:** Foundation is mature & enterprise-grade.
- `getSafeSession()` verifies profile from DB (does not trust JWT), blocks suspended orgs.
- `verifyProjectAccess()`, org-scoped queries, CSRF origin checks, rate limiting,
  prompt-injection guards, HMAC-verified webhooks with replay protection.

### Issue #1 — `verifyProjectAccess` admin branch skipped org check  🟠 (FIXED)
- File: `lib/utils/security-guard.ts`
- Bug: `if (role === 'admin') return { allowed: true, ... }` — never verified the
  project belonged to the admin's own org → an Org-A admin could pass an Org-B
  `projectId` and be granted access (cross-tenant IDOR). Most exposed via
  `app/api/poc/view/route.ts` (relied solely on this guard).
- **Fix applied:** admin branch now confirms `projects.org_id === session.orgId`
  before granting access. `super_admin` behaviour unchanged. `tsc` clean.

### Issue #2 — `reports/[id]/docx` computed `authenticated` but never enforced it  🟠 (FIXED)
- File: `app/api/reports/[id]/docx/route.ts`
- Bug: `authenticated` flag set for the ONLYOFFICE JWT path but never checked;
  route accepted `access_token` query param and queried report by id with **no
  org scoping** (unlike the sibling `download` route) → potential cross-org
  report disclosure, purely RLS-dependent.
- **Fix applied:** JWT server-to-server path still trusted; all other requests
  now require an authenticated user whose `org_id` matches the report's org,
  and `authenticated` is enforced before serving. No frontend caller exists
  (UI downloads DOCX straight from Supabase storage), so no UX breakage. `tsc` clean.

**Verification:** `npx tsc --noEmit` → 0 errors. Return contracts unchanged.
> ⚠️ Recommended live sanity test (pending): as an admin, open own-org
> finding/PoC and confirm no false 403.

---

## 🟡 TASK 2a — RLS Policies Deep-Dive  (DONE — fix PENDING apply)

Source of truth used: `supabase_backup_13_jul_2026.sql` (live pg_dump —
99 policies, 47 RLS-enabled tables). 86 migration files exist (lots of RLS iteration).

### 🔴 CRITICAL Finding — 3 public tables have RLS DISABLED
Supabase auto-exposes every `public` table through PostgREST to the public
`anon` key. RLS off = anyone with the (public) anon key can hit
`https://<proj>.supabase.co/rest/v1/<table>` and read **all orgs' data**.

| Table | org_id | Sensitive data | Risk |
|-------|--------|----------------|------|
| `zap_tasks` | yes | scan targets, container IDs, scan config | 🔴 cross-tenant leak |
| `pending_alerts` | yes | full vuln alerts: HTTP req/resp, evidence, payloads, PoC | 🔴 cross-tenant leak |
| `processed_webhooks` | no | webhook delivery IDs (internal) | 🟡 minor |

**Why the fix is safe (no server breakage):**
- All server access is via `getPool()` (direct Postgres, `DATABASE_URL`,
  `postgres` role) which BYPASSES RLS.
- Verified: NO client-side `supabase-js .from()` calls and NO realtime
  subscriptions touch these tables (all access is `pool.query(...)`,
  manually `WHERE org_id = $1` scoped).

**Fix prepared (NOT yet applied):**
`supabase/migrations/080_enable_rls_scan_tables.sql`
- Enables RLS on all 3 tables.
- Adds `authenticated` read-only policies scoped to `public.my_org_id()` for
  `zap_tasks` + `pending_alerts` (defense-in-depth / future-proofing).
- `processed_webhooks`: RLS enabled, no policies (server-only, default-deny).

**➡️ TOMORROW — decide how to apply migration 080:**
- Repo has NO migration runner (no Supabase CLI config, no `db:migrate` script)
  → migrations are applied manually.
- Options: (a) apply via `DATABASE_URL` from `.env.local` with psql/node-pg,
  (b) paste into Supabase SQL editor yourself, (c) verify the exploit first
  (anon-key GET on `pending_alerts`) then apply.
- Rollback if ever needed: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY;`

---

## ⏭️ PENDING / NEXT TASKS (not yet started)

- **2a-apply:** Apply migration 080 to DB (see decision above).
- **2b:** Org-scoping consistency across remaining tenant routes
  (`scan-findings`, `projects`, `reports`, `cicd`).
- **2c:** Server Actions layer — role escalation / invite abuse
  (`organization-actions`, `team-actions`, `super-admin-actions`).
- **Task 3:** Frontend/UI-UX layer audit.
- **Task 4:** Remaining DB integrity (triggers, functions, other tables' policies).
- **Housekeeping noted (not audited yet):** loose files in repo root look like
  they shouldn't be committed — `test-db.js`, `test-delete-api.js`,
  `supabase_backup_13_jul_2026.sql` (contains full DB dump!),
  `ubuntu@ubuntu-Latitude-7400varwwwva.txt`, `vpn_log`, `.env.example` deleted.
  Flag for review — a committed DB dump / logs in the repo is itself a risk.

---

## Files changed so far
- `lib/utils/security-guard.ts` — Issue #1 fix
- `app/api/reports/[id]/docx/route.ts` — Issue #2 fix
- `supabase/migrations/080_enable_rls_scan_tables.sql` — NEW (not applied)
