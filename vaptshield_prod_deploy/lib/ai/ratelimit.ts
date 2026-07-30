import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ─── Z+ SECURITY: Shared AI Rate Limiter ───
// All AI endpoints share a single global rate limiter to ensure
// the platform stays under Groq's free tier limit of 30 req/min.
// Individual endpoints also have per-user rate limits.

let redisInstance: Redis | null = null
let globalRatelimitInstance: Ratelimit | null = null

const getRedis = () => {
  if (!redisInstance) redisInstance = Redis.fromEnv()
  return redisInstance
}

/**
 * Shared global rate limiter for ALL AI endpoints.
 * 25 req/min leaves a 5 req/min safety margin below Groq's 30 req/min free tier.
 */
export const getGlobalAiRatelimit = () => {
  if (!globalRatelimitInstance) {
    const redis = getRedis()
    globalRatelimitInstance = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(25, '60 s'),
    })
  }
  return globalRatelimitInstance
}

/**
 * Create a per-user rate limiter with the given limit.
 * Each endpoint can have its own per-user limit.
 */
export const createUserRatelimit = (maxRequests: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}` = '60 s') => {
  const redis = getRedis()
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, window),
    analytics: true,
  })
}