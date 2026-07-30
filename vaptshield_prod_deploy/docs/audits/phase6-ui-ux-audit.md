# 🎨 VAPTShield — UI/UX Design & Responsiveness Audit

**Date:** 2026-05-28  
**Scope:** Full frontend audit — responsive breakpoints, overflow handling, dark mode consistency, visual polish, accessibility, touch targets, loading states, empty states  
**Files Analyzed:** 15 core UI files + global CSS + Tailwind config

---

## 📊 Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 2 |
| 🟠 HIGH | 4 |
| 🟡 MEDIUM | 7 |
| 🟢 LOW | 10 |
| **TOTAL** | **23** |

---

## 🔴 CRITICAL (2 issues)

### C1. TrackerGrid Table: `overflow-hidden` Blocks Horizontal Scroll on Mobile

**File:** [`components/tracker/TrackerGrid.tsx`](components/tracker/TrackerGrid.tsx:375)

```tsx
<div className="border border-border/50 rounded-xl overflow-hidden bg-bg-card flex-1 shadow-sm">
```

The table container uses `overflow-hidden` which **completely clips** any overflowing content. The TrackerGrid table has 8 columns (checkbox, Title, Severity, Status, Project, Assigned To, Created, Actions). On screens narrower than ~900px, these columns cannot fit and get truncated with no way to scroll horizontally.

**Impact:** Mobile and tablet users cannot see all columns — the Actions menu, Created date, and potentially Assigned To are hidden and inaccessible.

**Fix:** Change `overflow-hidden` → `overflow-x-auto` (or `overflow-hidden overflow-x-auto` to keep vertical clipping):

```tsx
<div className="border border-border/50 rounded-xl overflow-x-auto bg-bg-card flex-1 shadow-sm">
```

---

### C2. Sidebar Nav `scrollbar-none` Hides Scrollable Content Indicator

**File:** [`components/layout/Sidebar.tsx`](components/layout/Sidebar.tsx:134)

```tsx
<nav className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-none">
```

The `scrollbar-none` utility completely hides the scrollbar. While visually clean, users on long nav sections (admin with Administration + Scanners sections) get no visual indicator that content is scrollable. Combined with `sticky top-0`, the sidebar has fixed height but scrollable content — users may never discover items below the fold.

**Impact:** Navigation items below the viewport fold are effectively invisible to users who don't try to scroll. Particularly affects admin users with 3+ nav sections.

**Fix:** Replace `scrollbar-none` with `scrollbar-thin` (already defined in globals.css at line 203):

```tsx
<nav className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-thin">
```

---

## 🟠 HIGH (4 issues)

### H1. FindingDetailClient Status Stepper Overflows on Small Screens

**File:** [`app/(dashboard)/findings/[id]/FindingDetailClient.tsx`](app/(dashboard)/findings/[id]/FindingDetailClient.tsx:436)

```tsx
<div className="flex items-center gap-1">
  {STATUS_STEPS.map((step) => (...))} // 6 buttons: Open → In Review → In Progress → Resolved → Verified → Closed
```

Six status step buttons rendered in a single `flex` row with no `flex-wrap`. On screens narrower than ~650px, these buttons overflow the container. There is no horizontal scroll wrapper and no responsive adaptation.

**Impact:** On mobile (<650px), rightmost status steps (Verified, Closed) are pushed off-screen and completely inaccessible. This is the primary navigation for status transitions — developers/SEs need to tap these to change finding status.

**Fix:** Add `flex-wrap` with appropriate gap adjustment on mobile:

```tsx
<div className="flex flex-wrap items-center gap-1">
```

Or add horizontal scroll with fade indicators:
```tsx
<div className="flex items-center gap-1 overflow-x-auto scrollbar-thin pb-1">
```

---

### H2. DiscussionThread Edit/Delete Buttons Render Off-Screen on Mobile

**File:** [`components/findings/DiscussionThread.tsx`](components/findings/DiscussionThread.tsx:317-322)

```tsx
// Own messages: edit/delete buttons positioned at -left-16 (64px to the left)
// Others' messages: buttons positioned at -right-16 (64px to the right)
```

The message bubbles use `max-w-[85%]`, and edit/delete buttons are positioned absolutely at `-left-16` or `-right-16` (64px offset) outside the bubble. On narrow mobile screens (<360px), the 85% + 64px can extend beyond the viewport, making buttons unreachable.

