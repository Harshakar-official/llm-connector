import { type NextRequest, NextResponse } from "next/server"
import { corsHeaders } from "@/lib/utils/cors"

/**
 * Z+ SECURITY: HYPER-MINIMALIST MIDDLEWARE
 * 
 * Mandate: Absolute stability on Vercel Edge Mumbai (bom1).
 * 1. ZERO DB queries.
 * 2. ZERO API calls to Supabase (mostly).
 * 3. Immediate return for public routes (Landing page /).
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isServerAction = request.headers.has("next-action")
  const isDataFetch = request.headers.has("next-router-state-tree")

  // ── CORS: Handle preflight + add headers to all responses ──────
  const origin = request.headers.get("origin")
  const cors = corsHeaders(origin)
  const isApiRoute = pathname.startsWith("/api")

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: cors,
    })
  }

  // ── API ROUTES: CORS + CSRF + body size limit ────────────
  if (isApiRoute) {
    const response = NextResponse.next()
    Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value))

    const contentLength = request.headers.get("content-length")
    if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 })
    }

    const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"]
    if (mutatingMethods.includes(request.method)) {
      const reqOrigin = request.headers.get("origin")
      const referer = request.headers.get("referer")
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
      const isDev = process.env.NODE_ENV === "development"

      if (reqOrigin) {
        const allowed = [appUrl].filter(Boolean)
        if (isDev) allowed.push("http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000")
        if (!allowed.some(a => reqOrigin.startsWith(a))) {
          return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 })
        }
      } else if (referer) {
        const allowed = [appUrl].filter(Boolean)
        if (isDev) allowed.push("http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000")
        if (!allowed.some(a => referer.startsWith(a))) {
          return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 })
        }
      }
    }

    return response
  }

  // 1. PUBLIC ROUTE BYPASS
  if (pathname === "/" || pathname === "/home-v1") {
    return NextResponse.next()
  }

  // 2. DEFINE PROTECTED ROUTES
  const dashboardPaths = [
    "/dashboard", "/projects", "/findings", "/tracker", 
    "/scanner", "/reports", "/users", "/organization", 
    "/ai", "/analytics", "/notifications", "/profile", 
    "/settings", "/audit", "/welcome", "/super-admin"
  ]

  const isProtectedPath = dashboardPaths.some(path => 
    pathname === path || pathname.startsWith(path + "/")
  )
  const isAuthPath = pathname === "/login" || pathname === "/register"

  try {
    // 3. SESSION COOKIE CHECK (Zero-API)
    const allCookies = request.cookies.getAll()
    const hasSessionCookie = allCookies.some(c => 
      c.name.includes("auth-token") || 
      c.name.startsWith("sb-")
    )

    // 4. SECURITY REDIRECTS
    
    // PROTECTED -> LOGIN
    if (isProtectedPath && !hasSessionCookie) {
      if (isServerAction || isDataFetch) {
        return NextResponse.next()
      }
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("redirect", pathname)
      return NextResponse.redirect(loginUrl)
    }

    // 5. SESSION SYNC
    const { createMiddlewareClient } = await import("@/lib/supabase/middleware")
    const { response } = await createMiddlewareClient(request)

    // ── CORS on all responses ─────────────────────────────────────
    Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value))

    // ─── Z+ SECURITY: PROGRESSIVE CSP ───
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://*.supabase.co"
    const terminalOrigins = process.env.TERMINAL_IFRAME_ORIGINS || ""
    const connectSrc = [
      "'self'",
      supabaseUrl.replace(/^https?:\/\//, 'https://'),
      supabaseUrl.replace(/^https?:\/\//, 'wss://'),
      terminalOrigins,
    ].filter(Boolean).join(' ')

    const isDev = process.env.NODE_ENV === 'development'
    
    response.headers.set('Content-Security-Policy',
      `default-src 'self'; ` +
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; ` +
      `style-src 'self' 'unsafe-inline'; ` +
      `worker-src 'self' blob:; ` +
      `img-src 'self' data: blob:; ` +
      `font-src 'self' data:; ` +
      `object-src 'none'; ` +
      `base-uri 'self'; ` +
      `form-action 'self'; ` +
      `connect-src ${connectSrc}; ` +
      `frame-src 'self' https://*.secprima.in wss://*.secprima.in ${terminalOrigins}; ` +
      `frame-ancestors 'self'; ` +
      `report-uri /api/csp-report; ` +
      `upgrade-insecure-requests`
    )
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    return response

  } catch (err) {
    console.error("[Middleware] Edge Error:", err)
    if (isProtectedPath) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("redirect", pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
