import { Redis } from '@upstash/redis'
import { createHash } from 'crypto'

// ─── Z+ SECURITY: AI Response Caching ───
// Prevents redundant API calls and reduces costs by caching structured responses.

let redisInstance: Redis | null = null
const getRedis = () => {
  if (!redisInstance) redisInstance = Redis.fromEnv()
  return redisInstance
}

export async function cachedAiCall<T>(
  input: string,
  fn: () => Promise<T>
): Promise<T> {
  // 1. Generate unique cache key using SHA-256
  const hash = createHash('sha256').update(input).digest('hex')
  const cacheKey = `ai-cache:${hash}`

  try {
    // 2. Check cache
    const redis = getRedis()
    const cached = await redis.get(cacheKey)
    if (cached) {
      console.log(`[AI Cache] Hit: ${hash.slice(0, 8)}...`)
      return cached as T
    }

    // 3. Execute AI call
    const result = await fn()

    // 4. Store in cache for 1 hour (3600 seconds)
    await redis.setex(cacheKey, 3600, result)
    console.log(`[AI Cache] Miss: ${hash.slice(0, 8)}... (Cached for 1h)`)

    return result
  } catch (error) {
    console.error("[AI Cache] Error:", error)
    // On cache failure, fall back to direct execution
    return await fn()
  }
}