Additionally, these buttons only appear on `group-hover`. On touch devices, there's no hover state, so mobile users can never see edit/delete buttons. This is a **critical touch-interaction gap**.

**Impact:** Mobile users cannot edit or delete their comments within the 2-minute window. The buttons are invisible (no hover on touch) and potentially off-screen.

**Fix:** For touch devices, show buttons persistently or use a long-press/tap-to-reveal pattern. For positioning, use `right-0` / `left-0` with appropriate z-index instead of negative offsets:

```tsx
// Instead of absolute positioning with negative offsets, use:
// - A "more" dropdown (⋮) always visible on mobile
// - Or flex the buttons inline at the bottom of each bubble
```

---

### H3. Tab Navigation Overflows on Narrow Screens

**File:** [`app/(dashboard)/findings/[id]/FindingDetailClient.tsx`](app/(dashboard)/findings/[id]/FindingDetailClient.tsx:475)

```tsx
<TabsList className="bg-transparent h-12 w-full justify-start gap-6 p-0">
```

Five tabs (Description, Evidence, Remediation, Discussion, Activity) with `gap-6` (24px) and no wrapping. On screens narrower than ~500px, the tabs overflow with no scroll mechanism.

**Impact:** Users on narrow mobile screens cannot access the Discussion or Activity tabs.

**Fix:** Add horizontal scroll with `overflow-x-auto`:

```tsx
<TabsList className="bg-transparent h-12 w-full justify-start gap-4 sm:gap-6 p-0 overflow-x-auto scrollbar-thin">
```

---

### H4. No Empty/Error State for Failed Data Fetch in TrackerGrid

**File:** [`components/tracker/TrackerGrid.tsx`](components/tracker/TrackerGrid.tsx:403-409)

The table has an empty state for "no results found" but there is no error state for when the data fetch fails (network error, server error, etc.). Users see either stale data or a blank table with no feedback.

**Impact:** Network failures are silently swallowed. Users see a confusing "No results found" message when there should be data, leading to support tickets and confusion.

**Fix:** Add an error boundary or error state component with retry button:

```tsx
{error ? (
  <TableRow>
    <TableCell colSpan={columns.length}>
      <div className="py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-warning mx-auto mb-3" />
        <p className="text-fg-muted">Failed to load findings</p>
        <Button variant="outline" onClick={refetch}>Retry</Button>
      </div>
    </TableCell>
  </TableRow>
) : ...}
```

---

## 🟡 MEDIUM (7 issues)

### M1. Stat Cards Awkward Layout on Tablet (sm-md Breakpoint)

**File:** [`components/tracker/TrackerGrid.tsx`](components/tracker/TrackerGrid.tsx:287)

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
```

With 5 stat cards:
- **Mobile (sm):** 2 columns → 3 rows (2+2+1), last card spans alone — looks unbalanced
- **Desktop (lg):** 5 columns → 1 row — perfect

**Fix:** Use `md:grid-cols-3` for intermediate breakpoint:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
```

---

### M2. Pagination Renders ALL Page Numbers (No Ellipsis)

**File:** [`components/tracker/TrackerGrid.tsx`](components/tracker/TrackerGrid.tsx:434)

```tsx
{Array.from({ length: table.getPageCount() }, (_, i) => (
    <Button key={i} ...>{i + 1}</Button>
))}
```

If there are 500 pages (5,000 findings at 10/page), this renders 500 buttons. This is both a **rendering performance issue** and a **UI nightmare** — 500 tiny buttons in a horizontal row.

**Fix:** Add ellipsis-based pagination with window of visible pages:

```tsx
// Show: [1] [...] [4] [5] [6] [...] [500]
// Only render ~7 buttons regardless of page count
```

---

### M3. DiscussionThread Send Button is 80×80px (Disproportionate)

**File:** [`components/findings/DiscussionThread.tsx`](components/findings/DiscussionThread.tsx:399-412)

```tsx
<Button 
    type="submit" 
    size="icon"
    className="h-[80px] w-[80px] rounded-xl bg-primary..."
>
    <Send className="h-6 w-6" />
</Button>
```

An 80×80px square send button next to a textarea is visually jarring. On mobile, this button takes up significant horizontal space that the textarea could use. The `h-[80px]` also matches the textarea height but creates an awkward square that dominates the input area.

**Impact:** Visually unbalanced — the send button competes with the textarea for attention. On mobile, reduces usable text input width by ~30%.

