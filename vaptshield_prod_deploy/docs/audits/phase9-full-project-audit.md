# Phase 9: Full Project Deep-Dive Audit Report

**Excluding:** Scanner & Reporting components  
**Scope:** Auth, Notifications, Findings CRUD, Developer Role, Hooks, RBAC, Vercel Compatibility  
**Date:** 2026-06-02

---

## Executive Summary

This Phase 9 audit covers all 6 user roles (super_admin, admin, program_manager, security_engineer, guest, developer) across every non-scanner, non-reporting module in the codebase. The audit covers **Auth flow (6 pages)**, **Notification system**, **Findings CRUD + PoC + Remediation + Discussion**, **Developer Tracker**, **All 7 hooks**, **RBAC/permissions**, **Security guard**, and **Vercel compatibility**.

**Total Findings: 22**  
**Critical: 3 | High: 6 | Medium: 8 | Low: 5**

---

## 1. Findings Summary

### 🔴 CRITICAL (3)

| # | Title | File | Severity |
|---|-------|------|----------|
| C1 | Server-Side XSS Sanitization Disabled | [`app/api/findings/route.ts:127`](app/api/findings/route.ts:127) | CRITICAL |
| C2 | Status Enum Mismatch Between Client Form and Server API | [`app/api/findings/route.ts:87`](app/api/findings/route.ts:87) vs [`components/findings/FindingForm.tsx:118`](components/findings/FindingForm.tsx:118) | CRITICAL |
| C3 | Audit Log IP/UA Missing in 9 of 20+ Insertions | Multiple files | CRITICAL |

### 🟠 HIGH (6)

| # | Title | File | Severity |
|---|-------|------|----------|
| H1 | Auth: Missing `self_registration_enabled` Check in API Invite Endpoint | [`app/api/invite/route.ts`](app/api/invite/route.ts) | HIGH |
| H2 | Auth: Login Page `getSafeRedirect` Allows Protocol-Relative URLs | [`app/(auth)/login/page.tsx:60-69`](app/(auth)/login/page.tsx:60) | HIGH |
| H3 | Notifications: Settings Tab Toggles Are Non-Functional Placeholders | [`app/(dashboard)/settings/SettingsClient.tsx:196-199`](app/(dashboard)/settings/SettingsClient.tsx:196) | HIGH |
| H4 | Hooks: `useRole` Never Re-fetches on Auth State Change | [`lib/hooks/useRole.ts:12-43`](lib/hooks/useRole.ts:12) | HIGH |
| H5 | Profile: "Change Avatar" Button Has No Click Handler | [`app/(dashboard)/profile/page.tsx`](app/(dashboard)/profile/page.tsx) | HIGH |
| H6 | `useRealtimeConnection` Is Deprecated Dead Code Still Exported | [`lib/hooks/useRealtimeConnection.ts:1-151`](lib/hooks/useRealtimeConnection.ts:1) | HIGH |

### 🟡 MEDIUM (8)

| # | Title | File | Severity |
|---|-------|------|----------|
| M1 | Auth: `forgot-password` API Route Has No Rate Limiting | [`app/api/auth/forgot-password/route.ts`](app/api/auth/forgot-password/route.ts) | MEDIUM |
| M2 | Findings: `FindingDetailClient` Is 787 Lines — Too Large | [`app/(dashboard)/findings/[id]/FindingDetailClient.tsx`](app/(dashboard)/findings/[id]/FindingDetailClient.tsx) | MEDIUM |
| M3 | Findings: `DiscussionThread` Opens New Realtime Channel Per Finding | [`components/findings/DiscussionThread.tsx:81`](components/findings/DiscussionThread.tsx:81) | MEDIUM |
| M4 | Tracker: `router.refresh()` on Realtime Overhead | [`components/tracker/TrackerGrid.tsx:131-143`](components/tracker/TrackerGrid.tsx:131) | MEDIUM |
| M5 | `usePresence` Sends Both `updateOffline()` and `sendBeacon` on Tab Close | [`lib/hooks/usePresence.ts:85-105`](lib/hooks/usePresence.ts:85) | MEDIUM |
| M6 | `useAuth` Fetches Organization on Every Auth State Change | [`lib/hooks/useAuth.ts:72-81`](lib/hooks/useAuth.ts:72) | MEDIUM |
| M7 | Platform Settings Enforcement Is Incomplete | [`lib/utils/platform-settings.ts`](lib/utils/platform-settings.ts) | MEDIUM |
| M8 | Comment Rate Limiting Lacks Automatic Cleanup | [`app/(dashboard)/findings/comment-actions.ts:32-42`](app/(dashboard)/findings/comment-actions.ts:32) | MEDIUM |

