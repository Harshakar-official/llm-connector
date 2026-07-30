# VaptShield — Full Codebase Audit Report
**Date:** 2026-07-20  
**Scope:** Security · Functional · Frontend↔Backend · UI/UX  
**Method:** Fresh codebase scan — no prior reports used as input

---

## SECURITY GAPS

### 🔴 CRITICAL

#### SEC-C1 — Committed DB dump contains 350+ secret-pattern hits
**File:** `supabase_backup_13_jul_2026.sql` (git-tracked, 2.8 MB)  
**Evidence:** `grep -icE "password|secret|api_key|token|postgres://"` → 356 matches. Full pg_dump committed to repo — contains hashed passwords, tokens, connection strings, and all org data.  
**Also committed:** `vpn_log` (1 hit), `test-delete-api.js` (1 hit), `ubuntu@ubuntu-Latitude-7400varwwwva.txt` (1 hit), `test-db.js`.  
**Fix:** `git rm` all five files, rotate any credentials found inside, add to `.gitignore`.

---

### 🟠 HIGH

#### SEC-H1 — Cross-tenant role change IDOR (RLS-bypass write path)
**File:** `app/(dashboard)/users/actions.ts:44–50`, `lib/utils/rbac-server.ts:111–118`  
**Evidence:** `updateUserDetails(targetUserId, data)` fetches target profile by `id` only — no `.eq("org_id", orgId)`. The write goes through `changeUserRole` → `getResilientClient` (service-role admin client, RLS bypassed) → updates `profiles` by `id` alone. An Org-A admin can pass an Org-B `userId` and change that user's role.

#### SEC-H2 — Cross-tenant member removal IDOR
**File:** `app/(dashboard)/users/actions.ts:100–152, 170–216`, `lib/utils/rbac-server.ts:196–203`  
**Evidence:** `removeUser` and `bulkRemoveUsers` fetch targets by `id`/`.in("id", targets)` with no `org_id` filter, then call `removeUserFromOrg` (admin client) which nulls `org_id` and sets `role='guest'`. An admin can remove arbitrary users from other orgs.

#### SEC-H3 — Unauthenticated account-lockout DoS + brute-force reset
**File:** `lib/supabase/actions.ts:182, 241`  
**Evidence:** `incrementFailedLoginAttempts(email)` — no auth, anyone can lock any account by email (5 calls → 15-min lockout). `resetFailedLoginAttempts(userId)` — no auth, anyone can zero out lockout for any user ID. Both use the service-role admin client.

#### SEC-H4 — All `/api/auth/me` callers ignore 429 → silent redirect/permission loss
**Files:** `hooks/useCicdScan.ts:230`, `app/(dashboard)/scanner/zap/page.tsx:390`, `scanner/history/page.tsx:131`, `scanner/terminal/page.tsx:301`  
**Evidence:** All four call `.then(r => r.json())` with no `r.ok` check. On 429, `d.profile` is `undefined` → `role = null`. In `useCicdScan`, `canManage` becomes `false` → `router.replace("/dashboard")`. User is silently kicked out of the scanner on a transient rate-limit hit.

#### SEC-H5 — Middleware performs zero auth on all `/api/**` routes
**File:** `middleware.ts:30–62`  
**Evidence:** `isApiRoute` branch returns after CORS + CSRF only — no session validation. Every API route relies solely on its own in-route auth check. Any route that omits `getSafeSession()` / `supabase.auth.getUser()` is completely unprotected.

---

### 🟡 MEDIUM

#### SEC-M1 — Team membership not org-scoped in server actions
**File:** `lib/supabase/team-actions.ts:54–62, 178–184, 226–270`  
**Evidence:** `createTeamAction`, `updateTeamAction`, `assignTeamToProjectAction` accept client-supplied `member_ids`/`teamId`/`projectId` with no check that they belong to `orgId`. Relies entirely on RLS being correct.

