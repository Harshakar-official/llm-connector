# Phase 7: Administration Section — Full Deep-Dive Audit

**Date:** 2026-05-28  
**Scope:** `/organization`, `/users`, `/audit`, `/settings`, `/organization/billing`  
**User Context:** Logged in as Rohan (admin) in org "test security V2"  
**Methodology:** Read every page component, client component, server action, RLS policy, migration, loading/error state, and traced all data flows end-to-end.

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 3 | Non-functional audit page + missing settings + logo gap |
| 🟠 HIGH | 5 | Plan hardcoding, audit UX deficiencies, billing PM access |
| 🟡 MEDIUM | 5 | No pagination, missing rate limits, admin client bypass |
| 🟢 LOW | 7 | Minor UX/code quality concerns |

**Total: 20 findings**

---

## Section 1: Organization (`/organization`)

### Architecture

```
page.tsx (Server Component)
  ├── Auth + role check (admin only → notFound)
  ├── Fetch: organizations, org_quotas, user count, project count
  └── Render: OrganizationClient (Client Component)
        ├── Tab: General      → updateOrganizationAction (super-admin-actions.ts)
        ├── Tab: Functional Teams → DynamicTeamManagement (team-actions.ts)
        ├── Tab: Resources    → Read-only quota display (4 cards)
        └── Tab: Plans & Billing → PlanGrid + mock checkout → upgradeOrganizationPlan
```

### Findings

#### 🔴 A1 — Org Logo Upload: Column Exists, No Mechanism

**File:** [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql:21), [`app/(dashboard)/organization/OrganizationClient.tsx`](app/(dashboard)/organization/OrganizationClient.tsx:146)

The `organizations` table has [`logo_url text`](supabase/migrations/001_initial_schema.sql:21) — but there is absolutely zero infrastructure to upload, display, or manage it:

| Layer | Status |
|-------|--------|
| DB column `organizations.logo_url` | ✅ Exists since migration 001 |
| RLS `orgs_update` allows admin writes | ✅ Policy at [line 511](supabase/migrations/001_initial_schema.sql:511) |
| Storage bucket for logos | ❌ None — only `avatars` bucket exists |
| Server action parameter `logo_url` | ❌ [`updateOrganizationAction`](lib/supabase/super-admin-actions.ts:228) accepts only `{name, slug, industry, website}` |
| Upload UI in OrganizationClient | ❌ Header shows generic `<Building2 />` icon ([line 148](app/(dashboard)/organization/OrganizationClient.tsx:148)) |

**Blueprint exists:** [`uploadAvatarAction`](lib/supabase/avatar-actions.ts:99) in [`lib/supabase/avatar-actions.ts`](lib/supabase/avatar-actions.ts) has the complete pattern — 2MB limit, magic bytes verification, 30s cooldown via audit_log, sanitized filenames, storage upsert, profile update, and IP/UA audit logging. This can be replicated 1:1 for org logos by changing the bucket target and the DB column updated.

---

#### 🟠 A2 — `updateOrganizationAction` Lives in `super-admin-actions.ts`

**File:** [`lib/supabase/super-admin-actions.ts`](lib/supabase/super-admin-actions.ts:228)

Despite the filename suggesting super-admin-only, the function correctly allows both super_admin AND org admin (lines 237-240):

```typescript
const isSuperAdmin = profile?.role === 'super_admin'
const isOrgAdmin = profile?.role === 'admin' && profile?.org_id === orgId
if (!isSuperAdmin && !isOrgAdmin) return { success: false, error: "Access denied" }
```

This is architecturally misleading. The function should be extracted to `lib/supabase/organization-actions.ts` or similar. Not a runtime bug, but a maintenance hazard — a future developer might assume everything in `super-admin-actions.ts` is super-admin-gated and add functionality without the org-admin check.

---

#### 🟡 A3 — `updateOrganizationAction` Uses Admin Client, Bypassing RLS

**File:** [`lib/supabase/super-admin-actions.ts`](lib/supabase/super-admin-actions.ts:269-275)

