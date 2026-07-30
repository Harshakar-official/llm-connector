import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/**
 * /super-admin → Redirect to Dashboard
 * Handles breadcrumb navigation and accidental clicks on "Super Admin" segment.
 * Enterprise pattern: section root redirects to its primary sub-page.
 */
export default function SuperAdminRootPage() {
  redirect("/super-admin/dashboard")
}