#### SEC-M2 — Multiple-admin invariant bypassable via `canChangeRole`
**File:** `lib/utils/permissions.ts:174–191`  
**Evidence:** `canChangeRole` allows admin→admin promotion (`return targetNewRole !== "super_admin"`) with no admin-count check. The single-admin guard in `invite-internal.ts` is bypassed by the role-change path.

#### SEC-M3 — Middleware cookie check is presence-only (expired sessions pass)
**File:** `middleware.ts:84–99`  
**Evidence:** Checks only that a cookie named `auth-token` or `sb-*` exists — does not validate value or expiry. An expired session reaches the dashboard page and only fails when the server component calls `getUser()`.

#### SEC-M4 — Server actions bypass middleware CSRF entirely
**File:** `middleware.ts:14–15`  
**Evidence:** `next-action` header → `return NextResponse.next()` — skips the CSRF check in the API branch. Server actions in `findings/actions.ts` etc. rely solely on `getSafeSession()` for auth; no middleware-layer CSRF applies.

#### SEC-M5 — `FindingForm.tsx` writes directly to `vulnerabilities` bypassing API
**File:** `app/(dashboard)/findings/FindingForm.tsx:433`  
**Evidence:** Browser Supabase client `.insert()`/`.update()` on `vulnerabilities` directly. The API route `/api/findings` applies: Zod validation, CVE NVD verification, rate limiting (10 req/min), project access guard, and audit logging. Direct client write skips all of these — no audit trail, no CVE validation.

#### SEC-M6 — Migrations 080/081/082 written but NOT applied
**Files:** `supabase/migrations/080_enable_rls_scan_tables.sql`, `081_performance_indexes_and_triggers.sql`, `082_rbac_role_guard_and_cascade.sql`  
**Evidence:** All three files exist and are well-written. 080 enables RLS on `zap_tasks`/`pending_alerts`/`processed_webhooks`. 082 adds admin self-escalation guard and FK cascades. None are applied — no migration runner configured in repo.

#### SEC-M7 — Raw `error.message` returned to clients (info leak)
**Files:** `app/api/scan-findings/[id]/route.ts:65`, `app/api/poc/upload/route.ts:111`  
**Evidence:** `return NextResponse.json({ error: err.message }, { status: 500 })` — exposes DB/internal/filesystem error strings to the browser.

---

### 🔵 LOW

#### SEC-L1 — `inviteOrgAdminAction` has no local auth check
**File:** `lib/supabase/super-admin-actions.ts:492`  
**Evidence:** No direct auth check; guarded only transitively via `processInvitation`. Safe currently but fragile.

#### SEC-L2 — `test-worker` debug route in production build
**File:** `app/api/test-worker/route.ts`  
**Evidence:** No callers in production code; should not be deployed.

---

## FUNCTIONAL GAPS

### 🟠 HIGH

#### FUNC-H1 — Two routes called by terminal UI don't exist (404 at runtime)
**File:** `app/(dashboard)/scanner/terminal/page.tsx:665, 876`  
**Evidence:**  
- `POST /api/scan-findings/${id}/enhance` — route missing  
- `POST /api/scan-findings/merge` — route missing  
Both fire in the Kali terminal findings flow and silently fail with a toast.

#### FUNC-H2 — `fix-stale` API skips Docker cleanup → permanent quota block
**File:** `app/api/scans/fix-stale/route.ts`  
**Evidence:** Marks `scan_history` rows as `'failed'` via Supabase client but never calls `releaseDockerSlot`, `killContainer`, or updates `docker_sessions`. `org_quotas.active_docker_containers` is never decremented → org permanently quota-blocked until `cleanupOrphanedContainers` runs. The correct implementation exists in `lib/docker/manager.ts:fixStaleRunningScans` but is not used here.

