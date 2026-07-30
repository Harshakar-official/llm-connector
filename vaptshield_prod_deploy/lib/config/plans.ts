export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise'

export interface PlanLimits {
  maxDockerSlots: number
  maxUsers: number
  maxProjects: number
  maxStorageGb: number
  maxCiScansPerDay: number
  maxScansPerMonth: number
}

export const PLAN_TIERS: Record<PlanTier, PlanLimits> = {
  free: {
    maxDockerSlots: 1,
    maxUsers: 10,
    maxProjects: 5,
    maxStorageGb: 2,
    maxCiScansPerDay: 3,
    maxScansPerMonth: 3,
  },
  starter: {
    maxDockerSlots: 2,
    maxUsers: 1000000,
    maxProjects: 1000000,
    maxStorageGb: 2,
    maxCiScansPerDay: 3,
    maxScansPerMonth: 3,
  },
  pro: {
    maxDockerSlots: 3,
    maxUsers: 1000000,
    maxProjects: 1000000,
    maxStorageGb: 20,
    maxCiScansPerDay: 3,
    maxScansPerMonth: 20,
  },
  enterprise: {
    maxDockerSlots: 10,
    maxUsers: 1000000,
    maxProjects: 1000000,
    maxStorageGb: 100,
    maxCiScansPerDay: 3,
    maxScansPerMonth: 1000,
  },
}

export const DEFAULT_PLAN: PlanTier = 'starter'

export const FREE_BASE_SLOTS = PLAN_TIERS.free.maxDockerSlots

export function getPlanLimits(tier: string): PlanLimits {
  return PLAN_TIERS[tier as PlanTier] ?? PLAN_TIERS[DEFAULT_PLAN]
}