### 🔵 LOW (5)

| # | Title | File | Severity |
|---|-------|------|----------|
| L1 | Notification Types Include `docker_quota_warning` / `docker_expired` — No Docker Infra | [`lib/supabase/notification-actions.ts:11`](lib/supabase/notification-actions.ts:11) | LOW |
| L2 | `useSharedPresence` Is Dead Code Exported from Deprecated Hook | [`lib/hooks/useRealtimeConnection.ts:132-151`](lib/hooks/useRealtimeConnection.ts:132) | LOW |
| L3 | Profile Page Has Conflicting `"use client"` + `export const dynamic = "force-dynamic"` | [`app/(dashboard)/profile/page.tsx:1-3`](app/(dashboard)/profile/page.tsx:1) | LOW |
| L4 | Topbar Notification Bell Uses `useNotifications()` Hook Which Opens Separate Realtime Channel | [`components/layout/Topbar.tsx`](components/layout/Topbar.tsx) | LOW |
| L5 | `TrackerGrid` Default Page Size Is 10, No Respect for URL Params | [`components/tracker/TrackerGrid.tsx:272-274`](components/tracker/TrackerGrid.tsx:272) | LOW |

---

## 2. Detailed Findings

### 🔴 CRITICAL #1: Server-Side XSS Sanitization Disabled

**File:** [`app/api/findings/route.ts:122-128`](app/api/findings/route.ts:122)

**Issue:** The `sanitizeFinding()` function is completely disabled — it returns the input data unchanged:

```typescript
// Line 124-128
const sanitizeFinding = (data: Record<string, any>) => {
    // TEMPORARY: Disabled server-side sanitization to fix Vercel ESM/CJS crash
    // Client-side sanitization remains active in FindingForm.tsx
    return data
}
```

**Risk:** A malicious user could bypass the client-side sanitization (in [`FindingForm.tsx`](components/findings/FindingForm.tsx:87-95)) by directly calling `/api/findings` via curl/fetch, injecting XSS payloads into `description`, `impact`, `proof_of_concept`, or `remediation` fields. The comment says "TEMPORARY" suggesting this was meant to be fixed. The `isomorphic-dompurify` import is commented out at line 8.

**Fix:** Install `isomorphic-dompurify` as a non-ESM dependency or use `jsdom` + `DOMPurify` in a server-compatible way. Alternatively, use a lightweight server-side sanitizer like `sanitize-html`.

---

### 🔴 CRITICAL #2: Status Enum Mismatch Between Client Form and Server API

**Files:**
- Client: [`components/findings/FindingForm.tsx:118`](components/findings/FindingForm.tsx:118) — accepts 8 statuses
- Server: [`app/api/findings/route.ts:87`](app/api/findings/route.ts:87) — accepts only 5 statuses

**Client status schema (8 values):**
```typescript
status: z.enum(["open", "reopened", "in_progress", "resolved", "verified", "closed", "accepted_risk", "false_positive"])
```

**Server `createSchema` (5 values):**
```typescript
status: z.enum(["open", "in_review", "resolved", "accepted_risk", "false_positive"])
```

**Impact:**
- The server accepts `in_review` but the client never uses it
- The client can send `reopened`, `in_progress`, `verified`, `closed` but the server would reject them with a 400 error
- The `bulkUpdateStatus` in [`findings/actions.ts:46`](app/(dashboard)/findings/actions.ts:46) uses the 8-status set — so updating via bulk works but creating via API would fail
- The `updateSchema` in the route inherits from `createSchema`, so PATCH also has the 5-status restriction

**Fix:** Align the server `createSchema` and `updateSchema` status enum to match the client: `["open", "reopened", "in_progress", "resolved", "verified", "closed", "accepted_risk", "false_positive"]`. Remove `in_review` or add it to the client.

---

### 🔴 CRITICAL #3: Audit Log IP/UA Missing in 9 of 20+ Insertions

