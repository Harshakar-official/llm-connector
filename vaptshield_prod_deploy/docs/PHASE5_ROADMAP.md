# Phase 5 — Scanner Integration: Complete Roadmap

> **Status:** Research & Planning  
> **Date:** 2026-05-14  
> **Goal:** End-to-end scanner infrastructure with Z+ security, org-level quotas, live streaming, and AI-powered result normalization — all on free tier.

---

## 1. ARCHITECTURE OVERVIEW

```
┌──────────────────────────────────────────────────────────────────────┐
│                        VAPTShield (Next.js 15)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │ Kali Terminal │  │  ZAP Proxy   │  │     CI/CD Pipeline           │ │
│  │ (WebSocket)   │  │ (SSE Stream) │  │  (Webhook → Queue → Worker)  │ │
│  └──────┬────────┘  └──────┬───────┘  └─────────────┬────────────────┘ │
│         │                  │                         │                  │
│         ▼                  ▼                         ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    Docker Manager (lib/docker/manager.ts)         │ │
│  │  • acquireDockerSlot() — atomic quota check                       │ │
│  │  • spawnContainer() — calls Worker API                            │ │
│  │  • heartbeat() — keeps container alive                            │ │
│  │  • killContainer() — release slot                                 │ │
│  └──────────────────────────────┬───────────────────────────────────┘ │
│                                 │                                      │
│                                 ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │              Worker API (Express on Docker Host)                  │ │
│  │  POST /spawn-kali    POST /spawn-zap    POST /spawn-cicd          │ │
│  │  POST /kill/:id      GET  /health        POST /cleanup-orphans    │ │
│  └──────────────────────────────┬───────────────────────────────────┘ │
│                                 │                                      │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     DOCKER HOST (Free Tier)                           │
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ Kali + ttyd      │  │ ZAP (owasp/zap2docker-stable)           │    │
│  │ Image: ~2GB      │  │ Image: ~1.5GB    │  │ semgrep, trivy,  │    │
│  │ Port: dynamic    │  │ Port: dynamic    │  │ gitleaks         │    │
│  │ Tools: nmap,     │  │ API: REST/JSON   │  │ Image: ~1GB      │    │
│  │ nikto, sqlmap,   │  │ Auth: context-   │  │ Output: JSON     │    │
│  │ nuclei, hydra... │  │ based (form,     │  │ Ephemeral:       │    │
│  │                  │  │ header, oauth2)  │  │ clone→scan→kill  │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
│                                                                       │
│  Network: scan-external (iptables blocks 10.0.0.0/8, 172.16.0.0/12,  │
│            192.168.0.0/16, 169.254.0.0/16)                            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. INFRASTRUCTURE DECISIONS — FREE HOSTING ANALYSIS

### Problem
We need a Docker host that can run multiple containers (Kali, ZAP, CI/CD tools) with:
- At least 4GB RAM (Kali alone needs ~1GB, ZAP ~1GB, CI/CD tools ~512MB each)
- Public IP or tunnel for WebSocket/SSE connectivity
- Persistent or semi-persistent (containers are ephemeral but host must stay up)
- **Zero cost**

### Options Analyzed

| Option | RAM | CPU | Storage | Network | Viability |
|--------|-----|-----|---------|---------|-----------|
| **Oracle Cloud Free Tier** | 24GB | 4 ARM cores | 200GB | Public IP | ⭐⭐⭐⭐⭐ BEST |
| **Google Cloud Run** | 2GB/instance | 2 vCPU | Ephemeral | Public URL | ⭐⭐ Limited RAM |
| **Railway.app Free** | 512MB | Shared | 1GB | Public URL | ⭐ Too small |
| **Render.com Free** | 512MB | Shared | Ephemeral | Public URL | ⭐ Too small |
| **Fly.io Free** | 256MB × 3 | Shared | 3GB | Public URL | ⭐ Too small |
| **Self-hosted (Kali Laptop)** | Your RAM | Your CPU | Your disk | Need tunnel | ⭐⭐⭐⭐ Good for dev |
| **Hugging Face Spaces** | 16GB | 4 vCPU | 50GB | Public URL | ⭐⭐⭐ Docker limited |

### Recommended Strategy: Hybrid Approach

```
DEVELOPMENT/TESTING (Phase 5.0):
  └─ Self-hosted on Kali laptop
     └─ Use Cloudflare Tunnel (free) to expose Docker API securely
     └─ No cost, full control, fast iteration