#### FUNC-H3 — `checkQuota` has a TOCTOU race (no transaction)
**File:** `lib/utils/quota-engine.ts`  
**Evidence:** Reads count → checks limit → returns `allowed: true` — no `FOR UPDATE`, no atomic increment. Two concurrent requests can both read `count = 4` against limit 5, both get `allowed: true`, both create → end at 6 against limit 5. (Docker quota in `lib/docker/quota.ts` correctly uses `BEGIN/FOR UPDATE/COMMIT` — that one is fine.)

---

### 🟡 MEDIUM

#### FUNC-M1 — 14 dead/unreachable API routes
Routes with zero callers in `app/`, `components/`, `hooks/`, `lib/`:

| Route | Notes |
|---|---|
| `app/api/kali/parse-text/route.ts` | Never wired to UI |
| `app/api/kali/scan/import/route.ts` | Import flow not wired |
| `app/api/kali/verify-finding/route.ts` | Not called anywhere |
| `app/api/onboarding/complete/route.ts` | Onboarding never triggered |
| `app/api/reports/draft/route.ts` | Draft save not called |
| `app/api/reports/[id]/docx/route.ts` | No download link calls it |
| `app/api/reports/[id]/history/route.ts` | Unused |
| `app/api/reports/[id]/status/route.ts` | Not wired |
| `app/api/findings/[id]/approve/route.ts` | Frontend uses `/api/scan-findings/${id}/approve` instead |
| `app/api/scan/zap/[id]/complete/route.ts` | Worker callback not configured |
| `app/api/scan/zap/[id]/webhook/route.ts` | Same |
| `app/api/terminal/force-cleanup/route.ts` | No UI trigger |
| `app/api/terminal/validate-command/route.ts` | No UI trigger |
| `app/api/test-worker/route.ts` | Debug route in prod |

#### FUNC-M2 — CI/CD has no heartbeat → orphaned containers survive 2 hours
**File:** `lib/docker/manager.ts`, `app/api/terminal/heartbeat/[id]/route.ts`  
**Evidence:** ZAP and Kali containers send heartbeats; CI/CD containers do not. `cleanupOrphanedContainers` uses `last_heartbeat < NOW() - 90s` — CI/CD sessions never update `last_heartbeat`, so dead containers only clean up at `max_lifetime_at` (2 hours).

#### FUNC-M3 — CI/CD spawn/trigger split creates orphan window
**File:** `lib/docker/manager.ts`  
**Evidence:** `spawnCicdSession` inserts a `docker_sessions` row in `'starting'` state but does NOT call the worker. If the process crashes between spawn and `triggerCicdScan`, the session is orphaned in `'starting'` indefinitely (no heartbeat → not caught by cleanup until 2-hour expiry).

#### FUNC-M4 — Routes without Zod/schema validation
No `.parse()`, `.safeParse()`, or `z.object` on request body:

`app/api/scan/zap/[id]/complete/route.ts`, `app/api/scan/zap/[id]/webhook/route.ts`, `app/api/reports/generate/route.ts`, `app/api/reports/[id]/route.ts`, `app/api/scan-findings/[id]/link-vuln/route.ts`, `app/api/invite/session/route.ts`, `app/api/findings/[id]/patch/route.ts`, `app/api/terminal/start/route.ts`, `app/api/terminal/validate-command/route.ts`

#### FUNC-M5 — `getActiveSessions` / `getSessionByContainerId` unhandled throws
**File:** `lib/docker/manager.ts`  
**Evidence:** Both functions call `pool.query` with no try/catch — failures propagate unhandled to callers.

---

### 🔵 LOW

#### FUNC-L1 — 43 `console.log` calls in server-side production paths
Notable: `app/api/findings/route.ts:278–317` (6 calls logging full request body + org access), `app/api/kali/scan/route.ts:278–497` (5 calls), `app/api/scan/zap/[id]/stream/route.ts` (4 calls logging org_id/scan_id).

#### FUNC-L2 — Zero tests exist
`package.json` has `"test": "playwright test"` but no `.spec.ts`, `.test.ts`, or `tests/` directory exists anywhere. `npm run test` fails immediately. `npx tsc --noEmit` → **0 errors** (TypeScript is clean).