**Root cause documented in previous session.** The dedicated [`logAudit()`](lib/utils/audit-server.ts:61-109) utility auto-captures IP/UA via `headers()` but was never adopted by:

| File | Function | Line |
|------|----------|------|
| [`projects/actions.ts`](app/(dashboard)/projects/actions.ts:271) | `updateProject` | 271 |
| [`projects/actions.ts`](app/(dashboard)/projects/actions.ts:365) | `archiveProject` | 365 |
| [`projects/actions.ts`](app/(dashboard)/projects/actions.ts:452) | `deleteProject` | 452 |
| [`findings/actions.ts`](app/(dashboard)/findings/actions.ts:261) | `remediateFinding` | 261 |
| [`findings/actions.ts`](app/(dashboard)/findings/actions.ts:429) | `bulkDeleteFindings` | 429 |
| [`findings/actions.ts`](app/(dashboard)/findings/actions.ts:492) | `deleteFinding` | 492 |
| [`findings/actions.ts`](app/(dashboard)/findings/actions.ts:569) | `deleteReport` | 569 |
| [`approval-actions.ts`](app/(dashboard)/findings/approval-actions.ts:91) | `approveScanFinding` | 91 |
| [`approval-actions.ts`](app/(dashboard)/findings/approval-actions.ts:132) | `rejectScanFinding` | 132 |

**Note:** The [`findings/route.ts`](app/api/findings/route.ts:314) POST/PATCH endpoints correctly use `logAudit()` — this is the only file that adopted the utility.

---

### 🟠 HIGH #1: Auth — Missing `self_registration_enabled` Check in API Invite Endpoint

**File:** [`app/api/invite/route.ts`](app/api/invite/route.ts)

**Issue:** The [register page](app/(auth)/register/page.tsx:17) now correctly enforces `self_registration_enabled` via `getPlatformSetting()`, but the [`/api/invite`](app/api/invite/route.ts) POST endpoint does NOT check this setting. This means:
- If `self_registration_enabled` is `false`, users can still be invited via the API
- Invited users can still register via the invite flow even when self-registration is disabled

**Fix:** Add a `getPlatformSetting("self_registration_enabled")` check in the invite creation endpoint.

---

### 🟠 HIGH #2: Auth — Login Page `getSafeRedirect` Allows Protocol-Relative URLs

**File:** [`app/(auth)/login/page.tsx:60-69`](app/(auth)/login/page.tsx:60)

```typescript
function getSafeRedirect(raw: string | null): string | null {
  if (!raw) return null
  // Block protocol-relative URLs
  if (raw.startsWith("//") || raw.includes("@")) return null
  // ...
}
```

**Issue:** The function blocks `//evil.com` but does NOT block `/\evil.com` (single slash followed by backslash). While `/\evil.com` is not a valid URL, certain browsers may interpret it differently. More importantly, the regex validation for `@` character is too broad — it blocks legitimate redirects containing `@` in the path.

**Fix:** Use `new URL(raw, "https://vaptshield.com")` and check that the hostname matches the expected domain.

---

### 🟠 HIGH #3: Notifications — Settings Tab Toggles Are Non-Functional Placeholders

**File:** [`app/(dashboard)/settings/SettingsClient.tsx:185-201`](app/(dashboard)/settings/SettingsClient.tsx:185)

```tsx
{[
  { title: "Critical Finding Alerts", desc: "..." },
  { title: "Report Generation Success", desc: "..." },
  { title: "Team Discussion Mentions", desc: "..." },
  { title: "Marketing & News", desc: "..." }
].map((item, i) => (
  <div key={i} className="flex items-center justify-between ...">
    <div className="space-y-0.5">
      <p className="text-sm font-bold text-fg">{item.title}</p>
      <p className="text-xs text-fg-muted">{item.desc}</p>
    </div>
    {/* Hardcoded toggle — always ON, never changes */}
    <div className="h-6 w-10 rounded-full bg-primary/20 border border-primary/30 flex items-center px-1">
      <div className="h-4 w-4 rounded-full bg-primary shadow-sm ml-auto" />
    </div>
  </div>
))}
```

**Issue:** All 4 notification toggles are hardcoded as "ON" with no state management, no `onClick` handlers, and no persistence. They serve zero functional purpose and are misleading to users.

