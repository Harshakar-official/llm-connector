#!/usr/bin/env node
/**
 * Phase 5.2 — Pentest Agent Worker (DB-backed, multi-tenant, HITL-capable)
 * ISOLATED: lives in scratch/, imports nothing from the platform, reuses root node_modules.
 *
 * Loop:
 *   1. Atomically claim a `queued` pentest_run (SKIP LOCKED → multi-worker safe).
 *   2. Run the ReAct loop; every thought/tool/result → append-only pentest_events.
 *   3. HITL: if run.hitl, POST/exploit calls pause (status=awaiting_approval) until
 *      the UI (or SQL) flips status back to running with an approval_response event.
 *   4. Proof-verify findings in code; write confirmed_finding + final status.
 *
 * Run:  node scratch/agent-poc/worker.cjs           (polls forever)
 *       RUN_ID=<uuid> node scratch/agent-poc/worker.cjs   (one specific run then exit)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { Groq } = require('groq-sdk');

// ── env ──────────────────────────────────────────────────────────────────────
(function loadEnv() {
  try {
    const p = path.join(__dirname, '..', '..', '.env.local');
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
})();

let DB_URL = process.env.DATABASE_URL;
if (DB_URL && !DB_URL.includes('pgbouncer')) {
  DB_URL += (DB_URL.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=1';
}
const pool = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 8000 });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

const PAYLOAD_DENYLIST = [
  /\bDROP\b/i, /\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i, /\bshutdown\b/i,
  /\bxp_cmdshell\b/i, /rm\s+-rf/i, /\bUPDATE\s+.*\bSET\b/i, /\bINSERT\s+INTO\b/i,
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── DB helpers ───────────────────────────────────────────────────────────────
async function claimRun() {
  if (process.env.RUN_ID) {
    const r = await pool.query(
      `UPDATE pentest_runs SET status='running', started_at=now()
       WHERE id=$1 AND status IN ('queued') RETURNING *`, [process.env.RUN_ID]);
    return r.rows[0] || null;
  }
  const r = await pool.query(
    `UPDATE pentest_runs SET status='running', started_at=now()
     WHERE id = (SELECT id FROM pentest_runs WHERE status='queued'
                 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING *`);
  return r.rows[0] || null;
}
// seq is computed ATOMICALLY in the DB (not an in-memory counter) because both the
// worker and the UI (approvals) write events concurrently. Retry on unique collision.
async function event(runId, type, payload) {
  for (let i = 0; i < 6; i++) {
    try {
      await pool.query(
        `INSERT INTO pentest_events(run_id, org_id, seq, type, payload)
         VALUES ($1,$2,(SELECT COALESCE(MAX(seq),0)+1 FROM pentest_events WHERE run_id=$1),$3,$4)`,
        [runId, event._org, type, JSON.stringify(payload || {})]);
      return;
    } catch (e) {
      if (/unique/i.test(e.message) && i < 5) { await sleep(40 + i * 60); continue; }
      throw e;
    }
  }
}
async function setRun(id, fields) {
  const keys = Object.keys(fields);
  const set = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  const vals = keys.map((k) => (typeof fields[k] === 'object' && fields[k] !== null ? JSON.stringify(fields[k]) : fields[k]));
  await pool.query(`UPDATE pentest_runs SET ${set} WHERE id=$1`, [id, ...vals]);
}
async function getStatus(id) {
  const r = await pool.query('SELECT status FROM pentest_runs WHERE id=$1', [id]);
  return r.rows[0]?.status;
}

// ── guards ───────────────────────────────────────────────────────────────────
function scopeGuard(urlStr, allowlist) {
  let host;
  try { host = new URL(urlStr).host; } catch { return { ok: false, reason: 'bad url' }; }
  if (!allowlist.includes(host)) return { ok: false, reason: `host ${host} OUT OF SCOPE` };
  return { ok: true };
}
function payloadGuard(str) {
  for (const rx of PAYLOAD_DENYLIST) if (rx.test(str)) return { ok: false, reason: `blocked ${rx}` };
  return { ok: true };
}

// ── HITL gate ────────────────────────────────────────────────────────────────
// Pause the run until a human approves. Returns {approved:boolean}. Throws on kill.
async function awaitApproval(run, action) {
  await setRun(run.id, { status: 'awaiting_approval', pending_action: action });
  await event(run.id, 'approval_request', action);
  const deadline = 5 * 60 * 1000;
  const start = Date.now();
  while (true) {
    await sleep(2000);
    const st = await getStatus(run.id);
    if (st === 'killed') throw new Error('run killed during approval');
    if (st !== 'awaiting_approval') {
      const r = await pool.query(
        `SELECT payload FROM pentest_events WHERE run_id=$1 AND type='approval_response'
         ORDER BY seq DESC LIMIT 1`, [run.id]);
      const approved = r.rows[0]?.payload?.approved === true;
      await setRun(run.id, { pending_action: null });
      return { approved };
    }
    if (Date.now() - start > deadline) {
      await setRun(run.id, { status: 'running', pending_action: null });
      await event(run.id, 'approval_response', { approved: false, reason: 'timeout' });
      return { approved: false };
    }
  }
}

// ── tools ────────────────────────────────────────────────────────────────────
function buildToolSpec() {
  return [
    { type: 'function', function: {
      name: 'http_request',
      description: 'Send an HTTP request to the in-scope target. Returns status + (truncated) body.',
      parameters: { type: 'object', properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT'] },
        url: { type: 'string', description: 'full URL, must be in scope' },
        body: { type: 'object', additionalProperties: true },
      }, required: ['method', 'url'] } } },
    { type: 'function', function: {
      name: 'report_finding',
      description: 'Report a vuln. Provide the EXACT request that proves it; the system will REPLAY it live and verify — do not paste tokens.',
      parameters: { type: 'object', properties: {
        title: { type: 'string' }, severity: { type: 'string', enum: ['low','medium','high','critical'] },
        method: { type: 'string', enum: ['GET','POST','PUT'] },
        url: { type: 'string', description: 'full in-scope URL of the proving request' },
        body: { type: 'object', additionalProperties: true, description: 'the exact request body (e.g. the SQLi login payload)' },
      }, required: ['title','severity','method','url','body'] } } },
  ];
}

async function execHttp(run, args) {
  const { method = 'GET', url, body } = args;
  const scope = scopeGuard(url, run.scope_allowlist);
  if (!scope.ok) { await event(run.id, 'guard_block', { reason: scope.reason, args }); return { error: `SCOPE BLOCK: ${scope.reason}` }; }
  const bodyStr = body ? JSON.stringify(body) : '';
  const pg = payloadGuard(bodyStr + ' ' + url);
  // prod mode: even non-denylisted, keep it read-ish; denylist already blocks destructive.
  if (!pg.ok) { await event(run.id, 'guard_block', { reason: pg.reason, args }); return { error: `SAFETY BLOCK: ${pg.reason}` }; }

  // HITL: gate state-changing / exploit attempts (POST/PUT) when enabled.
  if (run.hitl && ['POST', 'PUT'].includes(method.toUpperCase())) {
    const { approved } = await awaitApproval(run, { tool: 'http_request', method, url, body });
    await event(run.id, 'approval_response', { approved });
    if (!approved) return { error: 'DENIED by human operator. Try a different, safer approach.' };
  }

  await event(run.id, 'tool_call', { tool: 'http_request', method, url, body });
  let res, text;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' },
      body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : bodyStr });
    text = await res.text();
  } catch (e) { return { error: `request failed: ${e.message}` }; }
  const truncated = text.length > 800 ? text.slice(0, 800) + '…[truncated]' : text;
  await event(run.id, 'tool_result', { status: res.status, len: text.length, preview: truncated.slice(0, 300) });
  return { status: res.status, body: truncated };
}

// PROOF-BASED: the worker itself REPLAYS the claimed request against the live,
// in-scope target and independently extracts+decodes the token. Nothing the LLM
// "says" is trusted — a hallucinated/memorized JWT cannot pass this.
async function execReport(run, args) {
  const { title, severity, method = 'POST', url, body } = args;
  const scope = scopeGuard(url, run.scope_allowlist);
  if (!scope.ok) { await event(run.id, 'guard_block', { reason: scope.reason, args }); return { error: `SCOPE BLOCK: ${scope.reason}` }; }
  const pg = payloadGuard(JSON.stringify(body || {}) + ' ' + url);
  if (!pg.ok) { await event(run.id, 'guard_block', { reason: pg.reason, args }); return { error: `SAFETY BLOCK: ${pg.reason}` }; }

  await event(run.id, 'tool_call', { tool: 'report_finding.replay', method, url, body });
  let status = 0, token = null, decoded = null;
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' },
      body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : JSON.stringify(body || {}) });
    status = res.status;
    const json = await res.json().catch(() => ({}));
    token = json?.authentication?.token || null;
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    }
  } catch (e) { return { error: `replay failed: ${e.message}` }; }

  const verified = status === 200 && decoded?.data?.role === 'admin';
  const finding = { title, severity, endpoint: `${method} ${url}`, payload: JSON.stringify(body),
    verified, replay_status: status, admin: decoded?.data?.email, role: decoded?.data?.role };
  await event(run.id, 'finding', finding);
  if (verified) { run._confirmed = finding; await setRun(run.id, { confirmed_finding: finding }); }
  return verified
    ? { accepted: true, message: `PROOF VERIFIED by live replay: HTTP ${status}, admin=${decoded.data.email}.` }
    : { accepted: false, message: `REJECTED: live replay gave HTTP ${status}, no admin token. The exploit must actually work against the target.` };
}

// ── the loop ─────────────────────────────────────────────────────────────────
function systemPrompt(run) {
  return `You are an autonomous web-application penetration testing agent under STRICT authorization.
Authorized target(s) IN SCOPE: ${run.scope_allowlist.join(', ')}
Base target URL: ${run.target}
Mode: ${run.mode} ${run.mode === 'prod' ? '(PRODUCTION — non-destructive payloads only)' : '(staging — aggressive allowed)'}
Mission: ${run.objective || 'Find and PROVE an authentication bypass on the login functionality.'}

Facts:
- Login API: POST ${run.target}/rest/user/login  with JSON {"email":"...","password":"..."}.
- Wrong login → HTTP 401. Success → HTTP 200 with authentication.token (a JWT).
- Use SQL injection in the email field (non-destructive tautologies) to bypass auth.
- First confirm the bypass with http_request (expect HTTP 200 + a token). Then call report_finding
  with the EXACT method/url/body that worked — the system replays it live to verify. Never paste tokens.
- One short reasoning sentence BEFORE each tool call. Stop once report_finding returns accepted:true.
- Always pass full in-scope URLs to http_request.`;
}

async function runAgent(run) {
  event._org = run.org_id;
  await event(run.id, 'run_start', { target: run.target, mode: run.mode, model: MODEL });
  const messages = [
    { role: 'system', content: systemPrompt(run) },
    { role: 'user', content: 'Begin the assessment. Find and prove the vulnerability.' },
  ];
  const tools = buildToolSpec();
  let tokensUsed = 0;

  for (let step = 1; step <= run.max_steps; step++) {
    if (await getStatus(run.id) === 'killed') { await event(run.id, 'run_end', { killed: true }); return; }
    if (tokensUsed > run.token_budget) { await event(run.id, 'run_end', { reason: 'budget_cap', tokensUsed }); break; }

    // Resilient LLM call: Llama sometimes emits a malformed tool call → Groq 400.
    // Retry a couple times with a correction nudge instead of crashing the run.
    let resp;
    for (let attempt = 1; ; attempt++) {
      try {
        resp = await groq.chat.completions.create({ model: MODEL, messages, tools, tool_choice: 'auto', temperature: 0.2 });
        break;
      } catch (e) {
        const isToolFail = e?.status === 400 && /tool_use_failed/.test(e?.message || '');
        if (isToolFail && attempt <= 2) {
          await event(run.id, 'error', { recoverable: true, attempt, note: 'malformed tool call, retrying' });
          messages.push({ role: 'user', content: 'Your previous tool call was malformed. Emit exactly ONE well-formed tool call using the provided JSON schema — no XML, no prose inside the call.' });
          continue;
        }
        throw e;
      }
    }
    tokensUsed += resp.usage?.total_tokens || 0;
    await setRun(run.id, { tokens_used: tokensUsed });
    const msg = resp.choices[0].message;
    messages.push(msg);

    if (msg.content) { console.log(`🧠 [${step}] ${msg.content.trim().slice(0, 120)}`); await event(run.id, 'thought', { step, text: msg.content.trim() }); }

    if (!msg.tool_calls?.length) {
      if (run._confirmed) break;
      messages.push({ role: 'user', content: 'Continue. Use tools or report the finding.' });
      continue;
    }
    for (const call of msg.tool_calls) {
      let args = {}; try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
      let result;
      if (call.function.name === 'http_request') result = await execHttp(run, args);
      else if (call.function.name === 'report_finding') result = await execReport(run, args);
      else result = { error: 'unknown tool' };
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
    if (run._confirmed) break;
  }

  const ok = !!run._confirmed;
  await event(run.id, 'run_end', { confirmed: ok, tokensUsed });
  await setRun(run.id, { status: ok ? 'completed' : 'failed', finished_at: new Date().toISOString(), tokens_used: tokensUsed });
  console.log(ok ? `✅ run ${run.id} COMPLETED — ${run._confirmed.title}` : `❌ run ${run.id} no verified finding`);
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const once = !!process.env.RUN_ID;
  console.log(`worker up (model=${MODEL})${once ? ' [single run mode]' : ' [polling]'}`);
  do {
    let run;
    try { run = await claimRun(); } catch (e) { console.error('claim error', e.message); await sleep(3000); continue; }
    if (!run) { if (once) { console.log('no such queued run'); break; } await sleep(3000); continue; }
    console.log(`▶ claimed run ${run.id} target=${run.target}`);
    try { await runAgent(run); }
    catch (e) {
      console.error('run error', e.message);
      await event(run.id, 'error', { message: e.message });
      await setRun(run.id, { status: 'failed', error: e.message, finished_at: new Date().toISOString() });
    }
  } while (!once);
  await pool.end();
  process.exit(0);
})();