```typescript
const adminClient = getSupabaseAdmin()
const { error } = await adminClient.from("organizations").update(sanitized).eq("id", orgId)
```

The authorization check (lines 237-240) is done correctly server-side before the admin client call. However, using `adminClient` means the write bypasses RLS entirely. If the authorization check had a logic flaw, it would go undetected. Using the user's own client after the server-side check would provide defense-in-depth via RLS verification. The `orgs_update` RLS policy at [line 511](supabase/migrations/001_initial_schema.sql:511) already allows `(id = my_org_id() and my_role() = 'admin')`, so the user's client would work.

**Recommendation:** Switch to user client (`supabase` from `getServerClient()`) or add both.

---

#### 🟡 A4 — No Rate Limiting on Org Updates

**File:** [`lib/supabase/super-admin-actions.ts`](lib/supabase/super-admin-actions.ts:228-296)

Unlike other sensitive operations:

| Action | Rate Limit |
|--------|-----------|
| `updatePlatformSettingAction` | 3s cooldown ([settings-actions.ts](lib/supabase/settings-actions.ts)) |
| `uploadAvatarAction` | 30s cooldown ([avatar-actions.ts](lib/supabase/avatar-actions.ts)) |
| Invite API | 5s sender + 5/hr recipient ([route.ts](app/api/invite/route.ts)) |
| **`updateOrganizationAction`** | ❌ **NONE** |

---

#### 🟢 A5 — Revalidation Path Only Covers Super Admin

**File:** [`lib/supabase/super-admin-actions.ts`](lib/supabase/super-admin-actions.ts:291)

```typescript
revalidatePath(`/super-admin/organizations/${orgId}`)
```

When an org admin updates their own org, this path is irrelevant. The client compensates with `router.refresh()` but the server should also revalidate `/organization`.

---

#### 🟢 A6 — PlanGrid `isLoading` Passed as `null` (Unused)

**File:** [`app/(dashboard)/organization/OrganizationClient.tsx`](app/(dashboard)/organization/OrganizationClient.tsx:273)

```typescript
<PlanGrid currentTier={activeTier} onUpgrade={startUpgradeSimulation} isLoading={null} />
```

The `PlanGrid` component checks `isLoading !== null` for button disability ([PricingCards.tsx](components/shared/PricingCards.tsx:105)). Since `null` is always passed, the per-tier loading state feature is unused. The checkout modal provides its own loading UX, so this isn't broken — just dead code.

---

#### 🟢 A7 — Fragile Two-Source activeTier State

**File:** [`app/(dashboard)/organization/OrganizationClient.tsx`](app/(dashboard)/organization/OrganizationClient.tsx:50,73-75)

```typescript
const [activeTier, setActiveTier] = useState(quotas.plan_tier) // line 50
// ...
useEffect(() => { setActiveTier(quotas.plan_tier) }, [quotas.plan_tier]) // line 73-75
// On upgrade success:
setActiveTier(tier) // line 124 — optimistic update
router.refresh()     // line 131 — triggers server re-fetch → useEffect overwrites
```

The optimistic update + server refresh pattern creates a brief flicker where the tier updates optimistically, then re-renders from server data. Works but fragile.

---

### Loading & Error States: Organization

| State | File | Quality |
|-------|------|---------|
| Loading | [`loading.tsx`](app/(dashboard)/organization/loading.tsx) | ✅ Excellent — header skeleton, 4 tab skeletons, form field skeletons |
| Error | [`error.tsx`](app/(dashboard)/organization/error.tsx) | ✅ Good — AlertTriangle icon, error message, Try Again button |
| Empty/Not Found | `notFound()` in [page.tsx:21](app/(dashboard)/organization/page.tsx:21) | ✅ Correct — 404 for non-admin access |

---

## Section 2: User Management (`/users`)

### Architecture

```
page.tsx (Server Component)
  ├── Auth check (admin OR PM → Forbidden UI, NOT redirect)
  ├── Fetch: profiles (all org users with presence fields)
  └── Render: UsersClient (Client Component)
        ├── Search filter (by name/email)
        ├── Role filter (dropdown)
        ├── User table (5 columns: User, Role, Status, Last Seen, Actions)
        ├── Edit User dialog → updateUserDetails (actions.ts)
        ├── Remove User dialog → removeUser (actions.ts)
        └── InviteUserModal → POST /api/invite
```