**Fix:** Either implement actual toggle functionality with DB persistence (e.g., add `notification_preferences` JSONB column to `profiles`) or remove this tab entirely and redirect users to the profile page notification sound toggle.

---

### 🟠 HIGH #4: Hooks — `useRole` Never Re-fetches on Auth State Change

**File:** [`lib/hooks/useRole.ts:12-43`](lib/hooks/useRole.ts:12)

```typescript
useEffect(() => {
  async function fetchRole() {
    const supabase = getBrowserClient()
    const { data: { user } } = await supabase.auth.getUser()
    // ...fetches role once
  }
  fetchRole()
}, []) // ← Empty dependency array — only runs on mount!
```

**Issue:** Unlike [`useAuth`](lib/hooks/useAuth.ts:101-108) which listens to `onAuthStateChange` events, [`useRole`](lib/hooks/useRole.ts:12) fetches once on mount and never re-fetches. If a user's role is changed by an admin (which triggers a `role_changed` notification + forced logout), any component using `useRole` will have a stale role until the page is hard-reloaded.

**Compare with `useAuth`:**
```typescript
// useAuth.ts:101-108 — correctly listens to auth changes
const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
    fetchAuth()
  }
})
```

**Fix:** Add `onAuthStateChange` listener to `useRole`, or better yet, deprecate `useRole` in favor of `useAuth().profile?.role` which already has auth change listening.

---

### 🟠 HIGH #5: Profile — "Change Avatar" Button Has No Click Handler

**File:** [`app/(dashboard)/profile/page.tsx`](app/(dashboard)/profile/page.tsx)

The `"Change Avatar"` button at the profile page has no `onClick` handler and is not connected to the file input ref. It's a dead button that does nothing when clicked.

**Fix:** Connect the button to trigger the hidden file input's click event.

---

### 🟠 HIGH #6: `useRealtimeConnection` Is Deprecated Dead Code Still Exported

**File:** [`lib/hooks/useRealtimeConnection.ts:1-151`](lib/hooks/useRealtimeConnection.ts:1)

The file itself says:
```typescript
/**
 * @deprecated — This hook is dead code and has been superseded by per-hook
 * leader election (see useNotifications.ts and RealtimeProvider.tsx).
 * ...
 * This file is kept for reference only. Do NOT import or use in new code.
 */
```

Yet it exports `useRealtimeConnection` and `useSharedPresence` — both are dead code. The file is 151 lines of unused code that could accidentally be imported by a developer.

**Fix:** Remove the file entirely or move it to a `_archive/` directory.

---

### 🟡 MEDIUM #1: Auth — `forgot-password` API Route Has No Rate Limiting

**File:** [`app/api/auth/forgot-password/route.ts`](app/api/auth/forgot-password/route.ts)

**Issue:** Unlike the login page which has client-side rate limiting (5 attempts, 1-minute window) and server-side `incrementFailedLoginAttempts()`, the forgot-password API endpoint has no rate limiting. An attacker could:
- Enumerate valid email addresses by observing response timing
- Flood the endpoint causing email spam

**Fix:** Add rate limiting (e.g., 3 requests per email per 15 minutes) using a simple in-memory store or Supabase table.

---

### 🟡 MEDIUM #2: Findings — `FindingDetailClient` Is 787 Lines

**File:** [`app/(dashboard)/findings/[id]/FindingDetailClient.tsx`](app/(dashboard)/findings/[id]/FindingDetailClient.tsx) — 787 lines

**Issue:** This single client component handles: status transitions, assignee management, CVSS display, attachment viewing, finding editing, discussion thread, remediation form, PoC viewing, version history, and audit trail. It's a "god component" that's difficult to maintain and test.

**Fix:** Split into smaller focused components:
- `FindingHeader.tsx` — title, severity, status badge, CVSS score
- `FindingActions.tsx` — status transitions, assign, edit, delete
- `FindingTabs.tsx` — tab container (delegates to child components)
- Keep existing `DiscussionThread`, `RemediationForm`, `PoCViewer` as-is

---

### 🟡 MEDIUM #3: Findings — `DiscussionThread` Opens New Realtime Channel Per Finding

**File:** [`components/findings/DiscussionThread.tsx:80-158`](components/findings/DiscussionThread.tsx:80)

