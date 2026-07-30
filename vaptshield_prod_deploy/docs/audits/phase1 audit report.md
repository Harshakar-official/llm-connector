already Fix all issues in phase 1 

okay jaies phase 1 or phase 2 ki testing kri thi hamne audit review in depth me vaise hi ab phase 3 ki audit krenge review krenge --> hi tumhe code me change nhi krna hai tumhe audit review throughly depth me check krna hai code logic sahi  implement hai ki nhi ya koi security gaps functional gaps ui/ux wiring ki problem End to End frontend backend fully connected real time me sab kuch connected, tumhe ek bari me sab kuch check nhi krna tumhe bas one by one step by step check krna hai jo me bolunga, tumhe code me change nhi krna code logic code ka flow or usko trace kro dekho ki sab kya kya working nhi hai phase 3 me abhi, vaise according to me phase 1 to phase 3,4 kafi had tak build with Z+ security ke sath implement hai check kro one by one step by step ye sare phase 3 ke features 


bhai tum ek bahut hi highly complex project codebase pr kaam kr rhe ho  ek single line of code delete remove krne pr pura project kharab ho skta hai mene tumse abhi phase 3 ko aduti review karvaya tha or hamne functional or security gaps findout kiye hai hame one by one step by step  fixes krne hai implement krne hai but koi bhi fix krne se phele code logic dekho code flow dekho usko trace kro uske baad problem ko depth me analyze kro fir fix kro  without break anything phase 3 ke feature ko fix krte time phase 1,2,4 ke features kharab nhi hone chahiye .env.local file me tumhe credentials mil jayenge ager need pade to use kr lena jo problem me tumhe bataunga tumhe sirf vahi fix krna hai okay

I've now traced the entire codebase for all 11 features. Let me present my Feature 1 audit findings first.

🔍 Feature 1: Register → OTP → Verify → Dashboard with Profile
Full Flow Trace:
Step	File	What Happens	Status
1	register/page.tsx:95	supabase.auth.signUp() with email, password, full_name in metadata	✅
2	Supabase	Sends OTP email automatically (Supabase built-in)	✅
3	register/page.tsx:122-126	Redirects to /verify-otp?email=...&invite=...	✅
4	verify-otp/page.tsx:60	supabase.auth.verifyOtp() with email + token	✅
5	verify-otp/page.tsx:78	If invite token → acceptInvitationAction()	✅
6	verify-otp/page.tsx:102	Redirect to /dashboard after 1.5s	✅
7	001_initial_schema.sql:391	DB trigger handle_new_user() creates profile with role='guest', org_id=null	✅
8	middleware.ts:40-51	Middleware checks profile exists, role, org active status	✅
9	dashboard/page.tsx:30-47	Dashboard loads, fetches profile, redirects super_admin	✅
✅ What Works:
Password validation (12+ chars, uppercase, number, special) with real-time strength meter
OTP input with paste support, keyboard navigation, shake animation on error
Resend cooldown (60s) with countdown timer
Email fallback via sessionStorage for tab refresh scenarios
Invitation acceptance integrated into OTP verification flow
Profile auto-created by DB trigger on signup (not on verify — correct)
Middleware blocks access if profile missing (profile_missing redirect)
⚠️ Issues Found:
1. [BUG] Rate limiter double-increment in login — login/page.tsx:99-100

incrementRateLimit()              // line 99 — increments but discards result
const newCount = incrementRateLimit()  // line 100 — increments AGAIN
Each failed login counts as 2 attempts. With MAX_ATTEMPTS=5, user gets blocked after only 3 failures (3×2=6 ≥ 5). This is a logic bug.

2. [SECURITY GAP] Rate limiter is client-side only — login/page.tsx:25-48 The rate limiter uses localStorage. It can be trivially bypassed by:

Clearing localStorage
Using incognito/private window
Using curl/API directly There is no server-side rate limiting. This makes the rate limiter cosmetic, not a real security control.
3. [GAP] No avatars storage bucket migration — profile/page.tsx:87 The profile page uploads to supabase.storage.from("avatars"), but no migration creates this bucket. Only 002_storage_setup.sql exists with poc-files bucket. Avatar uploads will fail at runtime unless the bucket was created manually in the Supabase dashboard.