**Fix:** Reduce size to match textarea height naturally:

```tsx
<Button 
    type="submit" 
    size="icon"
    className="h-12 w-12 rounded-xl bg-primary shrink-0..."
>
    <Send className="h-5 w-5" />
</Button>
```

---

### M4. Touch Targets Below WCAG 44×44px Minimum

Multiple interactive elements fall below the WCAG 2.1 minimum touch target size (Level AA):

| Element | File:Line | Approx. Size |
|---------|-----------|-------------|
| Sidebar collapse button | [`Sidebar.tsx:127`](components/layout/Sidebar.tsx:127) | ~28×28px (`p-1.5`) |
| Pagination buttons | [`TrackerGrid.tsx:435`](components/tracker/TrackerGrid.tsx:435) | ~32×32px (`size="sm"`) |
| Table column sort buttons | [`TrackerGrid.tsx:179`](components/tracker/TrackerGrid.tsx:179) | ~24×24px |
| Filter dropdown triggers | [`TrackerGrid.tsx:319`](components/tracker/TrackerGrid.tsx:319) | ~36px height |
| Bell notification dot | [`Topbar.tsx:153`](components/layout/Topbar.tsx:153) | 8×8px (too tiny to tap!) |
| Notifications mark-read button | [`Topbar.tsx:165`](components/layout/Topbar.tsx:165) | ~28px height |

**Impact:** Mobile/tablet users and users with motor impairments will struggle to accurately tap these controls.

**Fix:** Increase padding/minimum dimensions:
- Sidebar collapse: `p-2 min-w-[44px] min-h-[44px]`
- Pagination: `size="default"` with `min-w-[44px]`
- Table sort headers: Add `p-2` to clickable area

---

### M5. FindingDetailClient Sidebar Layout on Mobile — Sidebar Below Content

**File:** [`app/(dashboard)/findings/[id]/FindingDetailClient.tsx`](app/(dashboard)/findings/[id]/FindingDetailClient.tsx:318)

```tsx
<div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 items-start">
```

On mobile (single column), the sidebar (CVSS score, metadata, project info) renders **above** the main content. This means users must scroll past 320px of metadata before reaching the actual finding details, status stepper, and tabs.

**Impact:** On mobile, critical interactive elements (status transitions, tabs) are pushed below the fold behind metadata cards that users rarely need first. This is reversed from the ideal mobile UX where action items come first.

**Fix:** On mobile, move sidebar below main content or collapse it into an expandable section:

```tsx
// Option A: Use CSS order to reverse on mobile
<div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8 items-start">
  <main className="order-2 lg:order-1">...</main>
  <aside className="order-1 lg:order-2">...</aside>
</div>

// Option B: Use an accordion/collapsible for the sidebar on mobile
```

---

### M6. Sheet Panel Max-Width Too Narrow for Discussion Thread

**File:** [`components/tracker/TrackerGrid.tsx`](components/tracker/TrackerGrid.tsx:460)

```tsx
<SheetContent className="sm:max-w-xl w-[95vw] overflow-y-auto bg-panel border-border">
```

`sm:max-w-xl` = 576px on desktop. The sheet contains: finding details + DiscussionThread (chat) + RemediationForm. The DiscussionThread uses `max-w-[85%]` bubbles, which at 576px container width means ~490px for chat — functional but cramped. The RemediationForm alongside chat creates a very tall scroll that's hard to navigate.

**Fix:** Increase to `sm:max-w-2xl` (672px) for better content breathing room:

```tsx
<SheetContent className="sm:max-w-2xl w-[95vw] overflow-y-auto bg-panel border-border">
```

---

### M7. No Loading Skeleton for Table Data in TrackerGrid

**File:** [`components/tracker/TrackerGrid.tsx`](components/tracker/TrackerGrid.tsx:396-409)

The table shows "No results found." as the only non-data state. During initial data fetch, users see a flash of "No results found" before data populates. There is no shimmer/skeleton loading state.

**Impact:** Brief but confusing flash of empty state during every page load, especially on slow connections.

**Fix:** Add a loading state with skeleton rows:

```tsx
{table.getRowModel().rows.length === 0 ? (
  isLoading ? (
    // 5 skeleton rows
    Array.from({ length: 5 }).map((_, i) => (
      <TableRow key={i}>
        {columns.map((_, j) => (
          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
        ))}
      </TableRow>
    ))
  ) : (
    <TableRow><TableCell colSpan={8}>No results found.</TableCell></TableRow>
  )
) : ...}
```

