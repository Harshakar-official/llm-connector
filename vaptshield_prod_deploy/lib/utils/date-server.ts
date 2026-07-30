export interface DateRange {
  from: Date
  to: Date
  isCustom: boolean
}

export function getServerDateRange(searchParams: { from?: string; to?: string; range?: string }): DateRange {
  const rangeParam = searchParams.range
  const fromParam = searchParams.from
  const toParam = searchParams.to

  // Client always sends explicit ISO datetimes with local TZ boundaries.
  // Use them directly to avoid server timezone mismatch (Vercel runs UTC).
  if (fromParam && toParam) {
    return {
      from: new Date(fromParam),
      to: new Date(toParam),
      // "custom" means user picked dates from calendar; all presets also send from/to now
      isCustom: rangeParam === "custom",
    }
  }

  // Fallback: no params at all — default to last 30 days (server local time)
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)

  return {
    from,
    to,
    isCustom: false,
  }
}