4. [GAP] Theme preference DB sync is one-way — profile/page.tsx:307-315 Theme is saved to DB (theme_preference column) when changed in profile page, but on app load, next-themes reads from localStorage only. The DB value is never used to initialize the theme. Cross-device theme sync won't work.

Shall I proceed to Feature 2: Login/Logout audit next?






🔍 Feature 2: Login/Logout Audit
I already have all the code read. Let me trace the full flow:

Login Flow Trace:
Step	File	What Happens	Status
1	login/page.tsx:93	supabase.auth.signInWithPassword()	✅
2	login/page.tsx:98-113	On error: rate limit increment + error display	⚠️
3	login/page.tsx:117	On success: clearRateLimit()	✅
4	login/page.tsx:120-129	If invite token → acceptInvitationAction()	✅
5	login/page.tsx:132-138	If email not confirmed → redirect to /verify-otp	✅
6	login/page.tsx:141-154	Check locked_until → sign out if locked	✅
7	login/page.tsx:157-175	Fetch role → redirect super_admin/dashboard/or no-org	✅
Logout Flow Trace:
Step	File	What Happens	Status
1	Topbar.tsx:75-79	supabase.auth.signOut() → router.push("/login")	✅
2	useAuth.ts:91-96	onAuthStateChange listener re-fetches on SIGNED_OUT	✅
✅ What Works:
Email/password auth via Supabase
Unverified email redirect to OTP page
Account lock check (locked_until)
Invitation acceptance on login
Role-based redirect (super_admin vs org user vs no-org)
Logout clears session and redirects to login
Auth state listener refreshes on sign out
⚠️ Issues Found:
1. [BUG] Rate limiter double-increment — login/page.tsx:99-100

incrementRateLimit()              // increments to N+1, result discarded
const newCount = incrementRateLimit()  // increments to N+2
Each failed login counts as 2 attempts. With MAX_ATTEMPTS=5, user is blocked after 3 failures instead of 5. The first incrementRateLimit() call on line 99 is redundant and should be removed.

2. [FUNCTIONAL GAP] redirect param ignored after login — login/page.tsx:57-59 Middleware sets redirect param at middleware.ts:35:

loginUrl.searchParams.set("redirect", request.nextUrl.pathname)
But the login page never reads redirect. After login, user always lands on /dashboard regardless of where they were trying to go. This breaks the deep-linking UX — if a guest clicks a link to /projects/abc, they should land there after login, not at /dashboard.

3. [SECURITY GAP] Rate limiter is client-side only — login/page.tsx:25-48 Uses localStorage. Trivially bypassed by clearing storage, incognito, or direct API calls. No server-side rate limiting exists. This is cosmetic, not a real security control.

4. [MINOR] No session expiry handling — The login page doesn't handle the case where Supabase returns a session expiry error gracefully. It falls through to the generic catch block.

Now moving to **Feature 3: Forgot Password






🔍 Feature 3: Forgot Password → Reset Code → Reset Works
Full Flow Trace:
Step	File	What Happens	Status
1	forgot-password/page.tsx:38	POST to /api/auth/forgot-password with email	✅
2	forgot-password/route.ts:20	supabaseAdmin.auth.admin.generateLink({ type: "recovery" })	✅
3	forgot-password/route.ts:43	Returns resetLink in dev mode, null in prod	✅
4	forgot-password/page.tsx:50-52	Dev mode: shows clickable reset link	✅
5	reset-password/page.tsx:44-88	Extracts token from URL hash/params, verifies session	✅
6	reset-password/page.tsx:109	supabase.auth.updateUser({ password })	✅
7	reset-password/page.tsx:167	Redirect to /login after success	✅
✅ What Works:
Server-side recovery link generation via Supabase Admin API (bypasses rate limits)
Token extraction from both URL hash (Supabase default) and query params (manual)
Session verification before allowing password update
Password strength validation (same 12+ char rules as registration)
Clear UX states: loading → invalid token → reset form → success
Dev mode convenience: shows reset link directly for testing
⚠️ Issues Found:
1. [SECURITY GAP] No email existence check — forgot-password/route.ts:20 The API always returns { success: true } regardless of whether the email exists. While this is a common pattern to prevent email enumeration, the current implementation doesn't even attempt to check. However, Supabase's admin.generateLink will fail if the email doesn't exist, and the error is silently caught. This is actually correct behavior for preventing enumeration — no issue here on closer inspection.