---

## 🟢 LOW (10 issues)

### L1. Invite Page: Inconsistent Border Radius

**File:** [`app/(auth)/invite/[token]/page.tsx`](app/(auth)/invite/[token]/page.tsx:119)

```tsx
<div className="bg-panel border border-border rounded-md p-8 shadow-sm max-w-md mx-auto">
```

Uses `rounded-md` (6px) while all other cards/panels across the app use `rounded-xl` (12px) or `rounded-2xl` (16px). This creates a subtle visual inconsistency — the invite page card looks more "square" than every other card in the app.

**Fix:**
```tsx
<div className="bg-panel border border-border rounded-2xl p-8 shadow-sm max-w-md mx-auto">
```

---

### L2. Auth Layout `max-w-sm` Too Narrow for Invite Page

**File:** [`app/(auth)/layout.tsx`](app/(auth)/layout.tsx:23)

```tsx
<div className="w-full max-w-sm">
```

`max-w-sm` = 384px. The invite page shows: org name + role badge + email + "Create Account" button + divider + "Sign In" button + legal text. At 384px, the role badge and email can feel cramped, especially with long organization names.

**Fix:** Allow wider breakout for invite page or increase to `max-w-md`:

```tsx
<div className="w-full max-w-md">
```

---

### L3. No Exit Animation on Tab Content Switches

**File:** [`app/(dashboard)/findings/[id]/FindingDetailClient.tsx`](app/(dashboard)/findings/[id]/FindingDetailClient.tsx:498-735)

Tab contents use `animate-in fade-in slide-in-from-bottom-2 duration-300` for entry, but there is no exit animation. When switching tabs, old content disappears instantly while new content animates in — creating a jarring half-animated transition.

**Fix:** Use a transition library like `framer-motion` with `AnimatePresence` for proper enter+exit animations, or at minimum add a CSS exit class via Radix Tabs' `data-state` attribute.

---

### L4. Inline SVG XCircle Instead of lucide-react Icon

**File:** [`app/(auth)/invite/[token]/page.tsx`](app/(auth)/invite/[token]/page.tsx:175-179)

The invite page imports `ShieldCheck, UserPlus, LogIn` from lucide-react but manually defines an inline SVG for the XCircle icon. This is inconsistent — all other icons in the codebase use lucide-react exclusively. The manual SVG also lacks proper dark mode color inheritance (uses `currentColor` which works, but the pattern is inconsistent).

**Fix:** Import `XCircle` from lucide-react:
```tsx
import { Loader2, ShieldCheck, UserPlus, LogIn, XCircle } from "lucide-react"
```

---

### L5. Dashboard Layout: No Min-Height on Main Content Area

**File:** [`app/(dashboard)/layout.tsx`](app/(dashboard)/layout.tsx:18)

```tsx
<main className="flex-1 overflow-y-auto">
```

The main content area uses `flex-1` to fill available space, but child pages like FindingDetailClient don't set `min-h-`. When a tab has short content (e.g., Description tab with 2-line text), the page feels empty with a large gap between content and viewport bottom.

**Fix:** Ensure child pages use minimum height:
```tsx
// In FindingDetailClient:
<div className="p-6 max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-500 min-h-[calc(100vh-3.5rem)]">
```

---

### L6. Severity Badge/Status Badge Color Contrast on Dark Mode

**File:** [`components/tracker/TrackerGrid.tsx`](components/tracker/TrackerGrid.tsx:212)

```tsx
<Badge variant="outline" className={cn("px-2 py-0.5 rounded-full...", config.color)}>
```

Status badges use severity/config colors with `variant="outline"`. In dark mode, the "info" severity (used for `informational` findings) uses `--info: 220 9% 60%` which is a muted gray. On dark backgrounds (`--bg: 0 0% 4%`), this may have insufficient contrast ratio.

**Impact:** Low-severity and informational badges may fail WCAG AA contrast ratio (4.5:1 for normal text).

**Fix:** Verify contrast ratios for all severity colors in dark mode, especially `info` severity.

---

### L7. Topbar Organization Badge Truncation

**File:** [`components/layout/Topbar.tsx`](components/layout/Topbar.tsx:137)

```tsx
<span className="text-[10px] font-bold uppercase tracking-widest text-primary truncate max-w-[150px]">
    {orgName}
</span>
```

