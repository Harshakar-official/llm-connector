/**
 * lib/supabase/local-adapter.ts
 *
 * Singleton pg.Pool connected to Supabase via PgBouncer (transaction mode).
 * Used by the Docker Manager (quota.ts, manager.ts) to perform fast,
 * short-lived SQL queries from Next.js API routes.
 *
 * IMPORTANT: This adapter is designed for Vercel serverless / Node.js runtime.
 * It uses connection_limit=1 + pgbouncer=true to stay within Supabase free-tier
 * limits and avoid exhausting the connection pool in serverless environments.
 *
 * The DATABASE_URL must point to the Supabase PgBouncer endpoint (port 6543).
 */

import { Pool } from "pg"

let _pool: Pool | null = null

function buildDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    throw new Error("DATABASE_URL is not set — cannot connect to Supabase")
  }
  // Append PgBouncer transaction-mode params if not already present
  if (!raw.includes("pgbouncer=true")) {
    const sep = raw.includes("?") ? "&" : "?"
    return `${raw}${sep}pgbouncer=true&connection_limit=1`
  }
  return raw
}

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: buildDatabaseUrl(),
      max: 3, // Pool of 3 — safe within Supabase free tier (15 conn limit via PgBouncer)
      idleTimeoutMillis: 10_000, // Close idle connections quickly
      connectionTimeoutMillis: 5_000, // Fail fast if DB unreachable
    })
  }
  return _pool
}

/**
 * Close the pool — call this during graceful shutdown (rarely needed in serverless).
 */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end()
    _pool = null
  }
}