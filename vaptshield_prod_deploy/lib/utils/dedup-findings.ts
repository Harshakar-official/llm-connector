export interface FindingInput {
  title?: string
  severity?: string
  description?: string
  target?: string
  url?: string
  endpoint_url?: string
  raw_evidence?: string
  extra?: unknown
  finding_name?: string
  name?: string
  targets?: string[]
  params?: string[]
  attacks?: string[]
  instance_count?: number
}

function normalizeForDedup(str: string): string {
  return str.toLowerCase().replace(/\/$/, "").replace(/https?:\/\//, "").trim()
}

export function dedupFindings(inputs: FindingInput[]): FindingInput[] {
  const seen = new Map<string, FindingInput>()
  for (const input of inputs) {
    const title = (input.finding_name || input.title || input.name || "").toLowerCase().trim()
    const target = Array.isArray(input.targets)
      ? input.targets.map(normalizeForDedup).join(",")
      : normalizeForDedup(input.target || input.url || "")
    const key = `${title}::${target}`
    if (seen.has(key)) {
      const existing = seen.get(key)!
      existing.instance_count = (existing.instance_count || 1) + 1
      if (input.targets) {
        const existingTargets = new Set(existing.targets || [])
        for (const t of input.targets) existingTargets.add(t)
        existing.targets = Array.from(existingTargets)
      }
    } else {
      seen.set(key, { ...input })
    }
  }
  return Array.from(seen.values())
}

function isFalsePositive(finding: FindingInput): boolean {
  const title = (finding.finding_name || finding.title || finding.name || "").toLowerCase()
  const falsePositivePatterns = [
    "false positive",
    "test",
    "example.com",
    "internal.test",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
  ]
  return falsePositivePatterns.some(p => title.includes(p))
    || falsePositivePatterns.some(p => (finding.target || "").includes(p))
}

export function filterFalsePositives(findings: FindingInput[]): FindingInput[] {
  return findings.filter(f => !isFalsePositive(f))
}
