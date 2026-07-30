// ============================================================
// VAPTShield — RBAC Permission System
// Based on CLAUDE.md Section 4
// ============================================================

import type { Role } from "@/lib/supabase/types"

// ============================================================
// Action Types — every action from the permission matrix
// ============================================================

export const ACTIONS = [
  // Platform
  "platform:create_org",
  "platform:delete_org",
  "platform:manage_quotas",
  "platform:view_analytics",
  "platform:view_org_security_data",

  // Organization
  "org:edit_settings",
  "org:manage_integrations",

  // Users
  "users:invite_any",
  "users:invite_guest_security_eng",
  "users:promote_to_admin",
  "users:promote_guest_security_eng",
  "users:delete",
  "users:view_all",
  "users:view_names_only",

  // Projects
  "projects:create",
  "projects:edit",
  "projects:delete",
  "projects:archive",
  "projects:view_assigned",
  "projects:assign_members",

  // Findings
  "findings:create",
  "findings:edit_any",
  "findings:edit_own",
  "findings:remediate",
  "findings:delete",
  "findings:approve_scan",
  "findings:upload_poc",

  // Scanners
  "scanners:kali_terminal",
  "scanners:zap_proxy",
  "scanners:cicd_configure",
  "scanners:view_history",

  // Reports
  "reports:generate",
  "reports:edit",
  "reports:view",
  "reports:export",

  // AI
  "ai:vuln_generator",
  "ai:normalize",
  "ai:patch_suggester",
] as const

export type Action = (typeof ACTIONS)[number]

// ============================================================
// Permission Matrix — who can do what
// ============================================================

// Format: Record<Action, Role[]>
// A role can perform an action if they are in the allowed array
const PERMISSION_MATRIX: Record<Action, readonly Role[]> = {
  // Platform
  "platform:create_org": ["super_admin"],
  "platform:delete_org": ["super_admin"],
  "platform:manage_quotas": ["super_admin"],
  "platform:view_analytics": ["super_admin"],
  "platform:view_org_security_data": [], // super_admin explicitly blocked

  // Organization
  "org:edit_settings": ["admin"],
  "org:manage_integrations": ["admin"],

  // Users
  "users:invite_any": ["admin"],
  "users:invite_guest_security_eng": ["admin", "program_manager"],
  "users:promote_to_admin": ["admin"],
  "users:promote_guest_security_eng": ["admin", "program_manager"],
  "users:delete": ["admin"],
  "users:view_all": ["admin", "program_manager", "security_engineer"],
  "users:view_names_only": ["security_engineer", "developer"],

  // Projects
  "projects:create": ["admin", "program_manager"],
  "projects:edit": ["admin", "program_manager"],
  "projects:delete": ["admin"],
  "projects:archive": ["admin", "program_manager", "security_engineer"],
  "projects:view_assigned": ["admin", "program_manager", "security_engineer", "guest", "developer"],
  "projects:assign_members": ["admin", "program_manager"],

  // Findings
  "findings:create": ["admin", "program_manager", "security_engineer"],
  "findings:edit_any": ["admin", "program_manager"],
  "findings:edit_own": ["admin", "program_manager", "security_engineer"],
  "findings:remediate": ["admin", "program_manager", "security_engineer", "developer"],
  "findings:delete": ["admin", "program_manager", "security_engineer"],
  "findings:approve_scan": ["admin", "program_manager", "security_engineer"],
  "findings:upload_poc": ["admin", "program_manager", "security_engineer", "developer"],

  // Scanners
  "scanners:kali_terminal": ["admin", "security_engineer"],
  "scanners:zap_proxy": ["admin", "security_engineer"],
  "scanners:cicd_configure": ["admin", "security_engineer"],
  "scanners:view_history": ["admin", "program_manager", "security_engineer"],

  // Reports
  "reports:generate": ["admin", "program_manager", "security_engineer"],
  "reports:edit": ["admin", "program_manager", "security_engineer"],
  "reports:view": ["admin", "program_manager", "security_engineer", "guest", "developer"],
  "reports:export": ["admin", "program_manager", "security_engineer", "guest", "developer"],

  // AI
  "ai:vuln_generator": ["admin", "program_manager", "security_engineer"],
  "ai:normalize": ["admin", "program_manager", "security_engineer"],
  "ai:patch_suggester": ["admin", "program_manager", "security_engineer"],
} as const

// ============================================================
// Core Permission Functions
// ============================================================

/**
 * Check if a role has permission to perform an action
 */
export function hasPermission(role: Role, action: Action): boolean {
  const allowed = PERMISSION_MATRIX[action]
  return allowed.includes(role)
}

/**
 * Get all actions a role can perform
 */
export function getPermittedActions(role: Role): Action[] {
  return ACTIONS.filter((action) => hasPermission(role, action))
}

/**
 * Check if role change is allowed based on inviter's role
 * Admin can promote any role (except super_admin)
 * Program Manager can only invite/promote guest, security_engineer, developer
 * Security Engineer and Guest cannot invite anyone
 */
export function canInviteRole(
  inviterRole: Role,
  targetRole: Role
): boolean {
  if (inviterRole === "admin") {
    return targetRole !== "super_admin"
  }
  if (inviterRole === "program_manager") {
    return targetRole === "guest" || targetRole === "security_engineer" || targetRole === "developer"
  }
  return false
}

/**
 * Check if a role change is allowed
 * PM can only swap guest, security_engineer, developer
 */
export function canChangeRole(
  currentUserRole: Role,
  targetCurrentRole: Role,
  targetNewRole: Role
): boolean {
  // Admin can change anyone (except to super_admin)
  if (currentUserRole === "admin") {
    return targetNewRole !== "super_admin"
  }

  // PM can only swap guest, security_engineer, developer
  if (currentUserRole === "program_manager") {
    const allowedRoles: Role[] = ["guest", "security_engineer", "developer"]
    return allowedRoles.includes(targetCurrentRole) && allowedRoles.includes(targetNewRole)
  }

  return false
}

/**
 * Get scanner-enabled roles
 */
export function canUseScanners(role: Role): boolean {
  return hasPermission(role, "scanners:kali_terminal")
}

// ============================================================
// Utility
// ============================================================

/**
 * Human-readable role display names
 */
export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  program_manager: "Program Manager",
  security_engineer: "Security Engineer",
  guest: "Guest",
  developer: "Developer",
}

/**
 * Role display colors for badges (Tailwind classes)
 */
export const ROLE_BADGE_CLASSES: Record<Role, { label: string; className: string }> = {
  super_admin: {
    label: "Super Admin",
    className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  },
  admin: {
    label: "Admin",
    className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  },
  program_manager: {
    label: "PM",
    className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  },
  security_engineer: {
    label: "Security",
    className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  },
  guest: {
    label: "Guest",
    className: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  },
  developer: {
    label: "Developer",
    className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
  },
}

/**
 * Get admin-only routes (strict - requires admin role)
 * Note: /users is NOT here because PM also needs access for invites
 * Permission checks are done inside the page itself
 */
export function isAdminOnlyRoute(pathname: string): boolean {
  const adminRoutes = [
    "/organization",
    "/audit",
  ]
  return adminRoutes.some((route) => pathname.startsWith(route))
}

/**
 * Get routes where PM has some access but not full admin
 * PM can access /users for viewing and inviting guest/security_eng
 */
export function isPMAccessibleRoute(pathname: string): boolean {
  return pathname.startsWith("/users")
}

/**
 * Get scanner routes
 */
export function isScannerRoute(pathname: string): boolean {
  return pathname.startsWith("/scanner")
}