#### FUNC-L3 — Client-side duplicate scan guard is tab-local
**File:** `hooks/useCicdScan.ts`  
**Evidence:** `sseConnectedRef.current && streamStatus === "running"` check is per-tab. Two tabs can both pass and submit two concurrent CI/CD scans consuming two quota slots.

---

## FRONTEND ↔ BACKEND CONTRACT GAPS

### 🟠 HIGH

#### FE-H1 — Same as SEC-H4 (429 on `/api/auth/me` → silent redirect)
See SEC-H4 above.

---

### 🟡 MEDIUM

#### FE-M1 — CICD `phase` SSE event sent but never consumed
**Files:** `app/api/scan/cicd/[id]/stream/route.ts:97`, `hooks/useCicdSse.ts`  
**Evidence:** Stream emits `sendEvent("phase", { phase: ... })`. `useCicdSse` registers listeners for `log`, `progress`, `new_finding`, `complete`, `failed`, `error` — no `addEventListener("phase", ...)`. Phase tracking works only via `__PHASE__:` prefix parsing in log lines; the dedicated `phase` event is dead code.

#### FE-M2 — Multiple fetch calls lack `res.ok` check
**File:** `hooks/useCicdScan.ts:156–189`  
**Evidence:** `fetchProjects` and `fetchConfigs` call `res.json()` without checking `res.ok`. A 401/403/500 response is valid JSON `{ error: "..." }` and won't throw — `data.configs` silently becomes `undefined`, leaving the list empty with no user feedback.

#### FE-M3 — `QuotaInfo` interface missing 3 fields the backend returns
**Files:** `hooks/useCicdScan.ts:17–22`, `app/api/cicd/quota/route.ts:48–56`  
**Evidence:** Interface declares 4 fields; backend returns 7 (also `active_docker_containers`, `max_docker_containers`, `paid_extra_docker`). TypeScript rejects access to the extra fields without a cast.

#### FE-M4 — ZAP cancelled scan displayed as "completed"
**Files:** `app/api/scan/zap/[id]/stream/route.ts:311–322`, `app/(dashboard)/scanner/zap/page.tsx:761–773`  
**Evidence:** Stream sends `sendEvent("complete", { status: "cancelled", ... })`. Page handler unconditionally calls `setStatus("completed")` without inspecting `d.status`.

---

### 🔵 LOW

#### FE-L1 — Direct Supabase-JS client writes bypass API validation
Tables written directly from browser components (dual-write paths that can drift from API logic):

| Table | Component | Bypasses |
|---|---|---|
| `vulnerabilities` | `FindingForm.tsx:433` | Zod, CVE check, rate limit, audit log |
| `poc-files` (storage) | `PocUploader.tsx:86,208,225` | `/api/poc/upload` validation |
| `organizations` | `OrganizationsClient.tsx:139,157` | No API equivalent |

#### FE-L2 — CICD post-complete findings fetch has no `res.ok` check
**File:** `hooks/useCicdSse.ts:290`  
**Evidence:** If the `/api/scan-findings/by-scan/${id}` fetch fails, `streamFindings` contains stripped objects (no `raw_data`) and AI Patch silently has no data to work with.

---

## UI/UX GAPS

### 🟠 HIGH

#### UX-H1 — No mobile sidebar / off-canvas nav
**Files:** `components/layout/Sidebar.tsx`, `app/(dashboard)/layout.tsx:85`  
**Evidence:** Sidebar renders a `sticky` fixed-width aside (`w-64`/`w-16`) always in-flow. Zero `md:hidden`/`Sheet`/`Drawer`/mobile-state. No hamburger button. On small screens it permanently consumes 256px with no collapse.

#### UX-H2 — Missing error boundaries on primary list and scanner pages
Pages with a `page.tsx` but no `error.tsx`:

| Page | Severity |
|---|---|
| `app/(dashboard)/findings/` (list root) | HIGH |
| `app/(dashboard)/reports/` | HIGH |
| `app/(dashboard)/scanner/zap/` | HIGH |
| `app/(dashboard)/scanner/cicd/` | HIGH |
| `app/(dashboard)/scanner/terminal/` | HIGH |

#### UX-H3 — Icon-only buttons without `aria-label` (20+ instances)
**Evidence:** Only 3 `aria-label` occurrences exist across the entire dashboard+components tree vs 20+ `size="icon"` buttons. Examples: `FindingsClient.tsx:548`, `UsersClient.tsx:432`, `OrganizationsClient.tsx:309`, `components/findings/FindingForm.tsx:863,1227`, `components/layout/Sidebar.tsx:181` (collapse toggle — raw `<button>` with chevron icon only).

---

### 🟡 MEDIUM

#### UX-M1 — Missing `loading.tsx` on scanner tool pages and key dashboard pages
Missing both `loading.tsx` and `error.tsx`: `settings/`, `notifications/`, `profile/`, `ai/`, `scanner/history/`, `super-admin/organizations/[id]/`. Missing `loading.tsx` only: `scanner/zap/`, `scanner/cicd/`, `scanner/terminal/`.

#### UX-M2 — Search inputs are placeholder-only (no accessible label)
**Files:** `reports/ReportsClient.tsx:40`, `scanner/history/page.tsx:335`, `projects/ProjectsClient.tsx:335`, `users/UsersClient.tsx:289`, `super-admin/*` search inputs.  
**Evidence:** Icon (magnifier) is decorative only; screen readers get no field name.

#### UX-M3 — `users/UsersClient.tsx` table not wrapped in `overflow-x-auto`
**Evidence:** Grep returned no `overflow-x-auto` match for the users table — potential horizontal overflow on mobile.

#### UX-M4 — Reset-password lacks live password-requirement checklist
**File:** `app/(auth)/reset-password/ResetPasswordClient.tsx`  
**Evidence:** Enforces the same zod rules as Register but does not render the live requirement checklist that `RegisterClient.tsx:292,319` shows — inconsistent UX between the two password-setting flows.

---

### 🔵 LOW

#### UX-L1 — Empty states lack call-to-action buttons
Reports and notifications empty states are text-only ("No reports found.") without an action button. Projects has a CTA; others don't.

#### UX-L2 — `VerifyOtp` uses a boolean `error` state with generic messaging
**File:** `app/(auth)/verify-otp/VerifyOtpClient.tsx:36`  
**Evidence:** Boolean `error` state renders a generic invalid state rather than specific messaging (expired vs wrong code).

---

## SUMMARY TABLE

