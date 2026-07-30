"use client"

import { useState, useEffect, useRef } from "react"

interface SeverityCountProps {
  label: string
  count: number
  color: string
}

export default function SeverityCount({ label, count, color }: SeverityCountProps) {
  const [animated, setAnimated] = useState(0)
  const counted = useRef(false)

  useEffect(() => {
    if (counted.current) { setAnimated(count); return }
    counted.current = true
    if (count === 0) { setAnimated(0); return }
    const duration = 800
    const steps = 20
    const increment = count / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= count) {
        setAnimated(count)
        clearInterval(timer)
      } else {
        setAnimated(Math.round(current))
      }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [count])

  return (
    <div className="text-center min-w-[60px]">
      <div className={`text-xl font-semibold font-mono ${color} tabular-nums`}>
        {animated}
      </div>
      <div className="text-[10px] text-fg-muted font-medium uppercase tracking-wider">{label}</div>
    </div>
  )
}