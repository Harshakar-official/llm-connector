import { Queue } from 'bullmq'
import Redis from 'ioredis'

// ─── Z+ SECURITY: AI Queue Management ───
// We use BullMQ to manage AI request bursts and enforce platform-wide rate limits.

const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL?.replace('https://', 'rediss://') || ''
if (!redisUrl) {
  throw new Error("REDIS_URL or UPSTASH_REDIS_REST_URL must be configured for AI queue")
}
const redisConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
})

export const aiQueue = new Queue('ai-requests', {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
})

// Platform-wide rate limiter: Max 25 jobs per minute
export const AI_RATE_LIMIT = 25
