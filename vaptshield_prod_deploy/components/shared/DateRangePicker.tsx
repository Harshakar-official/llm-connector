"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { DateRange } from "react-day-picker"

type Preset = "today" | "yesterday" | "7d" | "30d" | "90d" | "this_month" | "last_month" | "custom"

const presets: { label: string; value: Preset; getRange: () => DateRange }[] = [
  {
    label: "Today",
    value: "today",
    getRange: () => ({ from: new Date(), to: new Date() }),
  },
  {
    label: "Yesterday",
    value: "yesterday",
    getRange: () => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return { from: d, to: d }
    },
  },
  {
    label: "Last 7 days",
    value: "7d",
    getRange: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 7)
      return { from, to }
    },
  },
  {
    label: "Last 30 days",
    value: "30d",
    getRange: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 30)
      return { from, to }
    },
  },
  {
    label: "Last 90 days",
    value: "90d",
    getRange: () => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 90)
      return { from, to }
    },
  },
  {
    label: "This month",
    value: "this_month",
    getRange: () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from, to }
    },
  },
  {
    label: "Last month",
    value: "last_month",
    getRange: () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const to = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from, to }
    },
  },
  {
    label: "Custom",
    value: "custom",
    getRange: () => ({ from: undefined, to: undefined }),
  },
]

function formatDateRange(from?: Date, to?: Date): string {
  if (!from && !to) return "Select dates"
  if (from && to) {
    return `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  }
  if (from) return `From ${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  return "Select dates"
}

function getPresetLabel(value: Preset): string {
  return presets.find(p => p.value === value)?.label || "Select dates"
}

export function DateRangePicker() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const rangeParam = searchParams.get("range")
  const fromParam = searchParams.get("from")
  const toParam = searchParams.get("to")

  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(
    rangeParam && presets.find(p => p.value === rangeParam) ? (rangeParam as Preset) : null
  )
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    if (fromParam && toParam) {
      return { from: new Date(fromParam), to: new Date(toParam) }
    }
    if (selectedPreset) {
      return presets.find(p => p.value === selectedPreset)?.getRange() || { from: undefined, to: undefined }
    }
    return { from: undefined, to: undefined }
  })
  const [open, setOpen] = useState(false)

  function handlePresetClick(preset: Preset) {
    if (preset === "custom") {
      setSelectedPreset(preset)
      return
    }

    const range = presets.find(p => p.value === preset)?.getRange() || { from: undefined, to: undefined }
    setDateRange(range)
    setSelectedPreset(preset)

    const params = new URLSearchParams(searchParams.toString())

    // Always send explicit ISO datetimes with local TZ boundaries
    // to avoid server timezone mismatch (server may be UTC while user is IST/etc.)
    if (range.from) {
      const fromDate = new Date(range.from)
      fromDate.setHours(0, 0, 0, 0)
      params.set("from", fromDate.toISOString())
    }
    if (range.to) {
      const toDate = new Date(range.to)
      toDate.setHours(23, 59, 59, 999)
      params.set("to", toDate.toISOString())
    }
    // Keep range param for preset identification (isCustom flag on server)
    params.set("range", preset)

    router.push(`?${params.toString()}`)
    setOpen(false)
  }

  function handleCalendarSelect(range: DateRange | undefined) {
    if (range?.from && range?.to) {
      setDateRange(range)
      setSelectedPreset("custom")

      const params = new URLSearchParams(searchParams.toString())
      // Use local day boundaries converted to ISO to avoid UTC date shift
      const fromDate = new Date(range.from)
      fromDate.setHours(0, 0, 0, 0)
      const toDate = new Date(range.to)
      toDate.setHours(23, 59, 59, 999)
      params.set("from", fromDate.toISOString())
      params.set("to", toDate.toISOString())
      params.delete("range")
      router.push(`?${params.toString()}`)
    }
  }

  const displayText = selectedPreset && selectedPreset !== "custom"
    ? getPresetLabel(selectedPreset)
    : formatDateRange(dateRange.from, dateRange.to)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-2 border-border font-normal",
            !dateRange.from && "text-fg-muted"
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          <span className="hidden lg:inline">{displayText}</span>
          <ChevronDown className="h-3 w-3 text-fg-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="border-r border-border p-2">
            <div className="space-y-1">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetClick(preset.value)}
                  className={cn(
                    "w-full rounded-md px-3 py-1.5 text-sm text-left transition-colors",
                    selectedPreset === preset.value
                      ? "bg-primary-subtle text-primary"
                      : "text-fg-muted hover:text-fg hover:bg-panel-hover"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
              disabled={(date) => date > new Date()}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}