import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Z+ STABILITY: Cookie-only middleware client.
 *
 * This function creates a Supabase server client for cookie forwarding
 * ONLY. It does NOT call auth.getUser() — that HTTP call is the #1 cause
 * of MIDDLEWARE_INVOCATION_FAILED on Vercel Edge (especially Mumbai/bom1).
 *
 * Session refresh happens in the Server Component layout (Node.js runtime),
 * which has no Edge time limits and stable TCP connections to Supabase.
 */
export async function createMiddlewareClient(request: NextRequest) {
  const response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // IMPORTANT: We intentionally do NOT call supabase.auth.getUser() here.
  // The getUser() call makes an HTTP POST to Supabase's auth API. On Vercel
  // Edge (especially Mumbai/bom1), this network call can exceed the Edge
  // runtime's time budget, causing MIDDLEWARE_INVOCATION_FAILED.
  //
  // Instead, auth validation happens in app/(dashboard)/layout.tsx which
  // runs on the Node.js runtime with no time limits.
  //
  // The createServerClient is still created so that cookie forwarding
  // (getAll/setAll) works correctly between the Edge and the browser.

  return { supabase, response }
}