| ID | Severity | Category | One-liner |
|---|---|---|---|
| SEC-C1 | 🔴 CRITICAL | Security | DB dump + sensitive files committed to git |
| SEC-H1 | 🟠 HIGH | Security | Cross-tenant role change IDOR via admin client |
| SEC-H2 | 🟠 HIGH | Security | Cross-tenant member removal IDOR |
| SEC-H3 | 🟠 HIGH | Security | Unauthenticated account lockout DoS + lockout reset |
| SEC-H4 | 🟠 HIGH | Security | 429 on /api/auth/me silently redirects user |
| SEC-H5 | 🟠 HIGH | Security | Middleware does zero auth on all /api/** routes |
| FUNC-H1 | 🟠 HIGH | Functional | 2 routes called by terminal UI don't exist (404) |
| FUNC-H2 | 🟠 HIGH | Functional | fix-stale skips Docker cleanup → permanent quota block |
| FUNC-H3 | 🟠 HIGH | Functional | checkQuota TOCTOU race — no transaction |
| UX-H1 | 🟠 HIGH | UI/UX | No mobile sidebar |
| UX-H2 | 🟠 HIGH | UI/UX | Missing error boundaries on findings/reports/scanner pages |
| UX-H3 | 🟠 HIGH | UI/UX | 20+ icon buttons without aria-label |
| SEC-M1 | 🟡 MEDIUM | Security | Team membership not org-scoped in server actions |
| SEC-M2 | 🟡 MEDIUM | Security | Multiple-admin invariant bypassable via canChangeRole |
| SEC-M3 | 🟡 MEDIUM | Security | Middleware cookie check is presence-only |
| SEC-M4 | 🟡 MEDIUM | Security | Server actions bypass middleware CSRF |
| SEC-M5 | 🟡 MEDIUM | Security | FindingForm writes directly to DB bypassing API |
| SEC-M6 | 🟡 MEDIUM | Security | Migrations 080/081/082 not applied |
| SEC-M7 | 🟡 MEDIUM | Security | Raw error.message returned to clients |
| FUNC-M1 | 🟡 MEDIUM | Functional | 14 dead/unreachable API routes |
| FUNC-M2 | 🟡 MEDIUM | Functional | CI/CD no heartbeat → orphaned containers for 2 hours |
| FUNC-M3 | 🟡 MEDIUM | Functional | CI/CD spawn/trigger split creates orphan window |
| FUNC-M4 | 🟡 MEDIUM | Functional | 9 routes without Zod validation |
| FUNC-M5 | 🟡 MEDIUM | Functional | getActiveSessions unhandled throws |
| FE-M1 | 🟡 MEDIUM | FE↔BE | CICD phase SSE event dead on client |
| FE-M2 | 🟡 MEDIUM | FE↔BE | fetchProjects/fetchConfigs no res.ok check |
| FE-M3 | 🟡 MEDIUM | FE↔BE | QuotaInfo interface missing 3 backend fields |
| FE-M4 | 🟡 MEDIUM | FE↔BE | Cancelled ZAP scan shown as "completed" |
| UX-M1 | 🟡 MEDIUM | UI/UX | Missing loading.tsx on scanner + key pages |
| UX-M2 | 🟡 MEDIUM | UI/UX | Search inputs no accessible label |
| UX-M3 | 🟡 MEDIUM | UI/UX | Users table not overflow-x-auto |
| UX-M4 | 🟡 MEDIUM | UI/UX | Reset-password lacks live password checklist |
| SEC-L1 | 🔵 LOW | Security | inviteOrgAdminAction no local auth check |
| SEC-L2 | 🔵 LOW | Security | test-worker debug route in prod |
| FUNC-L1 | 🔵 LOW | Functional | 43 console.log in server-side paths |
| FUNC-L2 | 🔵 LOW | Functional | Zero tests exist |
| FUNC-L3 | 🔵 LOW | Functional | Duplicate scan guard is tab-local only |
| FE-L1 | 🔵 LOW | FE↔BE | Direct Supabase client writes bypass API validation |
| FE-L2 | 🔵 LOW | FE↔BE | Post-complete findings fetch no res.ok check |
| UX-L1 | 🔵 LOW | UI/UX | Empty states lack CTA buttons |
| UX-L2 | 🔵 LOW | UI/UX | VerifyOtp generic error state |

---

## STRENGTHS (no action needed)

- `getSafeSession()` verifies profile from DB, blocks suspended orgs — solid auth foundation
- `processInvitation` / `acceptInvitationAction` — strong invite flow with email binding, org checks, rate limits, role allowlist
- `updateProfileAction` — correctly scoped to `auth.uid()`, cannot target other users
- `super-admin-actions.ts` — all actions re-check `super_admin` from DB before acting
- `lib/docker/quota.ts:acquireDockerSlot` — correct `BEGIN/FOR UPDATE/COMMIT` pattern
- Empty-state coverage across all list pages — good UX discipline
- Toast/error feedback discipline — generally consistent across dashboard clients
- Auth UX — login handles distinct error cases, register has live password strength + checklist
- `tsc --noEmit` → **0 errors** — TypeScript is clean
- Severity badges pair color with text — not color-only