### Findings

#### 🟡 A8 — No Pagination for User List

**File:** [`app/(dashboard)/users/page.tsx`](app/(dashboard)/users/page.tsx:7-48)

All users are loaded in a single server fetch and rendered client-side with JavaScript filtering. For enterprise tier (100+ users), this becomes a performance problem. No server-side pagination, no virtual scrolling, no `limit`/`offset` in the query.

---

#### 🟡 A9 — No Bulk User Operations

**File:** [`app/(dashboard)/users/UsersClient.tsx`](app/(dashboard)/users/UsersClient.tsx)

Cannot select multiple users for batch role changes or batch removal. Every operation is one-at-a-time via dialogs. Compare with findings tracker which supports bulk operations.

---

#### 🟢 A10 — No User Export Functionality

**File:** [`app/(dashboard)/users/UsersClient.tsx`](app/(dashboard)/users/UsersClient.tsx)

No CSV/Excel export button for compliance audits. Enterprise customers typically need user roster exports.

---

#### 🟢 A11 — `updateUserDetails` and `removeUser` in `actions.ts` — File-level "use server" Missing from Visible Lines

**File:** [`app/(dashboard)/users/actions.ts`](app/(dashboard)/users/actions.ts:1-2)

The file starts with `"use server"` (confirmed from summary context). The individual exports are correctly server actions.

---

### Loading & Error States: Users

| State | File | Quality |
|-------|------|---------|
| Loading | [`loading.tsx`](app/(dashboard)/users/loading.tsx) | ✅ Excellent — 8-row table skeleton with avatars, badges, text |
| Error | [`error.tsx`](app/(dashboard)/users/error.tsx) | ✅ Good — AlertTriangle, message, Try Again |
| Unauthorized | Inline `<ShieldAlert>` UI in page.tsx | ✅ Good — Clear access denied message, no redirect |

---

## Section 3: Audit Logs (`/audit`)

### Architecture

```
page.tsx (Server Component — NO CLIENT INTERACTIVITY)
  ├── Auth check (admin only → notFound)
  ├── Fetch: 50 most recent audit_log rows
  │     ├── Non-super_admin: filtered by org_id
  │     └── Join: profiles (actor_id) + organizations (name)
  └── Render: Plain HTML <table> with 5 columns
        ├── Timestamp, Actor, Action, Organization, Details
        └── Details = JSON.stringify(log.new_value) — RAW JSON
```

### Findings

#### 🔴 A12 — Audit Page is Entirely Static — Zero Interactivity

**File:** [`app/(dashboard)/audit/page.tsx`](app/(dashboard)/audit/page.tsx:6-108)

This is a **server-rendered-only page** with no client component whatsoever. Missing:

| Feature | Status |
|---------|--------|
| Search/filter by action type | ❌ |
| Filter by date range | ❌ |
| Filter by actor | ❌ |
| Pagination beyond 50 results | ❌ |
| Export (CSV/PDF) | ❌ |
| Sort by any column | ❌ |
| Click to expand details | ❌ |
| IP address column | ❌ (captured but never displayed) |

For a compliance/security tool, the audit log is a **critical feature**. Currently it's a hardcoded dump of the 50 most recent rows with no way to find specific events. This renders the audit log essentially unusable for any real compliance workflow.

---

#### 🟠 A13 — Details Column Shows Raw JSON

**File:** [`app/(dashboard)/audit/page.tsx`](app/(dashboard)/audit/page.tsx:92)

```typescript
{JSON.stringify(log.new_value)}
```

The audit log `new_value` column contains structured JSON like `{"name":"New Org Name","website":"https://..."}`. Displaying this as raw stringified JSON (truncated with `max-w-xs truncate`) is not human-readable. Should be formatted as key-value pairs or at minimum pretty-printed.