PRODUCTION/DEMO (Phase 5.9):
  └─ Oracle Cloud Free Tier (Ampere A1)
     └─ 4 ARM cores, 24GB RAM, 200GB storage — ALWAYS FREE
     └─ Install Docker + Worker API
     └─ Cloudflare Tunnel for secure exposure (no open ports)
```

### Why Oracle Cloud Free Tier Wins
- **Always free**, not a trial
- 24GB RAM can run 10+ containers simultaneously
- 4 ARM cores handle parallel scans
- 200GB storage for Docker images
- Public IP available
- Only limitation: ARM architecture (all our images support ARM64)

---

## 3. COMPONENT RANKING — EASIEST TO HARDEST

### 🟢 TIER 1 — EASY: CI/CD Pipeline (Semgrep, Trivy, Gitleaks)

**Why easiest:**
- No live interaction needed — fire-and-forget job
- All tools output structured JSON — no parsing complexity
- Containers are ephemeral (clone → scan → kill in < 5 min)
- No WebSocket/terminal streaming needed
- GitHub webhook is well-documented

**Complexity:** 3/10  
**Estimated time:** 2-3 days

### 🟡 TIER 2 — MEDIUM: ZAP Proxy Scanner

**Why medium:**
- Well-documented REST API for all operations
- Structured JSON output (alerts)
- Headless mode works perfectly in Docker
- Authentication support via ZAP context files
- SSE streaming for progress is straightforward
- Container lifecycle is predictable (scan → complete → kill)

**Complexity:** 5/10  
**Estimated time:** 3-4 days

### 🔴 TIER 3 — HARD: Kali Terminal

**Why hardest:**
- Live bidirectional WebSocket streaming (ttyd)
- Unstructured text output from 20+ different tools
- Each tool has different output format (nmap XML/text, nikto HTML/text, sqlmap verbose, nuclei JSON)
- Session persistence (user might run multiple commands over 30+ minutes)
- Network isolation critical (block SSRF to internal IPs)
- Scope validation before every scan command
- Heartbeat mechanism to prevent orphan containers
- "Save as Finding" requires parsing arbitrary terminal output

**Complexity:** 8/10  
**Estimated time:** 5-7 days

---

## 4. DETAILED IMPLEMENTATION PLAN

---

### PHASE 5.0 — Infrastructure Setup (Prerequisite)

#### Step 5.0.1: Docker Host Setup

**Option A: Self-hosted on Kali Laptop (for development)**
```bash
# On Kali laptop
sudo apt install docker.io docker-compose
sudo systemctl enable docker

# Install Cloudflare Tunnel
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Create tunnel to expose Docker API
cloudflared tunnel create vaptshield-worker
cloudflared tunnel route dns vaptshield-worker vaptshield-worker.yourdomain.com
cloudflared tunnel run --url tcp://localhost:2376 vaptshield-worker
```

**Option B: Oracle Cloud Free Tier (for production)**
```bash
# Create Oracle Cloud account → Launch Ampere A1 instance
# Ubuntu 22.04, 4 OCPU, 24GB RAM, 200GB storage

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# Install Cloudflare Tunnel (same as above)
# Docker images need ARM64 variants
```

#### Step 5.0.2: Worker API Setup

Create `worker/` directory with Express server:

```
worker/
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts          — Express server entry
│   ├── routes/
│   │   ├── kali.ts       — POST /spawn-kali, POST /kill/:id
│   │   ├── zap.ts        — POST /spawn-zap, POST /kill/:id
│   │   ├── cicd.ts       — POST /spawn-cicd
│   │   └── health.ts     — GET /health
│   ├── docker/
│   │   ├── manager.ts    — Dockerode wrapper
│   │   ├── network.ts    — Restricted network creation
│   │   └── images.ts     — Image pull & cache management
│   ├── jobs/
│   │   ├── cicd-runner.ts — Clone → semgrep → trivy → gitleaks
│   │   └── pdf-generator.ts — Future: Phase 6
│   └── middleware/
│       └── auth.ts       — API key verification
└── templates/
    └── zap-context/      — ZAP context templates
