# AI Security Scanner — Architecture & Build Plan

> **Stack:** Python + FastAPI + LangGraph + LiteLLM + Groq + Docker
> **Deploy:** Worker laptop (harsh@10.0.4.182) as Docker container
> **Integrate:** VAPTShield via REST API (same pattern as Kali/ZAP/CI-CD)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│     VAPTShield (Current Laptop)      │     │    Worker Laptop (harsh@10.0.4.182)  │
│     TypeScript / Next.js             │     │                                      │
│                                      │     │  ┌────────────────────────────────┐  │
│  /scanner/ai-security (UI)          │     │  │  AI Security Scanner (Python)   │  │
│  /api/ai-security/start (API)       │────►│  │  FastAPI :8090                  │  │
│  /api/ai-security/status/:id        │◄────│  │                                │  │
│  /api/ai-security/results/:id       │     │  │  ┌──────────────────────────┐  │  │
│                                      │     │  │  │ LLM Probe Engine         │  │  │
│  Findings Pipeline (existing)        │     │  │  │ • Prompt Injection       │  │  │
│  Reports (PDF/DOCX)                 │     │  │  │ • Jailbreak              │  │  │
│  Dashboard Analytics                 │     │  │  │ • PII Leak               │  │  │
│                                      │     │  │  │ • Hallucination          │  │  │
│  Supabase (shared DB)               │◄────│  │  │ • Toxicity               │  │  │
│  Redis (queue)                       │     │  │  │ • 50+ probes             │  │  │
└──────────────────────────────────────┘     │  │  └──────────────────────────┘  │  │
                                             │  │                                │  │
                                             │  │  ┌──────────────────────────┐  │  │
                                             │  │  │ Agent Probe Engine        │  │  │
                                             │  │  │ • Tool Call Hijack        │  │  │
                                             │  │  │ • MCP Server Exploit      │  │  │
                                             │  │  │ • Excessive Autonomy      │  │  │
                                             │  │  │ • Sandbox Escape          │  │  │
                                             │  │  │ • Memory Poisoning        │  │  │
                                             │  │  └──────────────────────────┘  │  │
                                             │  │                                │  │
                                             │  │  LLM Gateway: LiteLLM          │  │
                                             │  │  (Groq free tier + BYOK ready) │  │
                                             │  └────────────────────────────────┘  │
                                             │                                      │
                                             │  Other workers (existing):           │
                                             │  • Kali Terminal :8084               │
                                             │  • ZAP Scanner   :8085               │
                                             │  • CI/CD Pipeline :8082              │
                                             └──────────────────────────────────────┘
