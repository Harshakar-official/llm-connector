// ─── Z+ SECURITY: Prompt Injection Defense ───
// This utility neutralizes prompt injection attacks before user input
// reaches any LLM. It uses a defense-in-depth approach:
//   1. Strip control characters and null bytes
//   2. Detect and neutralize common injection patterns
//   3. Wrap sanitized input in XML delimiters to separate from system instructions
//   4. Enforce maximum length limits

const MAX_INPUT_LENGTH = 8000 // 8KB max for any single user input to LLM
const MAX_CODE_LENGTH = 16000 // 16KB for code snippets (patch tab)

// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  // System prompt extraction / override
  /\bignore\s+(all\s+)?(previous|above|prior|your)\s+(instructions?|prompts?|rules?|guidelines?|directives?)\b/gi,
  /\bwhat\s+(is|are)\s+your\s+(system\s+)?(prompts?|instructions?|rules?)\b/gi,
  /\bprint\s+(your\s+)?(system\s+)?(prompts?|instructions?|rules?)\b/gi,
  /\breveal\s+(your\s+)?(system\s+)?(prompts?|instructions?|rules?)\b/gi,
  /\bdisplay\s+(your\s+)?(system\s+)?(prompts?|instructions?|rules?)\b/gi,
  /\bshow\s+(me\s+)?(your\s+)?(system\s+)?(prompts?|instructions?|rules?)\b/gi,
  // Role manipulation
  /\byou\s+are\s+now\b/gi,
  /\bact\s+as\b/gi,
  /\bpretend\s+(you\s+are|to\s+be)\b/gi,
  /\byou\s+are\s+a\s+(different|new)\b/gi,
  /\bfrom\s+now\s+on\b/gi,
  // Delimiter injection (attempts to break out of XML wrapping)
  /<\/?user_input>/gi,
  /<\/?system>/gi,
  // DAN / jailbreak patterns
  /\bDAN\s+mode\b/gi,
  /\bdeveloper\s+mode\b/gi,
  /\bjailbreak\b/gi,
  /\bdo\s+anything\s+now\b/gi,
  // Recursive injection
  /\bnew\s+instructions?\b/gi,
  /\boverride\s+(the\s+)?system\b/gi,
]

/**
 * Sanitize user input destined for an LLM prompt.
 * Returns the sanitized string wrapped in <user_input> XML delimiters
 * to create a clear separation between system instructions and user data.
 *
 * @param input - Raw user input string
 * @param maxLength - Maximum allowed length (default: MAX_INPUT_LENGTH)
 * @returns Sanitized and XML-wrapped string
 */
export function sanitizeForLLM(input: string, maxLength: number = MAX_INPUT_LENGTH): string {
  if (!input || typeof input !== 'string') return '<user_input></user_input>'

  let sanitized = input

  // Step 1: Strip null bytes and control characters (except common whitespace)
  sanitized = sanitized
    .replace(/\x00/g, '') // Null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Control chars (keep \t \n \r)
    .replace(/\u200B/g, '') // Zero-width space
    .replace(/\u200C/g, '') // Zero-width non-joiner
    .replace(/\u200D/g, '') // Zero-width joiner
    .replace(/\uFEFF/g, '') // BOM
    .replace(/\u202E/g, '') // Right-to-left override

  // Step 2: Neutralize known injection patterns by replacing with safe markers
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }

  // Step 3: Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '... [TRUNCATED]'
  }

  // Step 4: Wrap in XML delimiters to separate from system instructions
  return `<user_input>\n${sanitized}\n</user_input>`
}

/**
 * Sanitize a short label/title field (e.g., vulnerability title, language name).
 * More aggressive than sanitizeForLLM — strips all special characters.
 *
 * @param input - Raw label string
 * @param maxLength - Maximum allowed length (default: 200)
 * @returns Sanitized plain string
 */
export function sanitizeLabel(input: string, maxLength: number = 200): string {
  if (!input || typeof input !== 'string') return 'unknown'

  let sanitized = input
    .replace(/[\x00-\x1F\x7F]/g, '') // All control chars
    .replace(/[<>"'`]/g, '') // HTML/XML special chars
    .replace(/[\u200B-\u200D\uFEFF\u202E]/g, '') // Zero-width and bidi chars
    .trim()

  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength)
  }

  return sanitized || 'unknown'
}

/**
 * Sanitize a code snippet for the patch suggestion feature.
 * Preserves code structure but strips injection patterns.
 *
 * @param code - Raw code string
 * @returns Sanitized code string
 */
export function sanitizeCode(code: string): string {
  if (!code || typeof code !== 'string') return ''

  let sanitized = code
    .replace(/\x00/g, '') // Null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Control chars (keep \t \n \r)
    .replace(/[\u200B-\u200D\uFEFF\u202E]/g, '') // Zero-width and bidi chars

  // Neutralize injection patterns in code comments
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }

  if (sanitized.length > MAX_CODE_LENGTH) {
    sanitized = sanitized.slice(0, MAX_CODE_LENGTH) + '\n// ... [TRUNCATED]'
  }

  return sanitized
}

/**
 * Detect if input contains high-confidence prompt injection signals.
 * Used for logging/auditing — does NOT block the request (defense in depth).
 *
 * @param input - Raw user input
 * @returns true if injection patterns detected
 */
export function detectInjectionAttempt(input: string): boolean {
  if (!input || typeof input !== 'string') return false

  for (const pattern of INJECTION_PATTERNS) {
    // Reset lastIndex for regex with global flag
    pattern.lastIndex = 0
    if (pattern.test(input)) return true
  }
  return false
}