```

**Worker API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/spawn-kali` | API Key | Spawn Kali container, return `{ containerId, wsUrl, port }` |
| POST | `/spawn-zap` | API Key | Spawn ZAP container, return `{ containerId, apiUrl, apiKey }` |
| POST | `/spawn-cicd` | API Key | Spawn CI/CD container, run tools, return results |
| POST | `/kill/:containerId` | API Key | Force kill container |
| POST | `/cleanup-orphans` | Cron Secret | Kill containers with no heartbeat > 90s |
| GET | `/health` | None | Health check + Docker info |

#### Step 5.0.3: Docker Images

```dockerfile
# worker/Dockerfile.kali
FROM kalilinux/kali-rolling:latest

RUN apt-get update && apt-get install -y \
    nmap nikto sqlmap nuclei hydra metasploit-framework \
    dirb gobuster wfuzz enum4linux smbclient \
    python3 python3-pip nodejs npm curl wget git \
    && apt-get clean

# Install ttyd for web terminal
RUN curl -L https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64 -o /usr/local/bin/ttyd \
    && chmod +x /usr/local/bin/ttyd

# Entry: ttyd on port 7681
EXPOSE 7681
CMD ["ttyd", "-p", "7681", "-c", "user:pass", "bash"]
```

```dockerfile
# worker/Dockerfile.zap
FROM owasp/zap2docker-stable:latest

# ZAP runs on port 8080, API on 8090
EXPOSE 8080 8090

# Start ZAP in headless mode with API
CMD ["zap.sh", "-daemon", "-host", "0.0.0.0", "-port", "8080", \
     "-config", "api.addrs.addr.name=.*", \
     "-config", "api.addrs.addr.regex=true", \
     "-config", "api.disablekey=true"]
```

```dockerfile
# worker/Dockerfile.cicd
FROM alpine:latest

RUN apk add --no-cache \
    git curl bash python3 py3-pip nodejs npm \
    && pip3 install semgrep \
    && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh \
    && curl -sfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_linux_amd64.tar.gz | tar xz -C /usr/local/bin

COPY src/jobs/cicd-runner.sh /runner.sh
RUN chmod +x /runner.sh

ENTRYPOINT ["/runner.sh"]
```

#### Step 5.0.4: Network Isolation

```bash
# Create restricted Docker network
docker network create \
  --driver bridge \
  --opt com.docker.network.bridge.name=scan-external \
  scan-external

# Block private IP ranges (prevents SSRF)
iptables -I FORWARD -i scan-external -d 10.0.0.0/8 -j DROP
iptables -I FORWARD -i scan-external -d 172.16.0.0/12 -j DROP
iptables -I FORWARD -i scan-external -d 192.168.0.0/16 -j DROP
iptables -I FORWARD -i scan-external -d 169.254.0.0/16 -j DROP  # AWS/cloud metadata
iptables -I FORWARD -i scan-external -d 100.64.0.0/10 -j DROP   # Carrier-grade NAT
```

---

### PHASE 5.1 — CI/CD Pipeline (EASIEST — Build First)

#### Architecture
```
GitHub PR/Push → Webhook → VAPTShield API
  → Verify HMAC signature
  → Check org CI quota (daily limit)
  → Enqueue job → Worker picks up
  → Clone repo (with PAT if private)
  → Run semgrep + trivy + gitleaks in parallel
  → Aggregate JSON results
  → AI normalize each finding
  → Store in scan_findings table
  → Post PR comment on GitHub
  → Send notification to project members
```

#### Files to Create

**`app/api/webhook/github/route.ts`** — GitHub webhook receiver
```typescript
// 1. Verify X-Hub-Signature-256 (HMAC-SHA256)
// 2. Extract event type (push, pull_request)
// 3. Find repo config by webhook secret
// 4. Check daily CI scan quota (atomic RPC)
// 5. Enqueue job to Worker API
// 6. Return 202 Accepted
```

