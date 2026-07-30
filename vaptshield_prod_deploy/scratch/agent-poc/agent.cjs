#!/usr/bin/env node
/**
 * Phase 5.1 — Standalone Autonomous Pentest Agent (PoC)
 * FULLY ISOLATED. Touches nothing in the platform. Reuses root node_modules only.
 *
 * Goal: autonomously find & prove an auth-bypass (SQLi) on a target login endpoint.
 * Runtime: raw groq-sdk native tool-calling ReAct loop (no LangGraph, no ai-SDK).
 *
 * Run:  node scratch/agent-poc/agent.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Groq } = require('groq-sdk');

// ── Load GROQ_API_KEY from repo .env.local (no dotenv dep) ──────────────────
function loadEnv() {
  const p = path.join(__dirname, '..', '..', '.env.local');
  try {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* fall back to ambient env */ }
}
loadEnv();

// ── Config ──────────────────────────────────────────────────────────────────
const CONFIG = {
  target: 'http://localhost:3001',
  scopeAllowlist: ['localhost:3001', '127.0.0.1:3001'], // deterministic scope guard
  model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
  maxSteps: 12,          // hard loop cap (anti-infinite-loop)
  tokenBudget: 40000,    // hard token cap (anti-burn)
  mode: 'staging',       // staging=aggressive | prod=surgical (payload restrictions)
};

// Destructive keywords hard-blocked in EVERY payload, regardless of LLM intent.
const PAYLOAD_DENYLIST = [
  /\bDROP\b/i, /\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i, /\bshutdown\b/i,
  /\bxp_cmdshell\b/i, /rm\s+-rf/i, /\bUPDATE\s+.*\bSET\b/i, /\bINSERT\s+INTO\b/i,
];

// ── Audit log (append-only) ──────────────────────────────────────────────────
const auditPath = path.join(__dirname, 'audit.log.jsonl');
let seq = 0;
function audit(type, data) {
  seq += 1;
  const rec = { seq, type, ...data };
  fs.appendFileSync(auditPath, JSON.stringify(rec) + '\n');
  return rec;
}

// ── Deterministic guards (LLM is NEVER the last line of defense) ─────────────
function scopeGuard(urlStr) {
  let host;
  try { host = new URL(urlStr).host; } catch { return { ok: false, reason: 'bad url' }; }
  if (!CONFIG.scopeAllowlist.includes(host)) {
    return { ok: false, reason: `host ${host} OUT OF SCOPE` };
  }
  return { ok: true };
}
function payloadGuard(str) {
  for (const rx of PAYLOAD_DENYLIST) {
    if (rx.test(str)) return { ok: false, reason: `blocked destructive pattern ${rx}` };
  }
  return { ok: true };
}

// ── Tools (the "hands") ──────────────────────────────────────────────────────
const state = { confirmed: null };

async function tool_http_request({ method, path: reqPath, body }) {
  const url = CONFIG.target + (reqPath.startsWith('/') ? reqPath : '/' + reqPath);
  const scope = scopeGuard(url);
  if (!scope.ok) return { error: `SCOPE BLOCK: ${scope.reason}` };

  const bodyStr = body ? JSON.stringify(body) : '';
  const pg = payloadGuard(bodyStr + ' ' + url);
  if (!pg.ok) return { error: `SAFETY BLOCK: ${pg.reason}` };

  audit('tool_call', { tool: 'http_request', method, url, body });
  let res, text;
  try {
    res = await fetch(url, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: ['GET', 'HEAD'].includes((method || 'GET').toUpperCase()) ? undefined : bodyStr,
    });
    text = await res.text();
  } catch (e) {
    return { error: `request failed: ${e.message}` };
  }
  const truncated = text.length > 800 ? text.slice(0, 800) + '…[truncated]' : text;
  audit('tool_result', { status: res.status, len: text.length });
  return { status: res.status, body: truncated };
}

