# Autonomous AI Pentest Engine — Architecture & Vision

> Single source of truth for Phase 5. Read this before touching engine code.
> Principle: **build the full structure with seams now; implement 1–2 agents for the demo; plug the rest in later without re-architecting.**

---

## 0. Vision in one line
Evolve VaptShield from a static scanner into an **isolated, enterprise-grade Autonomous AI Red-Teaming Engine** that reasons, plans attack paths, and *proves* vulnerabilities with proof-based validation — pluggable one OWASP agent at a time, scaling to 100+ agents.

---

## 1. Two-plane architecture (polyglot, isolated)

The autonomous engine is treated as a **separate platform** that integrates with VaptShield over a language-agnostic contract. Nothing in the existing platform is modified.

```
┌──────────────────────────────┐        ┌──────────────────────────────────────────┐
│  CONTROL PLANE (existing)    │        │  AGENT ENGINE (new, ISOLATED)              │
│  TypeScript / Next.js        │        │  Python microservice (own Docker container)│
│  • UI / dashboard            │        │                                            │
│  • auth, multi-tenant, RLS   │        │  ┌── Planner / Supervisor (LangGraph) ──┐  │
│  • findings, reports (docx)  │◄──────►│  │  plan → recon → pick → exploit →      │  │
│  • "Start AI Pentest" button │  API + │  │  verify → report                     │  │
│  • HITL approve/deny UI      │ shared │  └───────────────┬──────────────────────┘  │
│                              │  DB +  │        ┌─────────┴──────────┐              │
│  = presentation + control    │  queue │        ▼         ▼          ▼              │
└──────────────────────────────┘        │   ┌──────┐  ┌───────┐  ┌───────┐          │
              │                          │   │Recon │  │ SQLi  │  │ XSS   │  … (100+) │
              ▼                          │   └──────┘  └───────┘  └───────┘          │
     ┌──────────────────┐               │        └── Agent Registry (pluggable) ──   │
     │  Postgres/Supabase│◄──────────────┤   Tool layer (nmap/sqlmap/nuclei/http)     │
     │  pentest_runs     │  THE CONTRACT │   Policy / Guardrail engine (scope/HITL)   │
     │  pentest_events   │  (lang-neutral)│  LLM gateway (LiteLLM, BYOK)              │
     └──────────────────┘               │   Memory: RAG (pgvector/Qdrant) + Neo4j    │
                                        └──────────────────────────────────────────┘
```

**Why polyglot:** TS is best for the platform/UI; Python is best for the agent brain (security tooling ecosystem — sqlmap/impacket/scapy; agent ecosystem — LangGraph/CrewAI; ML/RAG). Docker makes running both trivial — the Python engine is *just another container* in VaptShield's existing kali/zap/cicd worker model.

---

## 2. The contract (integration boundary)

The two planes never share code. They share **only** these, all language-neutral:

| Contract | Purpose | Status |
|---|---|---|
| `pentest_runs` table | one row per run: target, scope, mode, status, budget, confirmed_finding, pending_action | ✅ built (migration 079) |
| `pentest_events` table | append-only audit log + live event stream (realtime) | ✅ built (migration 079) |
| Job queue (Redis) | TS enqueues a run → Python engine claims it | pilot: DB poll; prod: BullMQ/Celery |
| Control API (Python) | start / stop / approve-HITL / stream | to build |

**Run lifecycle:** `queued → running → (awaiting_approval ↔ running) → completed | failed | killed`

Because the contract is just Postgres + a queue, either plane can be rewritten independently. The TS control plane reads runs/events (via existing Supabase RLS) and shows live progress; the Python engine does all reasoning + tool execution.

---

## 3. Layer map — every term, where it fits, is it free, when

| Term | Layer | Fit | Free | Demo or later |
|---|---|---|---|---|
| **LangGraph** | Orchestration | ✅ core | ✅ | **Demo** |
| **Planner/Supervisor** | Orchestration | ✅ core | ✅ | **Demo** |
| **Agent Registry** | Orchestration | ✅ core (the "structure") | ✅ | **Demo** |
| **LiteLLM** | LLM gateway / BYOK | ✅ | ✅ | Demo (thin) → full 5.5 |
| **Groq / Llama-3.3** | LLM (pilot brain) | ✅ | ✅ | **Demo** |
| **Proof-based validation** | Anti-hallucination | ✅✅ primary | ✅ | **Demo (already proven)** |
| **RAG — pgvector / Qdrant** | Memory (unstructured) | ✅ | ✅ (pgvector on Supabase) | Later (5.5) |
| **Neo4j graph** | Memory (attack paths) | ✅✅ strong (à la BloodHound) | ✅ Community | Later (5.5) |
| **Rate limiter + block-detection** | Tool safety | ✅ | ✅ | Demo (hook) → full 5.5 |
| **AWS Lambda** | Deploy (triggers only) | ❌ for agent core (15-min, stateless) | ✅ tier | Only for event triggers |
| **Google Cloud Run** | Deploy (engine host) | 🟡 ToS/IP caveats for scanning | ✅ tier | Later (5.5) |
| **BullMQ / Celery** | Queue | ✅ | ✅ | 5.2+ |