**`app/(dashboard)/scanner/cicd/page.tsx`** — CI/CD Configuration UI
```
- "Add Repository" modal:
  - Repo URL (required)
  - GitHub PAT (optional, for private repos)
  - Branch (default: main)
  - Webhook secret (auto-generated, shown once)
- List of configured repos:
  - Name, last scan status, last scan date
  - "Run Scan Now" button
  - "Disconnect" button
- Setup instructions for GitHub webhook
```

**`lib/encryption.ts`** — AES-256-GCM for PAT storage
```typescript
// Encrypt GitHub PATs before storing in DB
// Key from ENCRYPTION_KEY env var
```

**`worker/src/jobs/cicd-runner.ts`** — CI/CD scan executor
```typescript
// 1. Clone repo (git clone with PAT if private)
// 2. Run in parallel:
//    - semgrep --json --config=auto .
//    - trivy fs --format json .
//    - gitleaks detect --report-format json --no-git
// 3. Parse each tool's JSON output
// 4. Aggregate into unified finding format
// 5. Return results to main API
```

#### Database Tables Needed
```sql
-- Already in schema? Check if these exist:
CREATE TABLE IF NOT EXISTS ci_cd_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
  repo_url TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  webhook_secret TEXT NOT NULL,
  encrypted_pat TEXT, -- AES-256-GCM encrypted
  is_active BOOLEAN DEFAULT true,
  last_scan_at TIMESTAMPTZ,
  last_scan_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
  scan_type TEXT NOT NULL, -- 'zap', 'kali', 'cicd'
  tool_name TEXT, -- 'semgrep', 'trivy', 'gitleaks', 'nmap', etc.
  target TEXT,
  status TEXT DEFAULT 'pending', -- pending, running, completed, failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  findings_count INTEGER DEFAULT 0,
  raw_output TEXT, -- full raw output stored
  triggered_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scan_history(id),
  org_id UUID REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  file_path TEXT, -- for CI/CD findings
  line_number INTEGER, -- for CI/CD findings
  raw_data JSONB, -- original tool output
  ai_normalized JSONB, -- AI-normalized finding data
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  vuln_id UUID, -- linked vulnerability after approval
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Key Design Decisions for CI/CD

1. **Why CI/CD is easiest:** No live streaming. Fire-and-forget. All tools output JSON. Container runs < 5 min.
2. **Parallel execution:** semgrep, trivy, gitleaks run simultaneously in the same container (they're all CLI tools, no port conflicts).
3. **GitHub PR comment:** Use GitHub API to post a summary table. This is the "wow factor" for demo.
4. **AI patch suggestion:** After finding vulnerabilities, call AI patch endpoint to generate fixes. Show diff in PR comment.

---

### PHASE 5.2 — ZAP Proxy Scanner (MEDIUM — Build Second)

#### Architecture
```
User configures scan → POST /api/scan/zap/start
  → Validate target against project scope
  → Check Docker quota (atomic)
  → Spawn ZAP container via Worker API
  → Configure ZAP via REST API:
      - Set target context
      - Configure authentication (form/header/oauth2)
      - Set scan policy
      - Start spider → then active scan
  → Return { scanId }

Frontend connects to SSE stream:
  GET /api/scan/zap/{scanId}/stream
  → Polls ZAP API every 2 seconds
  → Streams progress % + new alerts
  → On completion: fetch all alerts, kill container, release slot

User reviews findings → clicks "Approve"
  → AI normalize → create vulnerability → link to project
```

#### Files to Create

**`app/(dashboard)/scanner/zap/page.tsx`** — ZAP Scanner UI
```
Two-column layout:
  LEFT (config form):
    - Project selector (required)
    - Target URL (validated against project scope)
    - Auth type: None | Form-based | Header/Token | OAuth2 | Cookie
    - Conditional fields based on auth type
    - Scan type: Spider only | Active scan | Full scan
    - "Start Scan" button
  
  RIGHT (live results):
    - Status indicator (Idle → Spidering → Scanning → Completed)
    - Progress bar with percentage
    - Live alerts table (SSE stream)
    - Each row: severity badge + title + URL + "Approve" button