2. [FUNCTIONAL GAP] No rate limiting on forgot-password — forgot-password/route.ts:14 There's no rate limiting on the forgot-password API endpoint. An attacker could spam this endpoint to:

Drain email sending quota
Cause Supabase API rate limit hits
Annoy users with repeated reset emails
3. [MINOR] axios dependency for a single POST call — forgot-password/page.tsx:13 The forgot-password page imports axios just for one POST request. Native fetch() would suffice and reduce bundle size. Not a bug, but unnecessary dependency.

4. [MINOR] Reset password doesn't clear failed_login_attempts — reset-password/page.tsx:109 After successful password reset, the failed_login_attempts counter in the profiles table is not reset. If a user was locked out and resets their password, they might still be locked. However, the login page checks locked_until (timestamp-based), not failed_login_attempts directly, so this is a minor inconsistency rather than a blocking bug.

Now moving to **Feature 4: Invitation









🔍 Feature 4: Invitation Link Assigns Correct Role and Org
Full Flow Trace:
Step	File	What Happens	Status
1	invite/route.ts:20-30	POST — validates email, role, org_id	✅
2	invite/route.ts:35-40	Authenticates sender	✅
3	invite/route.ts:43-51	Fetches sender profile for permission check	✅
4	invite/route.ts:53-78	Determines target org, privilege escalation guard	✅
5	invite/route.ts:81-85	Quota check before inviting	✅
6	invite/route.ts:88-101	Duplicate check (existing user in same org)	✅
7	invite/route.ts:106-129	Inserts invitation with token	✅
8	invite/route.ts:132-163	Sends branded email with invite link	✅
9	invite/[token]/page.tsx:44-48	Fetches invitation by token to validate	🔴
10	invite/[token]/page.tsx:93-97	Redirects to /register?invite=... or /login?invite=...	✅
11	actions.ts:13-169	acceptInvitationAction() — email binding, profile update, mark accepted	✅
✅ What Works:
Invitation creation with strict role validation (non-super-admin can't invite admin)
Privilege escalation guard at invite/route.ts:75-77
Quota check before allowing invite
Duplicate member check
Email binding in acceptInvitationAction at actions.ts:65 — prevents token reuse with different email
Expiry and already-accepted checks
Profile upsert resilience (creates profile if trigger missed it)
Audit logging and inviter notification
department_id passed through correctly
🔴 CRITICAL Issues Found:
1. [CRITICAL BUG] Invite landing page blocked by RLS for unauthenticated users — invite/[token]/page.tsx:44

The invite page uses the browser client (anon key) to fetch the invitation:

const { data, error } = await supabase
  .from("invitations")
  .select("*, organizations(name)")
  .eq("token", token)
  .single()
But the RLS policy at 004_fix_invitations_super_admin.sql:5 is:

create policy "invitations_select" on invitations for select
  using (org_id = my_org_id() or is_super_admin());
For an unauthenticated user (which is the case when clicking an invite link):

my_org_id() returns NULL (no auth.uid())
is_super_admin() returns false
Policy evaluates to NULL = NULL OR false → NULL → row filtered out
Result: The invite landing page will always show "Invalid or expired invitation link" for unauthenticated users. The invitation validation page is completely broken. A public RLS policy or a server-side API route is needed to fetch invitation details by token without authentication.

2. [BUG] Fallback path in acceptInvitationAction also blocked by RLS — actions.ts:41-49

If the admin client fails (e.g., missing SUPABASE_SERVICE_ROLE_KEY), the fallback uses the user client. But the user accepting the invite doesn't have org_id matching the invitation's org_id yet, so RLS blocks the SELECT. The primary path (admin client) works, but the fallback is dead code.

Now moving to **Feature 5: Sidebar







🔍 Feature 5: Sidebar Menu Hides Items Per Role
I already have the Sidebar.tsx code. Let me trace each role:

Role-by-Role Visibility Matrix:
Section	Items	Admin	PM	SE	Guest
Overview	Dashboard	✅	✅	✅	✅
Security	Projects, Findings, Tracker, Reports	✅ All	✅ All	✅ All	✅ Projects/Findings/Reports only
Scanners	Terminal, ZAP, CI/CD, History	✅	❌	✅	❌
AI	AI Assistant	✅	✅	✅	❌
Admin	Users, Org, Billing, Audit, Settings	✅	❌	❌	❌
✅ What Works:
Admin section hidden for non-admin (line 133-135)
Scanners hidden for PM and guest (line 138-140)
AI hidden for guest (line 143-145)
Guest gets filtered Security items — Tracker removed (line 151-157)
Super admin gets separate nav sections entirely
⚠️ Issues Found:
1. [UI/UX GAP] PM can access /users but can't see it in sidebar — Sidebar.tsx:133 The "Users" link is inside the "Admin" section which is hidden for PM. But middleware at permissions.ts:262 allows PM to access /users. PM must manually type the URL or bookmark it. The sidebar should show a limited "Users" item for PM (or move it out of the Admin section).

2. [UI/UX GAP] SE can view users but no sidebar link — permissions.ts:93 SE has users:view_all permission but the "Users" link is in the hidden Admin section. Same issue as PM.

3. [UI/UX GAP] "Settings" hidden for non-admin — Sidebar.tsx:81 The /settings page is in the Admin section. Non-admin users can only reach it via the Topbar avatar dropdown. This is inconsistent — either Settings should be in a shared section or the Topbar link should be the only entry point.

4. [UI GAP] Empty sidebar for users without org — Sidebar.tsx:161-163 When profile exists but org_id is null (self-registered user), the sidebar renders with empty navSections. The onboarding view code is commented out. User sees a blank sidebar.

5. [UI GAP] No loading skeleton — Sidebar.tsx:118 The loading state from useAuth() is destructured but the loading skeleton code is replaced with a comment placeholder. During auth loading, the sidebar renders empty (no nav items), causing a flash of blank sidebar.

Now moving to **Feature 6: Theme Toggle





🔍 Feature 6: Theme Toggle — Light → Dark → System, Persists Across Reload
Full Flow Trace:
Step	File	What Happens	Status
1	layout.tsx:49-54	ThemeProvider with attribute="class", defaultTheme="system", enableSystem	✅
2	theme-provider.tsx:10	Wraps next-themes ThemeProvider	✅
3	theme-toggle.tsx:28-36	Dropdown: Light / Dark / System via setTheme()	✅
4	Topbar.tsx:180	<ThemeToggle /> in dashboard header	✅
5	auth/layout.tsx:18	<ThemeToggle /> in auth pages header	✅
6	profile/page.tsx:307-315	Theme selector also saves to profiles.theme_preference	✅
7	next-themes internal	Persists to localStorage key "theme"	✅
✅ What Works:
Three modes: Light, Dark, System — all functional via next-themes
suppressHydrationWarning on <html> prevents flash
disableTransitionOnChange prevents animation flicker
Theme toggle available on both auth and dashboard layouts
Persists across reload via localStorage (next-themes default behavior)
Profile page has additional theme selector with DB sync
⚠️ Issues Found:
1. [GAP] DB theme sync is write-only, never read — profile/page.tsx:312 Theme is saved to profiles.theme_preference when changed in profile page, but on app load, next-themes reads from localStorage only. The DB value is never used to initialize the theme. This means:

Cross-device theme sync doesn't work
If user clears localStorage, theme resets to system default instead of their saved preference
The theme_preference column is effectively dead data
2. [MINOR] Two theme controls with different behavior — theme-toggle.tsx vs profile/page.tsx:304 The ThemeToggle component uses setTheme() (localStorage only), while the profile page also writes to DB. This inconsistency means changing theme via the header toggle doesn't persist to DB, only via the profile page.

Now moving to **Feature 7: Protected Routes





🔍 Feature 7: Protected Routes Redirect Unauthenticated Users to Login
I already have the middleware.ts code. Let me trace:

Full Flow Trace:
Step	File	What Happens	Status
1	middleware.ts:10-25	Defines 14 protected path prefixes	✅
2	middleware.ts:27-29	startsWith check on current pathname	✅
3	middleware.ts:32-37	No user → redirect to /login?redirect=...	✅
4	middleware.ts:40-51	Profile missing → redirect to /login?error=profile_missing	✅
5	middleware.ts:57-59	Org suspended → redirect to /login?error=suspended	✅
6	middleware.ts:128-150	/super-admin/* → auth check + role check	✅
7	middleware.ts:156-169	Matcher excludes static files, images, API routes	✅
✅ What Works:
All 14 dashboard paths protected: /dashboard, /projects, /findings, /tracker, /scanner, /reports, /users, /organization, /ai, /analytics, /notifications, /profile, /settings, /audit
Unauthenticated users redirected to /login with redirect param
Profile existence guard (Z+ Security)
Org suspension check for non-super-admins
Super admin routes separately protected
Matcher correctly excludes static assets and API routes
⚠️ Issues Found:
1. [FUNCTIONAL GAP] redirect param never consumed — middleware.ts:35 → login/page.tsx:57 Middleware sets redirect param, but the login page never reads it. After login, user always lands on /dashboard regardless of original destination. Deep-linking is broken.

2. [MINOR] Fragile type cast for org suspension — middleware.ts:54

const orgIsActive = (profile?.organizations as any)?.is_active ?? true
If the organizations join fails or returns unexpected shape, it silently defaults to true (active). A safer approach would validate the structure.

3. [MINOR] startsWith could over-match — middleware.ts:27-29 /dashboard matches /dashboard-something. Low risk but worth noting.

Now moving to *Feature 8: /scanner/ returns 403 for guest





🔍 Feature 8: /scanner/* Returns 403 for Guest Role
Full Flow Trace:
Step	File	What Happens	Status
1	middleware.ts:62	isScannerRoute() check	✅
2	permissions.ts:269	pathname.startsWith("/scanner")	✅
3	middleware.ts:63	role !== "admin" && role !== "security_engineer" → 403	✅
Role-by-Role Result:
Role	/scanner/* Access	Mechanism
Admin	✅ Allowed	Middleware pass
Security Engineer	✅ Allowed	Middleware pass
Program Manager	❌ 403	Middleware block
Guest	❌ 403	Middleware block
Super Admin	❌ 403	Blocked by super_admin data route check at middleware.ts:102-124 — but /scanner is NOT in the blocked data routes list
✅ What Works:
Guest gets 403 JSON response
PM gets 403 JSON response
Admin and SE pass through
Sidebar already hides scanner section for guest and PM (defense in depth)
⚠️ Issues Found:
1. [GAP] Super admin can access scanner routes — middleware.ts:103-112 The super_admin data route block list includes /projects/, /findings/, /reports/ but NOT /scanner/. Super admin can access scanner pages. This may be intentional (super admin might need to test scanners), but it's inconsistent with the principle that super admins shouldn't access org-level operational data.

2. [MINOR] No scanner page files exist yet — The sidebar links to /scanner/terminal, /scanner/zap, /scanner/cicd, /scanner/history but there are no corresponding page.tsx files in the codebase. These routes would 404 even for authorized users. This is a Phase 2+ feature that hasn't been built yet — the middleware protection is in place but the pages don't exist.

Now moving to **Feature 9: /users returns 403 for non-admin






🔍 Feature 9: /users Returns 403 for Non-Admin
Full Flow Trace:
Step	File	What Happens	Status
1	middleware.ts:89	isPMAccessibleRoute() check	✅
2	permissions.ts:262	pathname.startsWith("/users")	✅
3	middleware.ts:90	role !== "admin" && role !== "program_manager" → 403 JSON	✅
4	users/page.tsx:21	Server-side: same check → notFound() (404)	✅
Role-by-Role Result:
Role	/users Access	Mechanism
Admin	✅ Allowed	Middleware + page pass
Program Manager	✅ Allowed	Middleware + page pass
Security Engineer	❌ 403	Middleware block
Guest	❌ 403	Middleware block
Super Admin	❌ 403	Blocked by super_admin data route check
✅ What Works:
Guest and SE get 403 JSON from middleware
PM and admin pass through
Defense in depth: page-level check as secondary guard
Super admin blocked from org-level /users (redirected to /super-admin/users)
⚠️ Issues Found:
1. [INCONSISTENCY] PM can access /users but sidebar hides it — Sidebar.tsx:133 + users/page.tsx:21 PM is allowed to access /users (for inviting guest/SE), but the "Users" link is inside the hidden "Admin" sidebar section. PM must manually navigate to /users. This is a wiring gap between middleware permissions and sidebar visibility.

2. [MINOR] Page returns 404 instead of 403 — users/page.tsx:22 The page uses notFound() (404) while middleware returns 403. Inconsistent HTTP status codes for the same access denial. Should use a 403 forbidden page or redirect.

Now moving to **Feature 10: Profile Avatar





🔍 Feature 10: Profile Avatar Upload Works, Image Displays in Topbar
Full Flow Trace:
Step	File	What Happens	Status
1	profile/page.tsx:61-79	File input → type validation (PNG/JPG/GIF/WebP) + size check (2MB)	✅
2	profile/page.tsx:83-89	Upload to supabase.storage.from("avatars").upload() with upsert: true	🔴
3	profile/page.tsx:98-100	Get public URL via getPublicUrl()	✅
4	profile/page.tsx:104-107	Update profiles.avatar_url in DB	✅
5	profile/page.tsx:117-125	Re-fetch profile to get fresh avatar_url	✅
6	Topbar.tsx:187	<AvatarImage src={profile?.avatar_url}>	⚠️
✅ What Works:
File type validation (PNG, JPG, GIF, WebP only)
File size validation (2MB max)
Upload with upsert (replaces existing avatar)
Public URL retrieval
DB update for avatar_url
Local state update in profile page (immediate preview)
Topbar displays avatar via useAuth().profile?.avatar_url
🔴 CRITICAL Issues Found:
1. [CRITICAL] No avatars storage bucket migration — profile/page.tsx:87 The code uploads to supabase.storage.from("avatars"), but no migration creates this bucket. Only 002_storage_setup.sql exists with the poc-files bucket. There are zero RLS policies for an avatars bucket. Avatar uploads will fail at runtime with a "bucket not found" error unless the bucket was manually created in the Supabase dashboard.

2. [BUG] Topbar doesn't refresh after avatar upload — Topbar.tsx:187 vs useAuth.ts:27-100 The Topbar reads profile?.avatar_url from useAuth(). But useAuth() only re-fetches on SIGNED_IN/SIGNED_OUT events (line 93-96). After uploading an avatar, no auth state change fires, so the Topbar continues showing the old avatar (or initials) until the user manually refreshes the page. The profile page's router.refresh() on line 128 only refreshes server components, not the client-side useAuth state.

3. [GAP] No RLS policies for avatars bucket — Even if the bucket is manually created, there are no storage RLS policies. Without policies, Supabase storage defaults to deny-all. Uploads would fail with a policy violation error.

Now moving to **Feature 11: Rate Limiter




🔍 Feature 11: Rate Limiter Blocks 6th Login Attempt Within a Minute
Full Flow Trace:
Step	File	What Happens	Status
1	login/page.tsx:25-27	Constants: MAX_ATTEMPTS=5, RATE_WINDOW_MS=60000	✅
2	login/page.tsx:29-39	getRateLimitInfo() — reads from localStorage, auto-clears expired	✅
3	login/page.tsx:41-48	incrementRateLimit() — increments counter, sets reset timestamp	✅
4	login/page.tsx:78-85	Pre-check: if count >= MAX_ATTEMPTS, block with countdown message	✅
5	login/page.tsx:99-100	On error: incrementRateLimit() called twice	🔴
6	login/page.tsx:102-112	If newCount >= MAX_ATTEMPTS, show rate limit error	✅
7	login/page.tsx:117	On success: clearRateLimit()	✅
🔴 CRITICAL Issues Found:
1. [CRITICAL BUG] Double increment — blocks at 3 failures, not 5 — login/page.tsx:99-100

incrementRateLimit()              // line 99: count goes 0→1, 1→2, 2→3 (result discarded)
const newCount = incrementRateLimit()  // line 100: count goes 1→2, 2→3, 3→4
Each failed login increments the counter twice. With MAX_ATTEMPTS=5:

1st failure: count becomes 2 (should be 1)
2nd failure: count becomes 4 (should be 2)
3rd failure: count becomes 6 ≥ 5 → BLOCKED (should allow 5 attempts)
The user is blocked after 3 failures instead of the intended 5. The first incrementRateLimit() on line 99 is redundant and must be removed.

2. [CRITICAL SECURITY GAP] Client-side only — trivially bypassable — login/page.tsx:30 The entire rate limiter uses localStorage. Attack vectors:

Open DevTools → localStorage.removeItem("login_attempts") → unlimited attempts
Open incognito/private window → fresh localStorage → unlimited attempts
Use curl/Postman/script → no localStorage at all → unlimited attempts
There is zero server-side rate limiting on the login endpoint
This makes the rate limiter cosmetic only — it provides no real brute-force protection. A proper implementation requires server-side rate limiting (e.g., Supabase Auth already has built-in rate limits, but the app-level limiter should also be server-side or use the DB failed_login_attempts column).

3. [GAP] DB failed_login_attempts column never used — types.ts:141 The profiles table has failed_login_attempts and locked_until columns, and the login page checks locked_until at login/page.tsx:147. But failed_login_attempts is never incremented anywhere in the codebase. The server-side account locking mechanism exists in the schema but is never triggered.

Now let me present the complete audit summary




Phase 1 Feature Audit — Complete Summary
All 11 features have been traced end-to-end through frontend → API → middleware → database. Below is the consolidated findings report.

🔴 CRITICAL (Will Break at Runtime)
#	Feature	Issue	Location
1	Invitation Link	Invite landing page blocked by RLS for unauthenticated users. invitations_select policy requires org_id = my_org_id() which returns NULL for unauthenticated users. Invite page always shows "Invalid link".	004_fix_invitations_super_admin.sql:5
2	Avatar Upload	No avatars storage bucket migration exists. Only poc-files bucket is created. Upload will fail with "bucket not found". Also no RLS policies for avatars bucket.	profile/page.tsx:87
3	Rate Limiter	Double-increment bug: incrementRateLimit() called twice per failure. User blocked after 3 attempts instead of 5.	login/page.tsx:99-100
🟠 HIGH (Security/Functional Gaps)
#	Feature	Issue	Location
4	Rate Limiter	Client-side only (localStorage). Trivially bypassed via incognito, DevTools, or curl. No server-side brute-force protection.	login/page.tsx:30
5	Login Redirect	Middleware sets redirect param but login page never reads it. Deep-linking broken — user always lands on /dashboard after login.	middleware.ts:35 → login/page.tsx:57
6	Avatar Display	Topbar doesn't refresh after avatar upload. useAuth() only re-fetches on SIGNED_IN/SIGNED_OUT, not on profile update.	useAuth.ts:93
7	DB Lock	failed_login_attempts column never incremented. Server-side account locking mechanism exists in schema but is dead code.	types.ts:141
🟡 MEDIUM (UI/UX Wiring Gaps)
#	Feature	Issue	Location
8	Sidebar	PM can access /users but sidebar hides it (inside hidden Admin section). Must manually type URL.	Sidebar.tsx:133
9	Sidebar	SE has users:view_all permission but no sidebar link to /users.	permissions.ts:93
10	Sidebar	Empty sidebar for users without org (self-registered). Onboarding view code is commented out.	Sidebar.tsx:161
11	Sidebar	No loading skeleton during auth check — flashes blank sidebar.	Sidebar.tsx:118
12	Theme	DB theme_preference is write-only. Never read on app load. Cross-device sync broken.	profile/page.tsx:312
13	Theme	Header toggle saves to localStorage only; profile page toggle saves to both. Inconsistent.	theme-toggle.tsx:28
🟢 LOW (Minor/Non-Blocking)
#	Feature	Issue	Location
14	Forgot Password	No rate limiting on /api/auth/forgot-password endpoint.	forgot-password/route.ts:14
15	Forgot Password	Unnecessary axios dependency for a single POST call.	forgot-password/page.tsx:13
16	Users Page	Returns 404 (notFound()) instead of 403 for unauthorized access. Inconsistent with middleware.	users/page.tsx:22
17	Scanner	Super admin can access /scanner/* (not in blocked data routes list).	middleware.ts:103
18	Scanner	No scanner page files exist yet — routes 404 even for authorized users.	N/A
✅ What's Working Well (Z+ Security)
Password validation (12+ chars, uppercase, number, special) with real-time strength meter
OTP verification with paste support, keyboard nav, resend cooldown
Email binding in invitation acceptance (prevents token reuse with different email)
Privilege escalation guard (non-super-admin can't invite admin)
Quota check before inviting users
Profile auto-creation via DB trigger on signup
Middleware profile existence guard + org suspension check
Role-based middleware: scanner routes blocked for guest/PM, admin routes blocked for non-admin
Super admin data isolation (blocked from org-level projects/findings/reports)
Sidebar role-based filtering (Admin/Scanners/AI sections hidden appropriately)
Account lock check (locked_until) on login
Audit logging on invitation acceptance