**Discipline:** design the seam (interface) for every row now; implement only the **Demo** rows.

---

## 4. Anti-hallucination stack (ranked, not one tool)

1. **Proof-based validation** — the engine independently *replays* the claimed exploit against the live target and verifies real evidence (e.g. HTTP 200 + admin JWT). Nothing the LLM "says" is trusted. *(Strongest; already built & tested.)*
2. **Structured outputs** — the Planner may only *choose* from the registered agent enum; it cannot invent steps as free text.
3. **Grounded memory** — RAG + Neo4j feed real stored facts so the model reasons over data, not from memory. *(Later.)*
4. **Deterministic guards** — scope/payload/mode enforced outside the LLM.

> The demo does not hallucinate success even without RAG/Neo4j, because layer 1 already closes the hole.

---

## 5. Agent Registry — the "structure now, agents later" core

Every OWASP agent is a self-contained module implementing one interface. Adding a vuln tomorrow = drop a file; the Planner and orchestrator do **not** change.

```python
# engine/agents/base.py
class BaseAgent:
    category: str          # e.g. "A03:2021-Injection"
    name: str              # e.g. "sqli-auth-bypass"

    def applies_to(self, state: RunState) -> bool:
        """Is this agent relevant given current recon/state? (cheap gate)"""

    async def run(self, state: RunState, tools: ToolBelt, policy: Policy) -> list[Finding]:
        """Attempt exploitation; return only proof-verified findings."""
```

```python
# engine/agents/registry.py — auto-discovers modules in engine/agents/
REGISTRY = discover_agents()   # {name: AgentClass}
```

Demo ships: `ReconAgent`, `SqliAuthBypassAgent`. Future: `XssAgent`, `SsrfAgent`, `IdorAgent`, … each a new file.

---

## 6. Planner / Supervisor (LangGraph supervisor pattern)

The Planner is the brain: it reads shared state and routes to the next agent.

```
RunState (TypedDict): target, scope, mode, recon_data, findings[], budget, next

Supervisor node:
  input  = current RunState (real facts only)
  output = structured decision: next ∈ {recon, <agent>, report, done}   ← enum, not free text

Graph:
  START → supervisor → (conditional edge on `next`)
            ├─ recon    → agent → supervisor
            ├─ sqli     → agent → supervisor
            ├─ report   → reporter → supervisor
            └─ done     → END
```

**Grounding:** Planner sees only real state; decisions are enum-constrained; step/token/$ budget caps prevent runaway planning. LangGraph gives durable checkpointing + HITL `interrupt()` for the approval gate.

---

## 7. Policy / Guardrail engine (deterministic, outside the LLM)

Wraps **every** tool call:
- **Scope guard** — host/IP/CIDR allowlist; out-of-scope = hard block.
- **Payload denylist** — DROP/DELETE/TRUNCATE/shutdown/rm -rf… blocked regardless of LLM intent.
- **Mode** — `staging` (aggressive) vs `prod` (surgical, non-destructive only).
- **Rate limiter** — configurable req/sec; stealth mode.
- **Block-detection** — sudden 403/captcha/challenge → back off, emit `waf_detected`, pause.
- **HITL gate** — state-changing/exploit calls pause to `awaiting_approval` until a human approves (Phase-1 pilot). Phase-2: deterministic auto-approve of known-safe payloads.
- **Budget caps** — max steps, token cap, wall-clock timeout.
- **Kill switch** — flip run to `killed`; engine aborts at next checkpoint.

---

## 8. Memory (deferred to 5.5, seams now)

- **RAG (vector)** — unstructured knowledge: past scans, reports, CVE text, policies. Store: `pgvector` (already have Supabase Postgres) or Qdrant (self-host, per-tenant VPC). Retrieve relevant chunks at reasoning time.
- **Neo4j (graph)** — structured attack surface & **attack-path reasoning** (`host→port→service→vuln→exploit→pivot`). This is the BloodHound-style differentiator for enterprise.
- Modern combo = **GraphRAG** (vector for content + graph for relationships). Interface both behind a `Memory` port; demo uses a no-op/in-memory impl.

---

## 9. LLM gateway & BYOK (LiteLLM)

