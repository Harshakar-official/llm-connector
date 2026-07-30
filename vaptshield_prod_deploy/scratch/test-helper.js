// ═══════════════════════════════════════════════════════════════
// Reusable audit/smoke-test helper (token-efficient testing)
// Usage in a test script:
//   const { login, authedFetch, db, cleanup } = require('./test-helper');
//   const s = await login();                        // rohan admin session
//   const res = await authedFetch(s, '/dashboard'); // authed page fetch
//   const { rows } = await db(`select ...`, []);    // direct DB query
//   await cleanup();                                // close pg pool
// Credentials come from .env.local + TEST_EMAIL/TEST_PASSWORD env
// (defaults to the rohan admin org test account).
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

// Load .env.local (no dotenv dependency)
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
});

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_EMAIL || 'yewid16048@badgerhole.com';
const PASSWORD = process.env.TEST_PASSWORD || 'Testing@1234';

let _pool = null;
function pool() {
  if (!_pool) {
    const { Pool } = require('pg');
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

/** Sign in via Supabase REST; returns { session, cookies, headers } */
async function login(email = EMAIL, password = PASSWORD) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email, password }),
  });
  const session = await r.json();
  if (!r.ok) throw new Error(`LOGIN FAIL (${email}): ${session.msg || session.error_description}`);
  const ref = URL_.match(/https:\/\/(.*?)\./)[1];
  const val = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
  const name = `sb-${ref}-auth-token`;
  const cookies = val.length > 3180
    ? val.match(/.{1,3180}/g).map((c, i) => `${name}.${i}=${c}`).join('; ')
    : `${name}=${val}`;
  // headers for direct Supabase REST calls as this user
  const headers = { apikey: ANON, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  return { session, cookies, headers, userId: session.user.id };
}

/** Fetch a Next.js page/route as the logged-in user. Returns Response. */
function authedFetch(auth, pathOrUrl, init = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `http://localhost:3000${pathOrUrl}`;
  return fetch(url, { redirect: 'manual', ...init, headers: { Cookie: auth.cookies, ...(init.headers || {}) } });
}

/** Call Supabase REST directly as the logged-in user (RLS applies). */
function restFetch(auth, pathAndQuery, init = {}) {
  return fetch(`${URL_}/rest/v1${pathAndQuery}`, { ...init, headers: { ...auth.headers, ...(init.headers || {}) } });
}

/** Direct DB query (bypasses RLS — service-level, for seeding/asserting). */
function db(sql, params = []) {
  return pool().query(sql, params);
}

/** Close the pg pool (call at the end of every test). */
async function cleanup() {
  if (_pool) { await _pool.end(); _pool = null; }
}

module.exports = { login, authedFetch, restFetch, db, cleanup };
