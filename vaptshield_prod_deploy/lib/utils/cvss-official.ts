import { CVSS40 } from '@pandatix/js-cvss'

/**
 * Z+ SECURITY: Official CVSS 4.0 Calculation Engine
 * This utility serves as the single source of truth for all CVSS calculations
 * across Manual, Template, and AI-generated findings.
 */

export interface CvssResult {
  score: number
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  vector: string
  success: boolean
  error?: string
}

/**
 * Calculates the official CVSS 4.0 score and severity from a vector string.
 * @param vector The CVSS 4.0 vector string (e.g., CVSS:4.0/AV:N/AC:L/...)
 */
export function calculateCvss40(vector: string): CvssResult {
  if (!vector || vector === 'N/A' || !vector.startsWith('CVSS:4.0')) {
    return {
      score: 0,
      severity: 'informational',
      vector: vector || 'N/A',
      success: false,
      error: 'Invalid or missing CVSS 4.0 vector'
    }
  }

  try {
    const cvss = new CVSS40(vector)
    const score = cvss.Score()

    if (typeof score !== 'number' || isNaN(score)) {
      throw new Error('Calculation resulted in NaN')
    }

    return {
      score: Number(score.toFixed(1)),
      severity: getSeverityFromScore(score),
      vector: vector,
      success: true
    }
  } catch (err) {
    console.error(`[CVSS Engine] Calculation failed for vector: ${vector}`, err)
    return {
      score: 0,
      severity: 'informational',
      vector: vector,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown calculation error'
    }
  }
}

/**
 * Maps a numeric score to the official CVSS severity categories.
 */
export function getSeverityFromScore(score: number): 'critical' | 'high' | 'medium' | 'low' | 'informational' {
  if (score >= 9.0) return 'critical'
  if (score >= 7.0) return 'high'
  if (score >= 4.0) return 'medium'
  if (score > 0) return 'low'
  return 'informational'
}

/**
 * Checks if a score and vector are mathematically consistent.
 */
export function verifyConsistency(vector: string, score: number): boolean {
  const result = calculateCvss40(vector)
  if (!result.success) return false
  // Allow a small margin for rounding differences (e.g., 7.50 vs 7.5)
  return Math.abs(result.score - score) < 0.15
}