```typescript
channelRef.current = supabase.channel(`comments-${vulnId}`, {
    config: { presence: { key: currentUserId }, broadcast: { self: true } },
})
```

**Issue:** Each `DiscussionThread` instance opens a dedicated Supabase Realtime channel. If a user opens multiple finding detail pages in quick succession (e.g., via browser tabs), each one creates a new WebSocket channel. Supabase free tier has a limit of 20 concurrent channels.

**Fix:** Pool channels or use a single channel with a filter that matches multiple `vuln_id` values. Alternatively, use the `useLeaderElection` pattern to ensure only the visible tab maintains the channel.

---

### 🟡 MEDIUM #4: Tracker — `router.refresh()` on Realtime Overhead

**File:** [`components/tracker/TrackerGrid.tsx:131-143`](components/tracker/TrackerGrid.tsx:131)

```typescript
useEffect(() => {
  const supabase = getBrowserClient()
  const channel = supabase
    .channel('tracker-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vulnerabilities' }, () => {
      router.refresh() // ← Full page refresh on every vulnerability change
    })
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [router])
```

**Issue:** Every vulnerability change (INSERT, UPDATE, DELETE) triggers a full `router.refresh()` which refetches the entire page's server-side data. This is heavyweight — it causes a full RSC re-render. For the tracker, which is a client-side filtered table, it would be better to update local state or refetch only the specific data.

**Fix:** Use a more targeted approach — refetch only the tracker data via a client-side fetch, or use the Supabase realtime payload to update local state directly.

---

### 🟡 MEDIUM #5: `usePresence` Sends Both `updateOffline()` and `sendBeacon` on Tab Close

**File:** [`lib/hooks/usePresence.ts:85-105`](lib/hooks/usePresence.ts:85)

```typescript
const handleBeforeUnload = () => {
  sendOfflineBeacon()  // Sends beacon to /api/presence/offline
}
// ...
return () => {
  // ...
  updateOffline()  // Also updates presence via Supabase client
}
```

**Issue:** On tab close, both `sendBeacon` (fire-and-forget) and `updateOffline()` (Supabase client) fire. `updateOffline()` in the cleanup function may not complete because the page is already unloading. This is a race condition — the intent is correct (belt-and-suspenders) but the `updateOffline()` call in cleanup is unreliable.

**Fix:** Keep only the `sendBeacon` approach in `beforeunload`/`pagehide` handlers. Remove `updateOffline()` from the cleanup return — it won't reliably execute during tab close anyway.

---

### 🟡 MEDIUM #6: `useAuth` Fetches Organization on Every Auth State Change

**File:** [`lib/hooks/useAuth.ts:72-81`](lib/hooks/useAuth.ts:72)

```typescript
if (profile?.org_id) {
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.org_id)
    .single()
  organization = org
}
```

**Issue:** The organization is fetched on every auth state change (SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED). Organization data rarely changes. This adds unnecessary latency to token refresh events which happen every ~60 minutes.

**Fix:** Cache the organization data in a ref and only re-fetch on explicit `SIGNED_IN` or manual `refetch` calls. Use a TTL or a custom event for org updates.

---

### 🟡 MEDIUM #7: Platform Settings Enforcement Is Incomplete

**File:** [`lib/utils/platform-settings.ts`](lib/utils/platform-settings.ts)

**Issue:** The `getPlatformSetting()` utility exists and is used by the registration page, but critical platform settings are NOT enforced at key points:

| Setting | Enforced? | Location |
|---------|-----------|----------|
| `self_registration_enabled` | ✅ Yes | [`register/page.tsx:17`](app/(auth)/register/page.tsx:17) |
| `mfa_enforced` | ❌ No | Never checked |
| `max_failed_attempts` | ❌ No | Only read by settings UI, not enforced |
| `ai_features_enabled` | ❌ No | Never checked |
| `session_timeout_minutes` | ❌ No | Never checked |

**Fix:** Enforce `max_failed_attempts` in the login flow (already partially done via `incrementFailedLoginAttempts` but the configurable threshold is not read). Enforce `ai_features_enabled` in all AI API routes. Enforce `session_timeout_minutes` in middleware.

---

### 🟡 MEDIUM #8: Comment Rate Limiting Lacks Automatic Cleanup