```

**`app/api/scan/zap/start/route.ts`** — Start ZAP scan
```typescript
// 1. Auth + permission (admin/SE only)
// 2. Validate target against project scope
// 3. Check Docker quota (acquireDockerSlot)
// 4. Call Worker API POST /spawn-zap
// 5. Configure ZAP via REST API:
//    - Create context for target
//    - Set authentication (if configured)
//    - Start spider
//    - Start active scan after spider completes
// 6. Insert scan_history row
// 7. Return { scanId, apiUrl }
```

**`app/api/scan/zap/[id]/stream/route.ts`** — SSE progress stream
```typescript
// 1. Verify scan belongs to user's org
// 2. Set up SSE response headers
// 3. Poll ZAP API every 2 seconds:
//    - GET /JSON/spider/view/status/
//    - GET /JSON/ascan/view/status/
//    - GET /JSON/core/view/alerts/?baseurl={target}
// 4. Stream progress + new alerts to client
// 5. On completion:
//    - Fetch all alerts
//    - Kill ZAP container
//    - Release Docker slot
//    - Insert scan_findings rows
//    - Send final event
```

**`app/api/scan/zap/[id]/alerts/route.ts`** — Fetch all alerts
```typescript
// GET /JSON/core/view/alerts/?baseurl={target}&start={offset}&count={limit}
// Returns paginated alerts for the scan
```

#### ZAP Authentication Support

```typescript
// ZAP context configuration for different auth types
const ZAP_AUTH_CONFIGS = {
  form_based: {
    loginUrl: string,
    loginRequestData: string, // "username={%username%}&password={%password%}"
    username: string,
    password: string,
  },
  header_token: {
    headerName: string, // "Authorization"
    headerValue: string, // "Bearer {token}"
  },
  oauth2: {
    tokenUrl: string,
    clientId: string,
    clientSecret: string,
    scope: string,
  },
  cookie: {
    cookieName: string,
    cookieValue: string,
  }
}
```

#### Key Design Decisions for ZAP

1. **Why ZAP is medium:** REST API is well-documented. JSON output. No terminal streaming. But authentication setup is complex and container lifecycle needs careful management.
2. **Per-scan ZAP instance:** Each scan gets its own ZAP container (Problem 6 solution). No shared state between scans.
3. **SSE for progress:** Server-Sent Events are simpler than WebSocket for one-way progress streaming. Frontend uses `EventSource` API.
4. **Auto-kill on completion:** ZAP container is killed immediately after scan completes. No heartbeat needed (unlike Kali terminal).

---

### PHASE 5.3 — Kali Terminal (HARDEST — Build Last)

#### Architecture
```
User opens Terminal page → clicks "Start Terminal"
  → Check Docker quota (atomic)
  → Spawn Kali container via Worker API
  → Return { wsUrl, sessionToken }
  → Frontend embeds ttyd iframe or xterm.js WebSocket

User types commands in terminal:
  → Commands go through WebSocket to container
  → Output streams back in real-time
  → Heartbeat ping every 30 seconds

User clicks "Save as Finding":
  → Capture last N lines of terminal output
  → Send to AI normalize endpoint
  → Show structured finding preview
  → User confirms → creates vulnerability

Container lifecycle:
  → Heartbeat every 30s from frontend
  → Cron job kills containers with no heartbeat > 90s
  → Hard max TTL: 4 hours
  → User can manually "Stop Terminal"
```

#### Files to Create

**`app/(dashboard)/scanner/terminal/page.tsx`** — Kali Terminal UI
```
Two-column layout:
  LEFT (240px tools sidebar):
    - Categorized list of installed Kali tools
    - Each tool: icon + name + brief description on hover
    - Categories:
      • Network Scanning: nmap, masscan, netcat
      • Web Application: nikto, dirb, gobuster, wfuzz, burp (if available)
      • Vulnerability Scanning: nuclei, sqlmap, xsstrike
      • Exploitation: metasploit, hydra, john
      • Forensics: binwalk, foremost, volatility
    - Click tool → inserts command template into terminal
  
  RIGHT (terminal area):
    - Top bar:
      • Status indicator (green dot = connected)
      • Target input (validated against project scope)
      • "Start Terminal" / "Stop" button
      • "Save as Finding" button
      • Session timer
    - Terminal iframe (ttyd) or xterm.js WebSocket
    - Bottom bar: quota usage indicator