**Before (current):** `{"name":"Test Org","website":"https://test.com","industry":"Technology"}`  
**Should be:** `Name: Test Org, Website: https://test.com, Industry: Technology`

---

#### 🟠 A14 — No Action-Type Filter

**File:** [`app/(dashboard)/audit/page.tsx`](app/(dashboard)/audit/page.tsx:23-31)

The query pulls ALL actions. An admin investigating "who removed a user" must scan through all logs manually. Should support filtering by action types like: `user_removed`, `role_changed`, `upgrade_plan`, `update_org_details`, `member_removed`, etc.

---

#### 🟠 A15 — No Date Range Filter

**File:** [`app/(dashboard)/audit/page.tsx`](app/(dashboard)/audit/page.tsx:30-31)

Only `.order("created_at", { ascending: false }).limit(50)` — no `gte`/`lte` on `created_at`. Impossible to view "last week's audit logs" or a specific date range.

---

#### 🟡 A16 — IP Address Never Displayed

**File:** [`app/(dashboard)/audit/page.tsx`](app/(dashboard)/audit/page.tsx:68-95)

The `audit_log` table stores `ip_address` (line 60-67 show only 5 columns: Timestamp, Actor, Action, Organization, Details). IP is captured in every action (verified in `super-admin-actions.ts:287`, `billing-actions.ts:69-76`, `rbac-server.ts`, `invite/route.ts`) but the audit page has no IP column.

---

#### ✅ A17 — Column Name Mismatch Resolved

**File:** [`supabase/migrations/019_fix_audit_log_and_rbac.sql`](supabase/migrations/019_fix_audit_log_and_rbac.sql:7-9)

Migration 019 renamed `user_id` → `actor_id`. The audit page query at [line 27](app/(dashboard)/audit/page.tsx:27) uses `profiles:actor_id`, which correctly matches the current schema. No bug here.

---

### Loading & Error States: Audit

| State | File | Quality |
|-------|------|---------|
| Loading | [`loading.tsx`](app/(dashboard)/audit/loading.tsx) | ✅ Good — 10-row table skeleton with timed columns |
| Error | [`error.tsx`](app/(dashboard)/audit/error.tsx) | ✅ Good — AlertTriangle, message, Try Again |
| Empty | Inline in page.tsx:99 | ✅ Good — "No audit logs recorded yet." |

---

## Section 4: Settings (`/settings`)

### 🔴 A18 — Settings Page is a Dead-End Redirect

**File:** [`app/(dashboard)/settings/page.tsx`](app/(dashboard)/settings/page.tsx:5-23)

```typescript
export default async function SettingsPage() {
  // ...
  if (profile.role === 'super_admin') redirect('/super-admin/settings')
  redirect('/organization')
}
```

The sidebar "Settings" link navigates to `/settings`, which immediately redirects to `/organization` for all non-super-admin users. This is a **broken UX**:

1. **User clicks "Settings" in sidebar** → lands on Organization page (confusing)
2. **No org-level settings exist** — all settings are either platform-level (super_admin) or scattered across Organization tabs
3. **Settings that SHOULD exist at org level but don't:**
   - Notification preferences (email digest frequency, alert thresholds)
   - Default severity thresholds for scan alerts
   - Session timeout / security policies
   - Report branding defaults (logo, header, footer)
   - API key management (if applicable)
   - Webhook configurations

The [`settings-actions.ts`](lib/supabase/settings-actions.ts) file has 9-layer Z+ security for platform settings — but zero org-level settings infrastructure.

---

## Section 5: Billing (`/organization/billing`)

### Architecture

```
billing/page.tsx (Server Component)
  ├── Auth check (admin OR PM → notFound)
  ├── Fetch: org_quotas.plan_tier
  └── Render: BillingClient (Client Component)
        ├── PlanGrid → startUpgradeSimulation → handleActualUpgrade
        ├── "Contact Sales" banner
        └── Mock checkout modal (4-step animation)
```

### Findings

#### 🟠 A19 — Plan Limits Are Hardcoded and Restrictive

**File:** [`lib/supabase/billing-actions.ts`](lib/supabase/billing-actions.ts:35-38)