**File:** [`app/(dashboard)/findings/comment-actions.ts:32-42`](app/(dashboard)/findings/comment-actions.ts:32)

```typescript
const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
const { count: recentComments } = await supabase
    .from("vuln_comments")
    .select("*", { count: 'exact', head: true })
    .eq("author_id", user.id)
    .gte("created_at", oneMinuteAgo)
```

**Issue:** The rate limiting uses a live query against `vuln_comments` which is fine for correctness but adds a DB query on every comment attempt. Over time, the `vuln_comments` table grows unbounded. There's no cleanup mechanism for old comments.

**Fix:** The approach is acceptable for now since it's a count query with `head: true`. For long-term scaling, consider using a Redis-style rate limiter or a dedicated `rate_limits` table with TTL.

---

### 🔵 LOW #1: Notification Types Include Docker-Related Values

**File:** [`lib/supabase/notification-actions.ts:11`](lib/supabase/notification-actions.ts:11)

```typescript
type: 'scan_complete' | 'finding_critical' | 'finding_approved' | 'report_ready' | 
      'invite_received' | 'role_changed' | 'member_assigned' | 'system' | 
      'docker_quota_warning' | 'docker_expired' | 'finding_resolved' | 
      'finding_reopened' | 'finding_assigned'
```

**Issue:** `docker_quota_warning` and `docker_expired` types exist but there's no Docker infrastructure in the project. These are dead notification types.

**Fix:** Remove or comment out unused types until Docker features are implemented.

---

### 🔵 LOW #2: `useSharedPresence` Is Dead Code

**File:** [`lib/hooks/useRealtimeConnection.ts:132-151`](lib/hooks/useRealtimeConnection.ts:132)

The `useSharedPresence` hook is built on top of the already-deprecated `useRealtimeConnection`. It has no consumers in the codebase.

**Fix:** Remove along with `useRealtimeConnection`.

---

### 🔵 LOW #3: Profile Page Has Conflicting Directives

**File:** [`app/(dashboard)/profile/page.tsx:1-3`](app/(dashboard)/profile/page.tsx:1)

```typescript
"use client"
export const dynamic = "force-dynamic"
```

**Issue:** `export const dynamic = "force-dynamic"` is a server component directive but the file is marked `"use client"`. The `force-dynamic` export is ignored in client components. It's harmless but confusing.

**Fix:** Remove `export const dynamic = "force-dynamic"` from client components.

---

### 🔵 LOW #4: Topbar Notification Bell Uses Separate Realtime Channel

**File:** [`components/layout/Topbar.tsx`](components/layout/Topbar.tsx)

The Topbar uses `useNotifications()` which opens its own Supabase Realtime channel via the leader election pattern. This is architecturally correct but means the app has at least 2-3 separate Realtime channels (notifications, discussion, tracker). Each channel counts toward Supabase's concurrent channel limit.

**Fix:** This is acceptable for now but should be monitored. Consider channel pooling if more realtime features are added.

---

### 🔵 LOW #5: `TrackerGrid` Default Page Size Is 10, No Respect for URL Params

**File:** [`components/tracker/TrackerGrid.tsx:272-274`](components/tracker/TrackerGrid.tsx:272)

```typescript
initialState: {
  pagination: { pageSize: 10 }
}
```

**Issue:** Unlike `FindingsClient` which reads `limit` from URL params, the `TrackerGrid` hardcodes page size to 10 with no URL persistence. Users can't share filtered/paginated tracker views.

**Fix:** Add URL param support for page size and current page, matching the `FindingsClient` pattern.

---

## 3. What's Working Well

The following components are solid, well-architected, and require no changes:

1. **Auth Flow** — Login, register, OTP verification, password reset, and invite flow are comprehensive with proper security:
   - HttpOnly cookie for invite tokens
   - Open redirect protection
   - Rate limiting on login
   - Server-side `failed_login_attempts` tracking
   - Password strength checker with visual gauge
   - `self_registration_enabled` gate (recently fixed)

2. **Notification System** — Enterprise-grade realtime design:
   - Leader election prevents duplicate WebSocket connections
   - 15-second polling safety net
   - BroadcastChannel for cross-tab sync
   - Force logout on `role_changed` notification
   - Toast notifications with "View" action
   - Sound playback support

