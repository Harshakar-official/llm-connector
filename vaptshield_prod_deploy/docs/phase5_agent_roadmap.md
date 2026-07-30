# Phase 5 — Autonomous AI Pentest Agent: Build Roadmap (internal)

> My working doc. Principle: **additive, never break existing.** Agent = isolated island → bridged to platform. Free/OSS only for pilot.

## Stack decision (locked)
- **No Python/LangGraph/LiteLLM.** Use existing: Next.js + `ai` SDK + Groq + BullMQ + Docker workers + Supabase.
- Agent runtime = `generateText` tool-calling loop (`maxSteps`), NOT a multi-agent swarm. Single orchestrator + toolbelt.
- Runs as a new Docker worker (`pentest-agent`), sibling to kali/zap/cicd. State in Supabase, not JSON file.
- LLM: Groq `llama-3.3-70b-versatile` (free) for pilot. Frontier model = later.

## Existing anchors (real paths)
- Groq client: `lib/ai/groq.ts` (`getGroqSDK`, `DEFAULT_MODEL`)
- Worker infra: `lib/docker/{manager,worker-launcher,quota}.ts`
- Migrations: `supabase/migrations/` (next = `079_...`)
- Scanner UI pattern: `app/(dashboard)/scanner/{zap,terminal,cicd}`
- Findings pipeline: `components/findings/{FindingForm,PoCStepBuilder}.tsx`

## Non-negotiable safety (Day-1, deterministic — NOT LLM-judged)
1. **Scope allowlist** check before EVERY tool call (host/IP/CIDR). Out-of-scope = hard block.
2. **Payload denylist** (DROP/DELETE/shutdown/rm...) hard-blocked.
3. **Budget caps**: maxSteps + token cap + wall-clock timeout per run.
4. **Append-only audit log**: every reasoning step + tool call + payload → DB.
5. **Kill switch**: drain queue + stop worker.
6. **Proof-based success**: only "confirmed" when code verifies real HTTP evidence (e.g. admin token in response), never on LLM say-so.

## Known problems → planned solution (so no surprise later)
| Problem | Solution |
|---|---|
| Agent infinite loop / token burn | maxSteps + budget cap + timeout |
| Raw nmap/sqlmap output confuses LLM | truncate + summarize before feeding |
| HITL pause/resume across worker | run status `awaiting_approval` in DB, resume via Redis signal |
| LLM hallucinates success | proof verification in code |
| Scope escape | deterministic pre-call guard |
| Prod destructive action | env mode flag (staging=aggressive, prod=surgical payloads only) |

---

## Build phases

### Phase 5.0 — Manual validation (no code)
- [ ] Run Juice Shop locally (Docker).
- [ ] Manually confirm SQLi auth bypass (`' OR 1=1--`), capture the winning request + admin token.
- **Goal:** know the exploit cold before teaching agent.

### Phase 5.1 — Standalone agent script (outside platform)
- [ ] `scratch/agent-poc/` — single script, no worker/UI.
- [ ] `ai` SDK + Groq, 2 tools: `http_request`, `report_finding`.
- [ ] ReAct loop targets Juice Shop `/login`, prints reasoning, prints admin token.
- [ ] Add: scope guard, payload denylist, maxSteps, budget cap.
- **Goal:** prove concept in ~1 file. Deliverable = terminal demo.

### Phase 5.2 — Move loop into BullMQ worker
- [ ] Copy kali/zap worker skeleton → `pentest-agent` worker + Docker image.
- [ ] Tools call kali worker (nmap/sqlmap/curl) instead of raw fetch where needed.
- [ ] State: `pentest_runs` + `pentest_events` (append-only) tables (migration `079`).
- [ ] Enqueue/dequeue via existing BullMQ + Redis.

### Phase 5.3 — UI integration
- [ ] "AI Pentest" button + page under `app/(dashboard)/scanner/ai-agent/`.
- [ ] Stream inner-monologue to terminal-style UI (reuse `scanner/terminal` pattern).
- [ ] **HITL gate**: on `awaiting_approval`, show Approve/Deny; resume worker.
- [ ] Kill switch button.

### Phase 5.4 — Findings pipeline hookup (the moat)
- [ ] On confirmed proof → auto-create Finding via existing `findings` schema.
- [ ] Populate PoC steps (`PoCStepBuilder`) from agent's evidence.
- [ ] Flows into existing report/docx generation. **This is what makes it a product, not a demo.**

### Phase 5.5 — Enterprise (post-pilot, deferred)
- Scope config UI + Rules of Engagement per engagement.
- CTEM event triggers (reuse cicd worker + BullMQ scheduling): delta/CI-CD/threat-intel wake.
- BYOK (paste key → instantiate provider via `ai` SDK; no LiteLLM unless demanded).
- On-prem RAG (Qdrant) — only if client needs long-term memory. Skip for pilot.
- PTaaS tiers (Tier 2 Hybrid Shield = target).

## Data model sketch (Phase 5.2)
```
pentest_runs(id, project_id, target, scope_allowlist[], mode[staging|prod],
             status[queued|running|awaiting_approval|done|killed],
             token_budget, tokens_used, created_at)
pentest_events(id, run_id, seq, type[thought|tool_call|tool_result|approval|finding],
               payload jsonb, created_at)   -- append-only audit log
```

## Open questions for user (ask when blocking)
- Where do existing workers deploy? (local Docker only vs cloud host)
- Any existing target/scope table to reuse, or new?

## Current step
→ **Phase 5.0**: get Juice Shop running + manual SQLi confirmed. Then 5.1 standalone script.
