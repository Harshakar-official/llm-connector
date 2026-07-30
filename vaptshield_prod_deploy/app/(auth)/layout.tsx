import type { Metadata } from "next"
import { ThemeToggle } from "@/components/shared/theme-toggle"

export const metadata: Metadata = {
  title: "Authentication",
  description: "Sign in or create your VAPTShield account",
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top right theme toggle */}
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      {/* Centered auth card */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>

      {/* Footer */}
      <div className="py-6 text-center text-xs text-fg-subtle">
        VAPTShield · Enterprise VAPT Platform
      </div>
    </div>
  )
}