- All model calls go through a single `LLMGateway` port. Pilot impl → Groq. Enterprise impl → **LiteLLM** routing to the tenant's own Azure OpenAI / Anthropic key (**BYOK** — client's data stays in their agreement, runs on their dime).
- Per-tenant key + provider resolved from config; the engine core never hardcodes a provider.

---

## 10. Traffic-blocking during real pentests (operational reality)

Real targets have WAF / rate-limits / IP bans / IDS. Handling (vision):
- **WAF whitelist** of the engine's egress IP — part of the signed Rules of Engagement.
- **Rate control + stealth mode** in the tool layer.
- **Adaptive block-detection** — agent notices blocking, backs off, reports instead of hammering.
- **Prod surgical mode** — slow, low-noise, non-destructive.
- **Dedicated/known egress** so the client can whitelist (cloud IPs get blocked/violate ToS — a reason not to run exploitation from generic Cloud Run).
- *Demo:* local Juice Shop, no WAF → not exercised, but the rate-limiter + block-detection hooks exist from day 1.

---

## 11. Deployment

| Stage | Engine host |
|---|---|
| Demo / pilot | **Local Docker container** (current laptop, no tunnel) |
| Enterprise | Client VPC (on-prem) or dedicated host with whitelisted egress; scale-to-zero aligns with CTEM sleep |
| Triggers | Lightweight serverless (Lambda/Cloud Run) for webhooks/cron "wake up" only — **not** the agent core |

**CTEM event-driven:** baseline scan → sleep → wake on delta/CI-CD/threat-intel trigger → targeted re-test → sleep. Saves cost & avoids network congestion.

---

## 12. Proposed folder structure (Python engine)

```
engine/
  main.py                 # worker entrypoint: claim run → run graph → write results
  contract/
    db.py                 # Postgres access to pentest_runs / pentest_events
    events.py             # append-only event writer (atomic seq)
    state.py              # RunState TypedDict
  orchestrator/
    graph.py              # LangGraph StateGraph
    supervisor.py         # Planner node (structured routing)
  agents/
    base.py               # BaseAgent interface
    registry.py           # auto-discovery
    recon.py              # ReconAgent (demo)
    sqli.py               # SqliAuthBypassAgent (demo)
  tools/
    http.py, shell.py     # tool wrappers (kali tools later)
    ratelimit.py          # rate limiter + block-detection
  policy/
    guards.py             # scope / payload / mode
    hitl.py               # approval gate
    budget.py             # step/token/time caps
  llm/
    gateway.py            # LLMGateway port (Groq now, LiteLLM later)
  memory/
    port.py               # Memory interface (no-op now; RAG/Neo4j later)
  Dockerfile
  requirements.txt
```

---

## 13. Demo scope (free stack, current laptop)

- Target: **OWASP Juice Shop** (local Docker).
- Agents: **Recon + SQLi auth-bypass** → shows 2-agent handoff + Planner routing.
- Flow: UI "Start AI Pentest" → engine claims run → Planner routes recon → sqli → HITL approve in UI → proof-verified admin bypass → auto-create Finding in existing pipeline.
- Everything free: Groq + Juice Shop + local Docker + Supabase free tier. No tunnel.

---

## 14. What the pilot already proved (reused, not wasted)

| Pilot artifact | Fate |
|---|---|
| `pentest_runs` / `pentest_events` (migration 079) | ✅ **kept — the contract** |
| Guard logic (scope/payload/mode) | ✅ ported to `policy/guards.py` |
| HITL pause/resume flow | ✅ concept proven → LangGraph `interrupt()` |
| Proof-based live-replay validation | ✅ ported to agents |
| `scratch/agent-poc/worker.cjs` (TS) | 🔁 replaced by Python engine (its job: validate the contract cheaply — done) |

---

## 15. Roadmap

- **5.1** ✅ Standalone loop + guards + proof-based validation (TS pilot) — *contract validated*
- **5.2** ✅ Supabase contract tables + HITL flow — *done in pilot*
- **5.3 (next)** Python engine skeleton: LangGraph graph + BaseAgent + registry + Recon + SQLi + policy + Groq gateway; run against Juice Shop end-to-end.
- **5.4** UI integration: "Start AI Pentest", live event stream, HITL approve, auto-Finding.
- **5.5** Enterprise: LiteLLM/BYOK, RAG (pgvector/Qdrant), Neo4j attack-paths, CTEM triggers, more OWASP agents, deployment hardening, Rules-of-Engagement + immutable audit.

---

## 16. Open decisions (to lock before 5.3 build)
1. LLM gateway: LiteLLM from day 1 (BYOK-ready) vs Groq-direct now → LiteLLM later.
2. Engine runtime: Docker container (recommended) vs local venv.
3. Demo agents: Recon + SQLi (recommended) vs SQLi only.
