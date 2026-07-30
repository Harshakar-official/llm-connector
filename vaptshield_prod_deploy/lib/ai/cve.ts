import { Redis } from '@upstash/redis'

// ─── Z+ SECURITY: CVE Validation & Cache ───
// This utility prevents AI "hallucinations" by verifying CVE IDs 
// against the official National Vulnerability Database (NVD).

let redisInstance: Redis | null = null
const getRedis = () => {
  if (!redisInstance) redisInstance = Redis.fromEnv()
  return redisInstance
}

const NVD_API_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const CACHE_TTL = 86400 // 24 hours (CVEs are generally static)

export interface NvdCveData {
  id: string
  sourceIdentifier?: string
  published?: string
  lastModified?: string
  vulnStatus?: string
  descriptions?: Array<{ lang: string; value: string }>
  metrics?: {
      cvssMetricV40?: Array<Record<string, unknown>>
      cvssMetricV31?: Array<Record<string, unknown>>
      cvssMetricV30?: Array<Record<string, unknown>>
      cvssMetricV2?: Array<Record<string, unknown>>
  }
}

export async function validateCveId(cveId: string): Promise<{ valid: boolean; details?: NvdCveData }> {
  // 1. Sanitize and Normalize input
  const sanitizedId = cveId.trim().toUpperCase()
  if (!/^CVE-\d{4}-\d{4,}$/.test(sanitizedId)) {
    return { valid: false }
  }

  const cacheKey = `cve-val:${sanitizedId}`

  try {
    // 2. Check Redis Cache first
    const redis = getRedis()
    const cached = await redis.get(cacheKey)
    if (cached) {
      console.log(`[CVE Guard] Cache Hit: ${sanitizedId}`)
      return cached as { valid: boolean; details?: NvdCveData }
    }

    // 3. Call NVD API
    console.log(`[CVE Guard] Fetching from NVD: ${sanitizedId}...`)
    
    // Note: NVD API Key is optional but highly recommended for higher rate limits.
    const headers: Record<string, string> = {}
    if (process.env.NVD_API_KEY) {
        headers['apiKey'] = process.env.NVD_API_KEY
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout for stability

    const url = new URL(NVD_API_URL)
    url.searchParams.set('cveId', sanitizedId)

    const response = await fetch(url.toString(), {
      headers,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`NVD API returned ${response.status}`)
    }

    const data = await response.json()
    const hasResults = data.totalResults > 0
    
    const result = {
      valid: hasResults,
      details: hasResults ? data.vulnerabilities[0].cve : undefined
    }

    // 4. Store in Cache (24h)
    await redis.setex(cacheKey, CACHE_TTL, result)
    
    return result

  } catch (error) {
    console.error("[CVE Guard] API Error:", (error as Error).message)
    
    // In case of NVD outage, we don't want to block the system, 
    // but we can't confirm validity either.
    return { valid: false }
  }
}

/**
 * Z+ SECURITY: Data Mapper
 * Maps complex NVD JSON structures to our simplified finding schema.
 */
export function mapNvdToFinding(nvd: NvdCveData) {
    const description = nvd.descriptions?.find(d => d.lang === 'en')?.value || "No description available."
    
    // Extract CVSS 4.0 or fallback to 3.1
    let score = 0
    let vector = "N/A"

    if (nvd.metrics?.cvssMetricV40?.[0]) {
        const m = nvd.metrics.cvssMetricV40[0] as unknown as { cvssData: { baseScore: number; vectorString: string } }
        score = m.cvssData?.baseScore || 0
        vector = m.cvssData?.vectorString || "N/A"
    } else if (nvd.metrics?.cvssMetricV31?.[0]) {
        const m = nvd.metrics.cvssMetricV31[0] as unknown as { cvssData: { baseScore: number; vectorString: string } }
        score = m.cvssData?.baseScore || 0
        vector = m.cvssData?.vectorString || "N/A"
    }

    return {
        description,
        cvss_score: score,
        cvss_vector: vector,
        published_at: nvd.published,
        last_modified_at: nvd.lastModified
    }
}