Organization names are truncated at 150px with no tooltip showing the full name. Users with long organization names see `"Very Long Organizat..."` with no way to view the full name.

**Fix:** Wrap in a tooltip:
```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>
      <span className="... truncate max-w-[150px]">{orgName}</span>
    </TooltipTrigger>
    <TooltipContent>{orgName}</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

### L8. Filter Toolbar: No "Clear All Filters" Visual Indicator When Active

**File:** [`components/tracker/TrackerGrid.tsx`](components/tracker/TrackerGrid.tsx:358-370)

The clear button (`X` icon) appears when filters are active, but there's no visual indicator on the filtered columns themselves showing which columns have active filters. Users may not know which filters are narrowing results.

**Fix:** Add a subtle highlight/badge to filter dropdowns when they have an active value:
```tsx
<SelectTrigger className={cn(
    "h-9 w-[130px] bg-bg-card border-border text-xs",
    table.getColumn("severity")?.getFilterValue() && "ring-1 ring-primary/50"
)}>
```

---

### L9. DiscussionThread Empty State: No Prompt for First Comment

**File:** [`components/findings/DiscussionThread.tsx`](components/findings/DiscussionThread.tsx:268-274)

```
{comments.length === 0 ? (
  <div className="flex-1 flex items-center justify-center border-2 border-dashed border-border/50 rounded-2xl m-4">
    <div className="text-center p-8">
      <MessageSquare className="h-10 w-10 text-fg-disabled mx-auto mb-3" />
      <p className="text-fg-muted font-medium text-sm">No comments yet</p>
      <p className="text-fg-subtle text-xs mt-1">Start the discussion</p>
    </div>
  </div>
) : ...}
```

This empty state is well-designed visually but provides no direct call-to-action. The message "Start the discussion" is passive — it doesn't guide the user to the input field below. A "Be the first to comment" CTA button that scrolls/focuses the input would improve usability.

**Fix:** Add an anchor/scroll button:
```tsx
<Button variant="outline" size="sm" className="mt-3" onClick={() => inputRef.current?.focus()}>
  Be the first to comment
