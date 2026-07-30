import { getServerClient } from "@/lib/supabase/server"
import { OrgGrowthChartClient } from "./OrgGrowthChartClient"
import type { DateRange } from "@/lib/utils/date-server"

interface OrgGrowthChartProps {
  dateRange: DateRange
}

/**
 * Organization Growth Chart — Server Component
 * Fetches real cumulative monthly organization counts from the database.
 * Z+ SECURITY: Uses server client (anon key + session) — no service role key needed.
 */
export async function OrgGrowthChart({ dateRange }: OrgGrowthChartProps) {
  const supabase = await getServerClient()

  const fromISO = dateRange.from.toISOString()
  const toISO = dateRange.to.toISOString()

  // Fetch organizations within date range, ordered by creation date
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("created_at")
    .gte("created_at", fromISO)
    .lte("created_at", toISO)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[OrgGrowthChart] Failed to fetch organizations:", error.message)
    return <OrgGrowthChartClient data={[]} />
  }

  if (!orgs || orgs.length === 0) {
    return <OrgGrowthChartClient data={[]} />
  }

  // Build cumulative monthly data from real org creation dates
  const monthlyMap = new Map<string, number>()

  for (const org of orgs) {
    const date = new Date(org.created_at)
    const key = date.toLocaleString("en-US", { month: "short", year: "numeric" })
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1)
  }

  // Generate all months from the first org creation to now (or `to`) to pad with zeros
  if (orgs.length > 0) {
      const firstDate = new Date(orgs[0].created_at);
      const endDate = dateRange.to < new Date() ? dateRange.to : new Date();
      
      let current = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
      while (current <= endDate) {
          const key = current.toLocaleString("en-US", { month: "short", year: "numeric" });
          if (!monthlyMap.has(key)) {
              monthlyMap.set(key, 0);
          }
          current.setMonth(current.getMonth() + 1);
      }
  }

  // Convert to sorted array with cumulative counts
  const sortedEntries = Array.from(monthlyMap.entries()).sort((a, b) => {
    const [aMonth, aYear] = a[0].split(" ")
    const [bMonth, bYear] = b[0].split(" ")
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const yearDiff = parseInt(aYear) - parseInt(bYear)
    if (yearDiff !== 0) return yearDiff
    return months.indexOf(aMonth) - months.indexOf(bMonth)
  })

  let cumulative = 0
  const chartData = sortedEntries.map(([name, count]) => {
    cumulative += count
    return { name, count: cumulative }
  })


  return <OrgGrowthChartClient data={chartData} />
}
