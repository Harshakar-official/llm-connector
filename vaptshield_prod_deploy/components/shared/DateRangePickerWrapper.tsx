"use client"

import { Suspense } from "react"
import { DateRangePicker } from "./DateRangePicker"

export function DateRangePickerWrapper() {
  return (
    <Suspense fallback={
      <div className="h-9 w-[140px] bg-bg-muted animate-pulse rounded-md" />
    }>
      <DateRangePicker />
    </Suspense>
  )
}