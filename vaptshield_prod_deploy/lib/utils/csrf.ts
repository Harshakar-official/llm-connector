import { NextResponse } from "next/server"

const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_APP_URL,
  ...(process.env.CSRF_ALLOWED_ORIGINS || "").split(",").filter(Boolean),
].filter((s): s is string => !!s))

export function validateOrigin(req: Request): { valid: boolean; error?: NextResponse } {
  const origin = req.headers.get("origin")
  const referer = req.headers.get("referer")

  // If no origin header (same-origin request from server-side), skip check
  if (!origin && !referer) return { valid: true }

  // Allow requests with no origin but with referer (e.g., some server-side clients)
  if (!origin && referer) return { valid: true }

  // Allow requests from known origins
  if (origin && ALLOWED_ORIGINS.has(origin)) return { valid: true }

  // In development, allow localhost
  if (process.env.NODE_ENV === "development") {
    if (origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:")) {
      return { valid: true }
    }
  }

  return {
    valid: false,
    error: NextResponse.json({ error: "CSRF validation failed: invalid origin" }, { status: 403 }),
  }
}
