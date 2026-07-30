import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

const rateLimiters = new Map<string, Ratelimit>()

export async function slidingWindowRateLimit(
  identifier: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ success: boolean }> {
  const key = `${maxRequests}/${windowSeconds}`
  if (!rateLimiters.has(key)) {
    rateLimiters.set(
      key,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds}s`),
        analytics: true,
        prefix: "ratelimit:",
      }),
    )
  }
  const limiter = rateLimiters.get(key)!
  const result = await limiter.limit(identifier)
  return { success: result.success }
}