function tool_report_finding({ title, severity, endpoint, payload, evidence_token }) {
  // PROOF-BASED: only accept if a real admin JWT is present & decodes to role=admin.
  let verified = false, decoded = null;
  try {
    const parts = (evidence_token || '').split('.');
    if (parts.length === 3) {
      decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      verified = decoded?.data?.role === 'admin';
    }
  } catch { /* not a valid jwt */ }

  const finding = { title, severity, endpoint, payload, verified, decoded };
  audit('finding', finding);
  if (verified) state.confirmed = finding;
  return verified
    ? { accepted: true, message: 'PROOF VERIFIED: admin role confirmed via JWT.' }
    : { accepted: false, message: 'REJECTED: no valid admin JWT in evidence. Keep trying.' };
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Send an HTTP request to the in-scope target. Returns status + (truncated) body.',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT'] },
          path: { type: 'string', description: 'path only, e.g. /rest/user/login' },
          body: { type: 'object', description: 'JSON body for POST/PUT', additionalProperties: true },
        },
        required: ['method', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'report_finding',
      description: 'Report a confirmed vulnerability with proof. evidence_token must be the JWT you obtained.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          endpoint: { type: 'string' },
          payload: { type: 'string' },
          evidence_token: { type: 'string', description: 'the auth token obtained as proof' },
        },
        required: ['title', 'severity', 'endpoint', 'payload', 'evidence_token'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are an autonomous web-application penetration testing agent operating under STRICT authorization.
Target (IN SCOPE, authorized): ${CONFIG.target}
Mission: Find and PROVE an authentication bypass on the login functionality.

Rules:
- The login API is at POST /rest/user/login with JSON body {"email": "...", "password": "..."}.
- A normal wrong login returns HTTP 401. A successful login returns HTTP 200 with authentication.token (a JWT).
- Try SQL injection in the email field to bypass authentication (e.g. classic tautologies). Non-destructive payloads only.
- When you obtain a token, decode nothing yourself — call report_finding with the raw token as evidence_token; the system verifies it.
- Think step by step. Explain your reasoning BEFORE each tool call in one short sentence.
- Stop once report_finding returns accepted:true.`;

// ── The ReAct loop ("the brain") ─────────────────────────────────────────────
async function run() {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: 'Begin the assessment. Find and prove the auth bypass.' },
  ];
  audit('run_start', { target: CONFIG.target, model: CONFIG.model });

  let tokensUsed = 0;
  for (let step = 1; step <= CONFIG.maxSteps; step++) {
    if (tokensUsed > CONFIG.tokenBudget) {
      console.log(`\n⛔ BUDGET CAP hit (${tokensUsed} tok). Stopping.`);
      break;
    }

    const resp = await client.chat.completions.create({
      model: CONFIG.model,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
    });
    tokensUsed += resp.usage?.total_tokens || 0;
    const msg = resp.choices[0].message;
    messages.push(msg);

    if (msg.content) {
      console.log(`\n🧠 [step ${step}] ${msg.content.trim()}`);
      audit('thought', { step, text: msg.content.trim() });
    }

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // No tool call and no confirmation → nudge once, else end.
      if (state.confirmed) break;
      messages.push({ role: 'user', content: 'Continue. Use tools to make progress or report the finding.' });
      continue;
    }

    for (const call of msg.tool_calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
      console.log(`   🔧 ${call.function.name}(${JSON.stringify(args).slice(0, 200)})`);
      let result;
      if (call.function.name === 'http_request') result = await tool_http_request(args);
      else if (call.function.name === 'report_finding') result = tool_report_finding(args);
      else result = { error: 'unknown tool' };
      console.log(`   ↩︎  ${JSON.stringify(result).slice(0, 220)}`);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }

    if (state.confirmed) break;
  }

  audit('run_end', { confirmed: !!state.confirmed, tokensUsed });
  console.log('\n' + '═'.repeat(60));
  if (state.confirmed) {
    console.log('✅ VULNERABILITY PROVEN (proof-based, verified in code):');
    console.log(`   ${state.confirmed.title} [${state.confirmed.severity}]`);
    console.log(`   endpoint: ${state.confirmed.endpoint}`);
    console.log(`   payload : ${state.confirmed.payload}`);
    console.log(`   admin   : ${state.confirmed.decoded?.data?.email} (role=${state.confirmed.decoded?.data?.role})`);
  } else {
    console.log('❌ No verified finding this run.');
  }
  console.log(`   tokens used: ${tokensUsed} / ${CONFIG.tokenBudget}`);
  console.log(`   audit log  : ${auditPath}`);
  console.log('═'.repeat(60));
}

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
