import { lookup as dnsLookup } from "dns"
import { promisify } from "util"
import net from "net"

const dnsLookupAsync = promisify(dnsLookup)

const ALLOWED_SCHEMES = ["http:", "https:"]

/**
 * Hostnames / IPs that must never be scanned.
 * Covers cloud metadata endpoints across all major providers.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "169.254.169.254",
  "metadata.aws.internal",
  "0.0.0.0",
  "::",
  "[::]",
])

/**
 * Blocked hostname suffixes — any hostname ending with these is rejected.
 */
const BLOCKED_SUFFIXES = [
  ".internal",
  ".local",
  ".localhost",
]

/**
 * Determine whether a resolved IP string is private / reserved / dangerous.
 * Handles IPv4 and IPv6 (including ::ffff:127.0.0.1 mapped form).
 */
function isPrivateIp(ip: string): boolean {
  // Normalize IPv6-mapped IPv4: ::ffff:127.0.0.1 → 127.0.0.1
  const normalized = ip.replace(/^::ffff:/i, "").replace(/^\[|\]$/g, "")

  // IPv4 checks
  if (net.isIPv4(normalized)) {
    const parts = normalized.split(".").map(Number)
    const [a, b] = parts

    if (a === 0) return true // 0.0.0.0/8
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0 && parts[2] === 0) return true // 192.0.0.0/24
    if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 benchmark
    return false
  }

  // IPv6 checks
  if (net.isIPv6(normalized)) {
    const lower = normalized.toLowerCase()
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true // loopback
    if (lower === "::") return true // unspecified
    if (lower.startsWith("fe80")) return true // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true // ULA fc00::/7
    if (lower.startsWith("ff")) return true // multicast
    return false
  }

  // Unknown format — treat as private (fail-closed)
  return true
}

export interface SsrfCheckResult {
  safe: boolean
  error?: string
  resolvedIp?: string
}

/**
 * Comprehensive SSRF validation for a target URL.
 *
 * Checks:
 * 1. Valid URL with http/https scheme only
 * 2. Hostname not in blocked list
 * 3. No decimal/octal/hex IP bypass
 * 4. No userinfo (no credentials in URL)
 * 5. DNS resolution check — resolves all A/AAAA records, rejects private IPs
 * 6. DNS rebinding protection — resolves once at validation time
 *
 * Note: Full TOCTOU-safe DNS rebinding protection would require resolving the
 * hostname again at the moment ZAP connects, which is outside this function's
 * scope. The worker should ideally pass the resolved IP to ZAP.
 */
export async function validateTargetUrl(targetUrl: string): Promise<SsrfCheckResult> {
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return { safe: false, error: "Invalid URL format" }
  }

  // Scheme check — only http/https
  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return { safe: false, error: `Scheme "${parsed.protocol}" is not allowed. Only http and https are permitted.` }
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")

  // Userinfo check — reject URLs with embedded credentials
  if (parsed.username || parsed.password) {
    return { safe: false, error: "URLs with embedded credentials are not allowed" }
  }

  // Blocked hostname check
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, error: "Security restriction: Cannot scan internal or cloud metadata endpoints." }
  }

  // Blocked suffix check
  for (const suffix of BLOCKED_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { safe: false, error: "Security restriction: Cannot scan internal hostnames." }
    }
  }

  // If hostname is already an IP literal — check directly (no DNS lookup needed)
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { safe: false, error: "Security restriction: Cannot scan internal IP addresses." }
    }
    return { safe: true, resolvedIp: hostname }
  }

  // Decimal, octal, hex IP encodings (e.g. 2130706433, 0177.0.0.1, 0x7f.0.0.1)
  // These pass `new URL()` as hostnames but resolve to private IPs.
  // `net.isIP` returns 0 for these forms, so they reach DNS lookup below.
  // DNS lookup will resolve them to the actual private IP and we catch it there.

  // DNS resolution — resolve all addresses and check each
  try {
    const addresses = await dnsLookupAsync(hostname, { all: true })
    if (addresses.length === 0) {
      return { safe: false, error: "Could not resolve hostname" }
    }
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return { safe: false, error: "Security restriction: Hostname resolves to an internal/private IP address." }
      }
    }
    // Return the first resolved IP for TOCTOU protection
    return { safe: true, resolvedIp: addresses[0].address }
  } catch {
    return { safe: false, error: "Could not resolve hostname — invalid or non-existent domain" }
  }

  return { safe: true }
}