3. **Findings API** — Well-secured CRUD:
   - Zod validation on all inputs
   - CVSS integrity enforcement (server-side recalculation)
   - NVD CVE validation
   - Optimistic locking (version check, 409 conflict)
   - Project access guard
   - Proper audit logging (POST/PATCH use `logAudit()`)
   - Whitelist-based sort column protection
   - MIME type whitelist for attachments

4. **RBAC System** — Clean and maintainable:
   - Centralized permission matrix in [`permissions.ts`](lib/utils/permissions.ts:76-130)
   - Server-side enforcement via [`rbac-server.ts`](lib/utils/rbac-server.ts)
   - `security-guard.ts` for session validation and project access
   - `canInviteRole`, `canChangeRole` for hierarchical role management

5. **Security Guard** — Comprehensive:
   - `getSafeSession()` verifies user, profile, org, and org active status
   - `verifyProjectAccess()` checks project membership + creator fallback
   - `getAllowedProjectIds()` for role-based project filtering
   - `scopeToOrg()` utility for query scoping

6. **Discussion Thread** — Excellent UX:
   - Optimistic updates with rollback
   - Realtime sync via Supabase channel + BroadcastChannel
   - Typing indicators via Presence
   - 2-minute edit/delete window
   - Auto-scroll to bottom
   - Cmd/Ctrl+Enter quick send

7. **CVSS Calculator** — Robust:
   - CVSS 4.0 official calculation
   - Auto-sync severity from score
   - Server-side integrity enforcement

---

## 4. Vercel Compatibility Assessment

All components are Vercel-compatible with the following notes:

| Component | Status | Notes |
|-----------|--------|-------|
| `headers()` for IP/UA | ✅ Compatible | `x-forwarded-for` injected by Vercel's edge proxy |
| `logAudit()` | ✅ Compatible | Uses `headers()` correctly |
| Supabase Realtime | ✅ Compatible | WebSocket connections work on Vercel |
| Server Actions | ✅ Compatible | Next.js 15 native feature |
| `BroadcastChannel` | ✅ Compatible | Browser API, not server-side |
| `localStorage` | ✅ Compatible | Browser API, leader election |
| `sendBeacon` | ✅ Compatible | Browser API for presence |
| DOMPurify (client) | ✅ Compatible | Client-side only |
| `isomorphic-dompurify` | ❌ CRASH | Disabled due to ESM/CJS crash (see CRITICAL #1) |
| `force-dynamic` | ✅ Compatible | Standard Next.js |

---

## 5. Prioritized Action Plan

### Immediate (P0 — Fix Now)

1. **CRITICAL #1:** Re-enable server-side sanitization in [`route.ts`](app/api/findings/route.ts:127) — use `sanitize-html` or fix `isomorphic-dompurify` import
2. **CRITICAL #2:** Align status enums between client and server schemas
3. **CRITICAL #3:** Adopt `logAudit()` in all 9 broken audit insertions

### Short-Term (P1 — This Sprint)

4. **HIGH #1:** Add `self_registration_enabled` check to invite API endpoint
5. **HIGH #2:** Fix `getSafeRedirect` to use `new URL()` parsing
6. **HIGH #3:** Implement functional notification toggles or remove the tab
7. **HIGH #4:** Add auth state listener to `useRole` hook
8. **HIGH #5:** Wire up "Change Avatar" button to file input
9. **HIGH #6:** Remove `useRealtimeConnection` dead code

### Medium-Term (P2 — Next Sprint)

10. **MEDIUM #1:** Add rate limiting to forgot-password API
11. **MEDIUM #2:** Split `FindingDetailClient` into smaller components
12. **MEDIUM #3-8:** Address remaining medium issues

### Long-Term (P3 — Backlog)

13. **LOW #1-5:** Address low-priority items

---

## 6. Summary Statistics

| Severity | Count |
|----------|-------|
| 🔴 Critical | 3 |
| 🟠 High | 6 |
| 🟡 Medium | 8 |
| 🔵 Low | 5 |
| **Total** | **22** |

| Category | Count |
|----------|-------|
| Auth Flow | 3 |
| Notification System | 2 |
| Findings CRUD | 5 |
| Developer/Tracker | 2 |
| Hooks | 4 |
| RBAC/Security | 2 |
| Profile/Settings | 2 |
| Vercel Compatibility | 1 |
| Dead Code | 1 |