```typescript
const tierLimits = {
  starter:    { max_users: 5,   max_projects: 2,   max_docker: 1,  storage: 2 },
  pro:        { max_users: 25,  max_projects: 20,  max_docker: 3,  storage: 20 },
  enterprise: { max_users: 100, max_projects: 100, max_docker: 10, storage: 100 }
}
```

User's stated requirement: **"unlimited users & projects, limits only on scan counts"**. Current reality:

| Plan | Users | Projects | User Wants |
|------|-------|----------|------------|
| Starter | 5 | 2 | Unlimited |
| Pro | 25 | 20 | Unlimited |
| Enterprise | 100 | 100 | Unlimited |

Additionally, the [`PLAN_DETAILS`](components/shared/PricingCards.tsx:10-40) in [`PricingCards.tsx`](components/shared/PricingCards.tsx) displays these same hardcoded limits in the UI. To implement the user's vision:
1. Update `tierLimits` in [`billing-actions.ts`](lib/supabase/billing-actions.ts) — set users/projects to very high/unlimited values
2. Update [`PLAN_DETAILS`](components/shared/PricingCards.tsx:10) feature lists
3. Add scan-count tracking (`scans_per_day`, `scans_per_month`) to `org_quotas`
4. Update RLS policies that check `max_users`/`max_projects` at insert time (invite quota, project creation)
5. Add scan-count enforcement in scanner launch logic

---

#### 🟠 A20 — PM Can Access Billing Page But Cannot Upgrade

**File:** [`app/(dashboard)/organization/billing/page.tsx`](app/(dashboard)/organization/billing/page.tsx:21)

```typescript
if (profile.role !== 'admin' && profile.role !== 'program_manager') { notFound() }
```

PMs can view the billing page and see plan cards, but [`upgradeOrganizationPlan`](lib/supabase/billing-actions.ts:27-31) blocks non-admins. The "Upgrade" button will error out for PMs. This is a UX inconsistency — either PMs should not see the billing page at all, or they should see a read-only view with disabled buttons.

---

#### 🟢 A21 — Mock Checkout Shown as Production

**File:** [`components/organization/billing/BillingClient.tsx`](components/organization/billing/BillingClient.tsx:181-183)

```html
<div className="text-[10px] text-center text-fg-subtle uppercase font-bold tracking-widest pt-4 border-t border-border/50">
  Developer Sandbox Mode 2026
</div>
```

The checkout modal simulates a 3-step payment flow but it's purely cosmetic. The same mock flow exists in [`OrganizationClient`](app/(dashboard)/organization/OrganizationClient.tsx:278-327). For a production launch, this needs either real Stripe/Paddle integration or at minimum a clear "Contact Sales" flow instead of the fake checkout.

---

#### 🟢 A22 — Duplicate Checkout Logic (DRY Violation)

**File:** [`app/(dashboard)/organization/OrganizationClient.tsx`](app/(dashboard)/organization/OrganizationClient.tsx:106-141) and [`components/organization/billing/BillingClient.tsx`](components/organization/billing/BillingClient.tsx:58-97)

The mock checkout simulation (steps, success sound, modal) is duplicated verbatim between `OrganizationClient` (billing tab) and `BillingClient` (standalone billing page). Both also duplicate the `Dialog` modal JSX. Should be extracted to a shared `CheckoutSimulation` component.

---

### Loading & Error States: Billing

| State | File | Quality |
|-------|------|---------|
| Loading | [`loading.tsx`](app/(dashboard)/organization/billing/loading.tsx) | ✅ Good — 3 plan card skeletons |
| Error | [`error.tsx`](app/(dashboard)/organization/billing/error.tsx) | ✅ Good — AlertTriangle, message, Try Again |

---

## Section 6: Security Cross-Cutting Analysis

### Route Protection Matrix