```

---

## 2. Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| API Framework | FastAPI | Async, auto OpenAPI docs, production-ready |
| Orchestration | LangGraph | State machine for multi-step probe execution |
| LLM Gateway | LiteLLM | Multi-provider (Groq, OpenAI, Anthropic), BYOK |
| HTTP Client | httpx | Async HTTP for probe delivery |
| Detection | Custom Python | Rule-based + pattern matching |
| Container | Docker | Same as existing workers |
| DB | Supabase (shared) | ai_security_scans table |
| Queue | Redis | Job queue for async scans |

---

## 3. Database Schema

```sql
CREATE TABLE ai_security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('llm_api', 'agent_api', 'mcp_server')),
  scan_mode TEXT NOT NULL DEFAULT 'full' CHECK (scan_mode IN ('llm_only', 'agent_only', 'full')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  total_probes INT DEFAULT 0,
  probes_completed INT DEFAULT 0,
  vulnerabilities_found INT DEFAULT 0,
  results JSONB,
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ai_security_scans_org ON ai_security_scans(org_id);
CREATE INDEX idx_ai_security_scans_status ON ai_security_scans(status);

ALTER TABLE ai_security_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_security_scans_select" ON ai_security_scans FOR SELECT
  USING (org_id = my_org_id() AND NOT is_super_admin());
CREATE POLICY "ai_security_scans_insert" ON ai_security_scans FOR INSERT
  WITH CHECK (org_id = my_org_id() AND my_role() IN ('admin','security_engineer'));
```

---

## 4. API Contract (Python ↔ VAPTShield)

```
POST /health
  → { "status": "ok" }

POST /scan/start
  Body: { "scan_id": "uuid", "target_url": "https://...", "target_type": "llm_api", "scan_mode": "full" }
  → { "success": true, "scan_id": "uuid" }

GET /scan/status/{scan_id}
  → { "status": "running", "total_probes": 50, "probes_completed": 25, "vulnerabilities_found": 3 }

GET /scan/results/{scan_id}
  → { "findings": [...], "summary": {...} }

POST /scan/cancel/{scan_id}
  → { "success": true }
```

---

## 5. Probe Categories

### LLM Probes (OWASP LLM Top 10)
| Category | Probes | Severity |
|----------|--------|----------|
| LLM01: Prompt Injection | Direct, Indirect, Encoding-based, Role-play | Critical |
| LLM02: Insecure Output | XSS in output, Code execution, SSRF via output | High |
| LLM03: Training Data Poisoning | Model behavior deviation, Backdoor triggers | Medium |
| LLM04: Model DoS | Token exhaustion, Recursive prompts | Medium |
| LLM05: Supply Chain | Malicious plugin, Compromised dataset | High |
| LLM06: Sensitive Info | PII leak, Credential leak, System prompt leak | Critical |
| LLM07: Insecure Plugin | Unvalidated tool input, Path traversal | High |
| LLM08: Excessive Agency | Unauthorized actions, Privilege escalation | Critical |
| LLM09: Overreliance | Hallucination, Factual errors | Medium |
| LLM10: Model Theft | Model extraction, Shadow model | Low |

### Agent Probes (Custom IP)
| Category | Probes | Severity |
|----------|--------|----------|
| Tool Call Hijack | Prompt → malicious tool call, Parameter injection | Critical |
| MCP Server Exploit | Unauthorized MCP access, Tool enumeration | High |
| Excessive Autonomy | Unbounded loops, Resource exhaustion | High |
| Sandbox Escape | File system access, Network breakout | Critical |
| Memory Poisoning | RAG injection, Context manipulation | High |
| Chain-of-Thought Hijack | Reasoning manipulation, Decision override | Medium |

---

## 6. File Structure

```
ai_security_scanner/                    ← Python microservice
│
├── main.py                            ← FastAPI entrypoint
├── orchestrator.py                    ← LangGraph state machine
├── detectors.py                       ← Vulnerability detection logic
├── formatter.py                       ← Results → VAPTShield format
├── db.py                              ← Supabase connection
│
├── probes/
│   ├── __init__.py
│   ├── base.py                        ← BaseProbe class
│   ├── llm/
│   │   ├── __init__.py
│   │   ├── prompt_injection.py
│   │   ├── jailbreak.py
│   │   ├── pii_leak.py
│   │   ├── hallucination.py
│   │   ├── toxicity.py
│   │   ├── encoding_attacks.py
│   │   ├── insecure_output.py
│   │   ├── excessive_agency.py
│   │   └── model_theft.py
│   └── agent/
│       ├── __init__.py
│       ├── tool_hijack.py
│       ├── mcp_exploit.py
│       ├── autonomy_abuse.py
│       ├── sandbox_escape.py
│       └── memory_poison.py
│
├── payloads/                          ← Attack strings (JSON)
│   ├── prompt_injection.json
│   ├── jailbreak.json
│   ├── encoding_attacks.json
│   ├── pii_leak.json
│   └── toxicity.json
│
├── llm/
│   ├── __init__.py
│   └── gateway.py                     ← LiteLLM wrapper
│
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

---

## 7. Build Order

| Phase | Task | Location |
|-------|------|----------|
| **1** | Create Python project structure + requirements.txt | Current laptop |
| **2** | Build BaseProbe class + payload loader | Current laptop |
| **3** | Build LLM probes (10 categories, ~50 probes) | Current laptop |
| **4** | Build Agent probes (5 categories) | Current laptop |
| **5** | Build LiteLLM gateway wrapper | Current laptop |
| **6** | Build LangGraph orchestrator | Current laptop |
| **7** | Build detectors + formatter | Current laptop |
| **8** | Build FastAPI main.py with all endpoints | Current laptop |
| **9** | Create Dockerfile + docker-compose.yml | Current laptop |
| **10** | Create DB migration (ai_security_scans) | Current laptop |
| **11** | Build VAPTShield API route /api/ai-security/* | Current laptop |
| **12** | Build VAPTShield frontend /scanner/ai-security | Current laptop |
| **13** | Deploy to worker laptop + test | Worker laptop |
| **14** | End-to-end testing with real LLM target | Both |

---

## 8. Testing Strategy

| Test | Target | Method |
|------|--------|--------|
| Unit tests | Each probe | pytest |
| Integration | Full scan flow | Local FastAPI + Groq |
| E2E | VAPTShield → Worker | Real scan against test LLM |
| Performance | 50+ probes | Measure scan time |

---

## 9. Success Criteria

- [ ] All 10 OWASP LLM Top 10 categories covered
- [ ] 5 custom agent probe categories
- [ ] Results flow into VAPTShield findings pipeline
- [ ] PDF/DOCX report with OWASP LLM Top 10 mapping
- [ ] Multi-tenant (org isolation)
- [ ] RBAC (admin + security_engineer only)
- [ ] Scan history + re-scan capability
- [ ] 100% free stack (Groq free tier)
