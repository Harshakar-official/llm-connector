"use client"

import { useRef, useState, useEffect, KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

interface OtpInputProps {
  length?: number
  onComplete: (otp: string) => void
  disabled?: boolean
  error?: boolean
  className?: string
}

export function OtpInput({
  length = 6,
  onComplete,
  disabled = false,
  error = false,
  className,
}: OtpInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(""))
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (error) {
      setValues(Array(length).fill(""))
      inputRefs.current[0]?.focus()
    }
  }, [error, length])

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return

    const newValues = [...values]
    newValues[index] = value.slice(-1)
    setValues(newValues)

    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    const otp = newValues.join("")
    if (otp.length === length && !newValues.includes("")) {
      onComplete(otp)
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length)
    const newValues = [...values]
    for (let i = 0; i < pastedData.length; i++) {
      newValues[i] = pastedData[i]
    }
    setValues(newValues)

    const lastFilledIndex = Math.min(pastedData.length, length - 1)
    inputRefs.current[lastFilledIndex]?.focus()

    const otp = newValues.join("")
    if (otp.length === length && !newValues.includes("")) {
      onComplete(otp)
    }
  }

  return (
    <div className={cn("flex gap-2 justify-center", className)}>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
      `}</style>
      {values.map((value, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className={cn(
            "w-12 h-12 text-center text-xl font-mono font-semibold",
            "bg-bg border rounded-md",
            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
            "transition-colors",
            error
              ? "border-danger focus:ring-danger/20 focus:border-danger"
              : "border-border",
            disabled && "opacity-50 cursor-not-allowed",
            error && "animate-[shake_0.3s_ease-in-out]"
          )}
        />
      ))}
    </div>
  )
}