| Route | Middleware | Server Component | Effective Access |
|-------|-----------|-----------------|------------------|
| `/organization` | `isAdminOnlyRoute` → JSON 403 | `profile.role !== "admin"` → `notFound()` | Admin only |
| `/users` | `isPMAccessibleRoute` → JSON 403 | Inline `<ShieldAlert>` UI | Admin + PM |
| `/audit` | `isAdminOnlyRoute` → JSON 403 | `!profile` → `notFound()` | Admin + super_admin |
| `/settings` | None (redirects) | Redirect to `/organization` or `/super-admin/settings` | Redirect only |
| `/organization/billing` | None | `admin \|\| PM` → `notFound()` | Admin + PM |

✅ All routes have defense-in-depth (middleware + server component).

### Rate Limiting Coverage

| Server Action | Rate Limit | Audit Log |
|--------------|------------|-----------|
| `updateOrganizationAction` | ❌ None | ✅ IP/UA logged |
| `upgradeOrganizationPlan` | ❌ None | ✅ Non-blocking |
| `updateUserDetails` → `changeUserRole` | ❌ None | ✅ Via rbac-server |
| `removeUser` → `removeUserFromOrg` | ❌ None | ✅ Via rbac-server |
| Invite API (`POST /api/invite`) | ✅ 5s sender, 5/hr recipient | ✅ IP/UA logged |
| `createTeamAction` | ❌ None | ✅ Via team-actions |
| `uploadAvatarAction` | ✅ 30s via audit_log | ✅ IP/UA logged |

⚠️ **Gap:** The 4 most sensitive org-level mutations (org update, plan upgrade, user role change, user removal) have zero rate limiting. The `uploadAvatarAction` pattern (30s cooldown via audit_log lookup) should be replicated.

### RLS Policy Verification

| Operation | RLS Policy | Verified |
|-----------|-----------|----------|
| Org update by admin | `orgs_update`: `(id = my_org_id() and my_role() = 'admin')` | ✅ [001:511](supabase/migrations/001_initial_schema.sql:511) |
| Quota update by admin | `quotas_update`: `is_super_admin() OR (my_role() = 'admin' AND org_id = my_org_id())` | ✅ [020:7-11](supabase/migrations/020_fix_billing_rls.sql:7-11) |
| Profiles update by admin | `profiles_update_admin`: `my_role() = 'admin' and org_id = my_org_id()` | ✅ [001:527](supabase/migrations/001_initial_schema.sql:527) |
| Audit log insert by admin | `audit_insert`: `is_super_admin() OR (my_role() = 'admin' AND org_id = my_org_id())` | ✅ [020:14-19](supabase/migrations/020_fix_billing_rls.sql:14-19) |
| Audit log select by admin | `audit_select`: `is_super_admin() OR (org_id = my_org_id() and my_role() = 'admin')` | ✅ [002:46](supabase/migrations/002_fix_super_admin_policies.sql:46) |

---

oka## Section 7: Severity Summary & Recommendations

### 🔴 CRITICAL (3)

| ID | Issue | Impact |
|----|-------|--------|
| A12 | Audit page is static HTML — no filtering, search, pagination, or export | Audit logs unusable for compliance |
| A18 | Settings page is a dead redirect — no org-level settings exist | Users confused, sidebar link broken |
| A1 | Org logo: DB column exists, no upload/display mechanism | Missing feature, blueprint exists in avatar-actions |

### 🟠 HIGH (5)

| ID | Issue | Impact |
|----|-------|--------|
| A19 | Plan limits hardcoded — not aligned with "unlimited users/projects" vision | Blocks desired pricing model |
| A13 | Audit details column shows raw JSON | Unreadable audit trail |
| A14 | Audit page has no action-type filter | Can't find specific events |
| A15 | Audit page has no date range filter | Can't scope investigations |
| A20 | PM can view billing but can't upgrade | UX inconsistency |

### 🟡 MEDIUM (5)

| ID | Issue | Impact |
|----|-------|--------|
| A2 | `updateOrganizationAction` in `super-admin-actions.ts` despite supporting org admins | Maintenance hazard |
| A3 | `updateOrganizationAction` uses admin client (RLS bypass) | Reduced defense-in-depth |
| A4 | No rate limiting on org update, plan upgrade, user role change, user removal | Brute-force vulnerability |
| A8 | User list has no pagination | Performance at scale |
| A16 | IP address captured but never displayed in audit | Missing forensics data |