```

**`app/api/terminal/spawn/route.ts`** — Spawn Kali container
```typescript
// 1. Auth + permission (admin/SE only)
// 2. Validate project access
// 3. Check Docker quota (acquireDockerSlot)
// 4. Call Worker API POST /spawn-kali
// 5. Insert docker_sessions row
// 6. Return { wsUrl, sessionToken, containerId, expiresAt }
```

**`app/api/terminal/heartbeat/[id]/route.ts`** — Heartbeat endpoint
```typescript
// 1. Auth check
// 2. Verify container belongs to user
// 3. Update docker_sessions.last_heartbeat = now()
// 4. Return { alive: true }
```

**`app/api/terminal/save-finding/route.ts`** — Save terminal output as finding
```typescript
// 1. Auth + permission
// 2. Receive { containerId, terminalOutput, toolName }
// 3. Call AI normalize with raw output
// 4. Return structured finding for user review
// 5. On confirm: create vulnerability
```

**`app/api/cron/cleanup-orphans/route.ts`** — Cron cleanup
```typescript
// 1. Verify Vercel Cron secret header
// 2. Find containers with:
//    - last_heartbeat < now() - 90 seconds
//    - OR created_at < now() - 4 hours (hard TTL)
// 3. Call Worker API POST /kill/:id for each
// 4. Release Docker slots
// 5. Log to audit_log
```

#### Terminal Output Parsing Strategy

This is the hardest part. Each Kali tool outputs differently:

| Tool | Output Format | Parsing Strategy |
|------|--------------|------------------|
| **nmap** | Text + XML (`-oX`) | Parse XML for ports, services, versions |
| **nikto** | Text + HTML | Regex for vulnerability lines |
| **sqlmap** | Verbose text | Parse task logs for injection points |
| **nuclei** | JSON (`-json`) | Direct JSON parsing — easiest |
| **hydra** | Text table | Regex for successful credentials |
| **dirb/gobuster** | Text lines | Parse for discovered paths + status codes |
| **enum4linux** | Text sections | Regex for shares, users, groups |

**Recommended approach:**
1. **Encourage nuclei first** — it outputs JSON natively, easiest to parse
2. **For nmap:** Always suggest `-oX -` flag to get XML output
3. **For other tools:** Use AI to parse unstructured output (send raw text to Groq with a "parse this tool output" prompt)
4. **Fallback:** If AI parsing fails, save raw output and let user manually create finding

```typescript
// lib/ai/tool-parsers.ts
export async function parseToolOutput(toolName: string, rawOutput: string) {
  switch (toolName) {
    case 'nuclei':
      return parseNucleiJSON(rawOutput) // Direct JSON
    case 'nmap':
      return parseNmapXML(rawOutput) // XML parsing
    default:
      return aiParseOutput(toolName, rawOutput) // AI fallback
  }
}
```

#### Key Design Decisions for Kali Terminal

1. **ttyd vs xterm.js:** ttyd is simpler (just an iframe) but less control. xterm.js gives full control over input/output but requires WebSocket management. **Recommendation: Start with ttyd for MVP, migrate to xterm.js later.**
2. **Scope validation:** Before any scan command, frontend warns if target is outside project scope. API-level enforcement when "Save as Finding" is clicked.
3. **Network isolation:** iptables rules on Docker host block all private IPs. Even if user types `nmap 10.0.0.1`, it won't work.
4. **Session persistence:** Container stays alive as long as heartbeat is received. User can run multiple commands over 30+ minutes.
5. **"Save as Finding" flow:** User highlights terminal output → clicks button → AI parses → shows preview → user confirms → finding created.

---

## 5. QUOTA & RESOURCE MANAGEMENT

### Quota Tiers (Free)

| Resource | Free Tier Limit |
|----------|----------------|
| Concurrent Docker containers | 1 (Kali OR ZAP, not both) |
| CI/CD scans per day | 3 |
| Max container lifetime | 4 hours |
| Max idle time (no heartbeat) | 90 seconds |

### Atomic Quota Functions

```sql
-- Supabase RPC: acquire_docker_slot
CREATE OR REPLACE FUNCTION acquire_docker_slot(p_org_id UUID)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  UPDATE org_quotas
  SET active_docker_containers = active_docker_containers + 1
  WHERE org_id = p_org_id
    AND active_docker_containers < (max_docker_containers + COALESCE(paid_extra_docker, 0))
  RETURNING org_id INTO v_session_id;
  
  IF v_session_id IS NULL THEN
    RETURN NULL; -- quota full
  END IF;
  
  RETURN gen_random_uuid(); -- new session ID
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supabase RPC: release_docker_slot
CREATE OR REPLACE FUNCTION release_docker_slot(p_org_id UUID, p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE org_quotas
  SET active_docker_containers = GREATEST(active_docker_containers - 1, 0)
  WHERE org_id = p_org_id;
  
  DELETE FROM docker_sessions WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supabase RPC: check_ci_scan_quota
CREATE OR REPLACE FUNCTION check_ci_scan_quota(p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_max INTEGER;
  v_today_count INTEGER;
BEGIN
  SELECT max_ci_scans_per_day INTO v_max FROM org_quotas WHERE org_id = p_org_id;
  
  SELECT COUNT(*) INTO v_today_count
  FROM scan_history
  WHERE org_id = p_org_id
    AND scan_type = 'cicd'
    AND created_at::date = CURRENT_DATE;
  
  IF v_today_count >= v_max THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Docker Sessions Table

```sql
CREATE TABLE IF NOT EXISTS docker_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES profiles(id),
  project_id UUID REFERENCES projects(id),
  container_id TEXT NOT NULL,
  container_name TEXT NOT NULL,
  container_type TEXT NOT NULL, -- 'kali', 'zap', 'cicd'
  port INTEGER NOT NULL,
  ws_url TEXT,
  api_url TEXT,
  status TEXT DEFAULT 'running', -- running, stopped, killed, orphaned
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  max_lifetime_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '4 hours'),
  created_at TIMESTAMPTZ DEFAULT now(),
  stopped_at TIMESTAMPTZ
);
```

---

## 6. SECURITY — Z+ LAYER

### Network Isolation (Docker Host Level)
```bash
# Block all private/internal IP ranges
iptables -I FORWARD -i scan-external -d 10.0.0.0/8 -j DROP
iptables -I FORWARD -i scan-external -d 172.16.0.0/12 -j DROP
iptables -I FORWARD -i scan-external -d 192.168.0.0/16 -j DROP
iptables -I FORWARD -i scan-external -d 169.254.0.0/16 -j DROP
iptables -I FORWARD -i scan-external -d 100.64.0.0/10 -j DROP
iptables -I FORWARD -i scan-external -d 224.0.0.0/4 -j DROP   # Multicast
iptables -I FORWARD -i scan-external -d 240.0.0.0/4 -j DROP   # Reserved
```

### Scope Validation (API Level)
```typescript
// Every scan target must be validated against project scope
async function validateScanTarget(target: string, projectId: string, orgId: string) {
  const project = await getProject(projectId, orgId)
  const scope = project.scope?.split('\n').map(s => s.trim()).filter(Boolean) || []
  
  if (scope.length === 0) {
    // No scope defined — allow but warn
    return { allowed: true, warning: 'No scope defined for this project' }
  }
  
  const isInScope = scope.some(s => target.includes(s) || target.match(new RegExp(s)))
  
  if (!isInScope) {
    await createAuditLog({
      action: 'scan.out_of_scope_attempt',
      resource_type: 'project',
      resource_id: projectId,
      new_value: { target }
    })
    return { allowed: false, error: `Target "${target}" is not in approved scope` }
  }
  
  return { allowed: true }
}
```

### Worker API Authentication
```typescript
// worker/src/middleware/auth.ts
const DOCKER_HOST_API_KEY = process.env.DOCKER_HOST_API_KEY!

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || authHeader !== `Bearer ${DOCKER_HOST_API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}
```

### Container Resource Limits
```typescript
// Every container gets strict resource limits
const CONTAINER_LIMITS = {
  kali: { cpus: '1.0', memory: '1g', memorySwap: '1g' },
  zap:  { cpus: '1.0', memory: '1g', memorySwap: '1g' },
  cicd: { cpus: '0.5', memory: '512m', memorySwap: '512m' },
}
```

---

## 7. BUILD ORDER — RECOMMENDED SEQUENCE

```
Week 1: Infrastructure + CI/CD
  ├── Day 1-2: Set up Docker host (Oracle Cloud or self-hosted)
  ├── Day 2-3: Build Worker API (Express + Dockerode)
  ├── Day 3-4: Build CI/CD pipeline (webhook → semgrep/trivy/gitleaks)
  └── Day 4-5: CI/CD UI + GitHub PR comment integration

Week 2: ZAP Proxy
  ├── Day 1-2: ZAP container + Worker API endpoints
  ├── Day 2-3: ZAP scanner UI (config form + live results)
  ├── Day 3-4: SSE streaming + authentication support
  └── Day 4-5: Approval workflow + AI normalization

Week 3: Kali Terminal
  ├── Day 1-2: Kali container + ttyd setup
  ├── Day 2-3: Terminal UI (tools sidebar + terminal iframe)
  ├── Day 3-4: Heartbeat + cleanup cron
  ├── Day 4-5: "Save as Finding" + AI output parsing
  └── Day 5-6: Network isolation + scope validation

Week 4: Polish + Integration
  ├── Day 1-2: Scan history page (unified view)
  ├── Day 2-3: Quota UI (usage meters, upgrade prompts)
  └── Day 3-4: End-to-end testing + security audit
```

---

## 8. DEPENDENCIES & PREREQUISITES

### New NPM Packages
```json
{
  "dockerode": "^4.0.0",       // Docker API client (Worker)
  "express": "^4.18.0",         // Worker API server
  "cors": "^2.8.5",             // CORS for Worker
  "xterm": "^5.3.0",            // Terminal emulator (optional, for xterm.js)
  "xterm-addon-fit": "^0.8.0",  // xterm addon
  "@xterm/xterm": "^5.3.0"      // Alternative xterm package
}
```

### Environment Variables (add to .env.example)
```bash
# Docker Worker
DOCKER_HOST_API_URL=http://localhost:3001
DOCKER_HOST_API_KEY=random-64-char-secret

# Encryption (for GitHub PATs)
ENCRYPTION_KEY=random-32-byte-hex

# GitHub App (for PR comments)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_INSTALLATION_ID=

# Cloudflare Tunnel (optional)
CLOUDFLARE_TUNNEL_TOKEN=
```

### Supabase Migrations Needed
- `018_docker_sessions.sql` — docker_sessions table
- `019_scan_tables.sql` — scan_history + scan_findings + ci_cd_configs
- `020_quota_functions.sql` — acquire_docker_slot, release_docker_slot, check_ci_scan_quota

---

## 9. RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docker host goes down | All scanners unavailable | Health check endpoint + auto-restart |
| Container orphan leak | Quota permanently consumed | Heartbeat + cron cleanup every 5 min |
| Kali user runs malicious command | SSRF, data exfiltration | Network isolation (iptables) + scope validation |
| ZAP scan takes too long | Container runs for hours | Hard TTL of 4 hours + progress timeout |
| AI parsing fails for tool output | Finding not created | Fallback: save raw output, let user manually create |
| GitHub PAT leaked | Repo compromise | AES-256-GCM encryption at rest, never logged |
| Oracle Cloud kills instance | Everything down | Weekly backup of worker config, documented redeploy steps |
| ARM64 incompatibility | Some Docker images fail | All chosen images support ARM64 (verified) |

---

## 10. WHAT "DONE" LOOKS LIKE FOR PHASE 5

- [ ] CI/CD: Push to GitHub → webhook fires → scan runs → PR comment appears with results
- [ ] CI/CD: AI patch suggestion shown for code vulnerabilities
- [ ] ZAP: Configure target + auth → start scan → live progress → alerts appear → approve → finding created
- [ ] ZAP: OAuth2/Keycloak authentication works for authenticated scanning
- [ ] Kali: Start terminal → run nmap/nikto/sqlmap → live output → save as finding → AI parses → finding created
- [ ] Kali: Try `nmap 10.0.0.1` → blocked by network policy
- [ ] Quota: User A starts Kali → User B tries ZAP → "Quota full" error
- [ ] Quota: User leaves terminal idle 90s → cron kills container → slot released
- [ ] Scan history: All scans visible with raw output + AI-normalized findings
- [ ] `npm run build` clean, zero TypeScript errors
- [ ] All 5 roles tested with correct scanner permissions