</Button>
```

---

### L10. Topbar: Breadcrumbs Show "Details" for All UUID Routes (Generic)

**File:** [`components/layout/Topbar.tsx`](components/layout/Topbar.tsx:45-49)

```tsx
if (uuidRegex.test(segment)) {
    label = "Details"
}
```

Every UUID-based route (finding detail, project detail, etc.) shows "Details" in breadcrumbs. While this avoids exposing raw UUIDs, it's not helpful for navigation — users can't distinguish between "Project Details" and "Finding Details" in the breadcrumb trail.

A better approach would be to fetch the name from context or pass it from the page component.

**Fix:** Pass a `breadcrumbLabel` prop or fetch from URL state:
```tsx
// Could use the segment position to infer context:
// /findings/[uuid] → "Finding Details"
// /projects/[uuid] → "Project Details"
```

---

## ✅ What's Working Well (Strengths)

This section highlights design decisions that are well-executed:

| Area | What's Good |
|------|------------|
| **Design System** | Comprehensive CSS variable-based token system with proper light/dark mode support. 49 semantic color tokens covering surfaces, text, borders, brand, severity, status, and charts. |
| **Dark Mode** | Full dark mode across all components. Proper HSL color space with semantic naming (`--fg-muted`, `--border-strong`). Sun/moon toggle animation is smooth. |
| **Empty States** | Well-designed empty states throughout — DiscussionThread dashed border, DynamicTeamManagement dashed card, Topbar notification empty with faded Inbox icon. |
| **Loading States** | Topbar shows shimmer skeleton during auth loading. Invite page shows centered spinner during validation. Sidebar shows skeleton in collapsed state. |
| **Animations** | Consistent `animate-in fade-in slide-in-from-bottom` on page entries. Comments slide in. 300ms duration feels snappy. `active:scale-[0.98]` on buttons for tactile feedback. |
| **Typography** | Good hierarchy: `text-[9px] font-black uppercase tracking-[0.2em]` for section labels, `text-[10px]` for secondary info, `text-sm` for body. Tabular numbers for data. |
| **Breadcrumbs** | UUID masking is clever. Chevron separators. Loading skeleton state. |
| **Notifications** | Dropdown is well-designed: max-h with scroll, read/unread visual distinction (bg-primary/5), relative timestamps, mark-all-read button. |
| **Sidebar** | Collapsible with smooth `transition-all duration-300`. Icon-only tooltips on collapsed state with slide animation. Active indicator dot with `animate-pulse`. |
| **Sheet Panel** | `w-[95vw]` on mobile for full-width, `sm:max-w-xl` on desktop. `overflow-y-auto` for scrollable content. |
| **Chat Bubbles** | Own messages right-aligned with primary bg + `rounded-tr-none`. Others left-aligned with panel bg + `rounded-tl-none`. This is a proper chat UI pattern. |
| **Status Stepper** | Allowed/disallowed transitions visually distinguished via `disabled` prop. Each step has icon + label. |
| **Filters** | Flex-wrap toolbar with clear button. Select dropdowns for severity/status/project. Search input for text filtering. |
| **Cross-device Theme Sync** | `ThemeSyncProvider` persists theme to DB for sync across devices — enterprise-grade feature. |
| **Realtime Typing Indicator** | 3-dot bounce animation in DiscussionThread. Presence sync shows who's typing. |

---

## 📐 Responsive Breakpoint Analysis

### Tailwind Breakpoints Used:

| Breakpoint | Usage | Assessment |
|------------|-------|------------|
| `sm:` (640px) | Stat cards grid, sheet width | ✅ Appropriate |
| `md:` (768px) | Organization badge visibility | ⚠️ Underutilized — missing for stat cards, tabs |
| `lg:` (1024px) | Sidebar grid, chart grids, detail page sidebar | ✅ Appropriate |
| No `xl:` or `2xl:` | — | ⚠️ No wide-screen optimizations |

### Missing Breakpoints:

1. **`md:` for stat cards** — 5 cards go from 1→2→5 columns. Missing a 3-column step at `md:`.
2. **`md:` for detail page sidebar** — Sidebar is either collapsed (mobile) or full (1024px+). A `md:` hybrid (compact sidebar) would serve tablets better.
3. **`xl:` for wide screens** — Dashboard and finding list have `max-w-[1440px]` but no `xl:` optimizations for 1920px+ screens.
4. **No mobile-first tab adaptation** — Tabs never collapse into a dropdown/menu on mobile.

---

## 🎯 Priority Action Items

### Immediate (Sprint 1):
1. **[C1]** Fix `overflow-hidden` → `overflow-x-auto` on TrackerGrid table
2. **[H1]** Add `flex-wrap` to status stepper buttons
3. **[H3]** Add `overflow-x-auto` to tab navigation

### Short-term (Sprint 2):
4. **[C2]** Replace `scrollbar-none` with `scrollbar-thin` on sidebar nav
5. **[H2]** Add touch-friendly edit/delete for DiscussionThread comments
6. **[M1]** Add `md:grid-cols-3` to stat cards grid
7. **[M2]** Add pagination ellipsis (limit rendered page buttons)

### Mid-term (Sprint 3):
8. **[H4]** Add error state with retry to TrackerGrid
9. **[M3]** Reduce send button from 80×80px to more proportional size
10. **[M4]** Increase touch targets to 44px minimum
11. **[M5]** Reorder sidebar below main content on mobile
12. **[M7]** Add loading skeleton for table data

### Backlog:
13. All 10 LOW-severity items — polish pass

---

## 📊 Overall UI/UX Score

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Visual Design | ⭐⭐⭐⭐ | Clean, modern design system. Consistent spacing and typography. |
| Dark Mode | ⭐⭐⭐⭐⭐ | Comprehensive. Every component respects dark mode with proper contrast. |
| Responsiveness | ⭐⭐⭐ | Good on desktop. **Critical bugs on mobile/tablet** (C1, H1, H3). |
| Accessibility | ⭐⭐ | Touch targets below WCAG. No focus indicators audit performed (out of scope). No screen reader labels verified. |
| Loading States | ⭐⭐⭐ | Good for auth/topbar. Missing for data tables. |
| Empty States | ⭐⭐⭐⭐ | Well-designed empty states throughout. |
| Animation | ⭐⭐⭐⭐ | Consistent entry animations. Missing exit animations. |
| Cross-device | ⭐⭐⭐⭐ | Theme sync to DB. HttpOnly cookies for invite. Good patterns. |
| **OVERALL** | **⭐⭐⭐** | **Solid desktop UX. Mobile needs critical fixes before production.** |