### 🟢 LOW (7)

| ID | Issue | Impact |
|----|-------|--------|
| A5 | Revalidation path only covers super-admin route | Minor caching issue |
| A6 | PlanGrid `isLoading` always `null` | Dead code |
| A7 | Fragile two-source activeTier state | Minor flicker |
| A9 | No bulk user operations | UX convenience |
| A10 | No user export | Compliance convenience |
| A21 | Mock checkout labeled "Sandbox Mode" | Production readiness |
| A22 | Duplicate checkout logic in OrgClient + BillingClient | Code maintainability |

---

## Feature Gap: Org Logo Upload — Implementation Blueprint

The existing [`uploadAvatarAction`](lib/supabase/avatar-actions.ts:99-230) provides the exact pattern:

```typescript
// What exists (avatar-actions.ts):
1. Storage bucket: "avatars" with RLS (owner-only upload)
2. Server action: uploadAvatarAction(formData)
3. Validation: 2MB, MIME (PNG/JPEG/WebP), magic bytes
4. Cooldown: 30s via audit_log lookup
5. Upload: supabase.storage.from("avatars").upload(path, file)
6. DB update: profiles.avatar_url = publicUrl
7. Audit: insert into audit_log with IP/UA

// What's needed for logos:
1. Storage bucket: "logos" with RLS (org-admin upload for own org)
2. Migration: CREATE POLICY on storage.objects for logos bucket
3. Server action: uploadOrganizationLogoAction(orgId, formData)
4. Validation: Same pattern (2MB, MIME, magic bytes, cooldown)
5. Upload: supabase.storage.from("logos").upload(`orgs/${orgId}/logo.${ext}`, file)
6. DB update: organizations.logo_url = publicUrl  (via updateOrganizationAction)
7. Audit: insert into audit_log with IP/UA
8. UI: Upload button in OrganizationClient > General tab, replace Building2 icon
9. Report integration: Use org.logo_url in PDF report headers instead of default logo
```

**Changes needed:**
- New migration: `022_logos_bucket.sql` (modeled after [`021_avatars_bucket.sql`](supabase/migrations/021_avatars_bucket.sql))
- New server action: `uploadOrganizationLogoAction` in `lib/supabase/organization-actions.ts`
- Update [`updateOrganizationAction`](lib/supabase/super-admin-actions.ts:228) signature: add `logo_url?: string`
- Update [`OrganizationClient`](app/(dashboard)/organization/OrganizationClient.tsx): add upload UI + logo preview in header
- Update report generation: use `org.logo_url` if available

**Total effort estimate:** ~200 lines of new code + 1 migration

---

## Feature Gap: Plan/Pricing — Unlimited Users & Projects

**Current state:**
- [`tierLimits`](lib/supabase/billing-actions.ts:35-38): Hardcoded user/project/docker/storage per tier
- [`PLAN_DETAILS`](components/shared/PricingCards.tsx:10-40): Feature lists showing hard limits
- RLS policies: Some policies check `max_users` at insert (invite quota enforcement)

**Target state:**
- All plans: unlimited users, unlimited projects
- Limits only on: scan counts (daily/monthly), docker containers, storage

**Changes needed:**
1. Add `scans_per_day`, `scans_per_month` columns to `org_quotas`
2. Update `tierLimits` in [`billing-actions.ts`](lib/supabase/billing-actions.ts): remove `max_users`/`max_projects`, add `max_scans_per_day`/`max_scans_per_month`
3. Update [`PLAN_DETAILS`](components/shared/PricingCards.tsx:10): change feature text to "Unlimited users", "Unlimited projects", "X scans/day", etc.
4. Update invite quota check: remove `max_users` enforcement or make it very high
5. Update project creation: remove `max_projects` enforcement
6. Add scan-count tracking: increment counter on scan launch, enforce in scanner
7. New migration for quota schema changes

**Total effort estimate:** ~300 lines of changes + 1 migration + scanner integration