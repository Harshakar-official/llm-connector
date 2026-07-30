# Phase 5 — Multi-Tenant Docker Container Strategy: All Edge Cases

> **Purpose:** Answer every question about how multiple orgs, multiple users, plan upgrades, and resource contention are handled in the scanner infrastructure.

---

## 1. THE CORE MODEL: Image vs Container

### Fundamental Docker Concept

```
┌─────────────────────────────────────────────────────────────────┐
│                     DOCKER HOST (Oracle Cloud)                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    DOCKER IMAGES (Templates)                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │ │
│  │  │ kali-ttyd    │  │ zap-stable   │  │ cicd-tools       │   │ │
│  │  │ (2GB)        │  │ (1.5GB)      │  │ (1GB)            │   │ │
│  │  │ Downloaded   │  │ Downloaded   │  │ Downloaded       │   │ │
│  │  │ ONCE only    │  │ ONCE only    │  │ ONCE only        │   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                     │
│                              ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              RUNNING CONTAINERS (Instances)                   │ │
│  │                                                               │ │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │ │
│  │  │ kali-orgA  │ │ kali-orgB  │ │ zap-orgA   │ │ cicd-orgC │ │ │
│  │  │ user1      │ │ user5      │ │ scan-123   │ │ job-456   │ │ │
│  │  │ Port: 9001 │ │ Port: 9002 │ │ Port: 9003 │ │ Ephemeral │ │ │
│  │  │ RAM: 1GB   │ │ RAM: 1GB   │ │ RAM: 1GB   │ │ RAM:512MB │ │ │
│  │  └────────────┘ └────────────┘ └────────────┘ └───────────┘ │ │
│  │                                                               │ │
│  │  Total: 4 containers from 3 images, ~3.5GB RAM used          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Answer: 1 image, N containers.** The Kali image is downloaded ONCE. Each scan session spawns a NEW container from that image. Containers are isolated — Org A's container cannot see Org B's container.

---

## 2. MULTI-ORG CONCURRENT SCANS — HOW IT WORKS

### Scenario: Org A runs `nmap google.com`, Org B runs `nikto scanme.org` — SAME TIME

```
TIME: 10:00:00 AM
─────────────────────────────────────────────────────────────

Org A (Free Plan — 1 slot):
  User: raj@orgA.com
  Action: Opens Kali Terminal → clicks "Start Terminal"
  
  Backend Flow:
  1. acquireDockerSlot(orgA_id) → SUCCESS (0/1 slots used → now 1/1)
  2. Worker API: POST /spawn-kali { orgId: orgA, userId: raj }
  3. Docker: docker run -d --name kali-orgA-raj-1715678400 \
              --network scan-external \
              --cpus=1 --memory=1g \
              -p 9001:7681 \
              kali-ttyd:latest
  4. Container ID: abc123, Port: 9001
  5. Insert docker_sessions row
  6. Return wsUrl: wss://worker.vaptshield.com:9001

Org B (Free Plan — 1 slot):
  User: priya@orgB.com
  Action: Opens Kali Terminal → clicks "Start Terminal"
  
  Backend Flow:
  1. acquireDockerSlot(orgB_id) → SUCCESS (0/1 slots used → now 1/1)
  2. Worker API: POST /spawn-kali { orgId: orgB, userId: priya }
  3. Docker: docker run -d --name kali-orgB-priya-1715678405 \
              --network scan-external \
              --cpus=1 --memory=1g \
              -p 9002:7681 \
              kali-ttyd:latest
  4. Container ID: def456, Port: 9002
  5. Insert docker_sessions row
  6. Return wsUrl: wss://worker.vaptshield.com:9002

RESULT:
  ✅ Org A has container on port 9001 — runs nmap google.com
  ✅ Org B has container on port 9002 — runs nikto scanme.org
  ✅ Both containers are ISOLATED (different network namespaces)
  ✅ Both orgs used their OWN quota slot (1/1 each)
  ✅ Docker host: 2 containers running, ~2GB RAM used
```

### Key Insight: Quota is PER ORG, not global

```
Org A quota: 1/1 used → cannot start another
Org B quota: 1/1 used → cannot start another
Org C quota: 0/1 used → CAN start one

Total Docker host: 2/24GB RAM used → plenty of room
```

The Docker host has 24GB RAM. Even with 10 orgs each using 1 container (1GB each), that's only 10GB. The limiting factor is **per-org quota**, not host capacity.

---

## 3. PLAN UPGRADE — DYNAMIC QUOTA INCREASE

### Scenario: Org upgrades from Free (1 slot) → Pro (3 slots)

```
BEFORE UPGRADE:
  org_quotas table:
  ┌─────────┬──────────────────┬─────────────────────┐
  │ org_id  │ max_docker_cont… │ paid_extra_docker   │
  ├─────────┼──────────────────┼─────────────────────┤
  │ orgA    │ 1                │ 0                   │
  └─────────┴──────────────────┴─────────────────────┘
  
  Effective slots: max_docker_containers + paid_extra_docker = 1 + 0 = 1

UPGRADE FLOW:
  1. Admin clicks "Upgrade to Pro" → Stripe Checkout
  2. Payment succeeds → Stripe webhook fires
  3. Webhook handler updates org_quotas:
     UPDATE org_quotas 
     SET plan_tier = 'pro',
         max_docker_containers = 3,
         max_projects = 999999,
         max_users = 50,
         max_ci_scans_per_day = 999999
     WHERE org_id = 'orgA'

AFTER UPGRADE:
  org_quotas table:
  ┌─────────┬──────────────────┬─────────────────────┐
  │ org_id  │ max_docker_cont… │ paid_extra_docker   │
  ├─────────┼──────────────────┼─────────────────────┤
  │ orgA    │ 3                │ 0                   │
  └─────────┴──────────────────┴─────────────────────┘
  
  Effective slots: 3 + 0 = 3

IMMEDIATE EFFECT:
  ✅ User raj already has 1 container running (slot 1/3)
  ✅ User priya can NOW start a second container (slot 2/3)
  ✅ User amit can NOW start a third container (slot 3/3)
  ✅ No container restart needed — quota check happens on NEXT spawn attempt
```

### The `acquire_docker_slot` function handles this automatically:

```sql
CREATE OR REPLACE FUNCTION acquire_docker_slot(p_org_id UUID)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Atomic: only increment if active < (base_max + paid_extra)
  UPDATE org_quotas
  SET active_docker_containers = active_docker_containers + 1
  WHERE org_id = p_org_id
    AND active_docker_containers < (max_docker_containers + COALESCE(paid_extra_docker, 0))
  RETURNING org_id INTO v_session_id;
  
  IF v_session_id IS NULL THEN
    RETURN NULL; -- quota full
  END IF;
  
  RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**No "Docker shuffling" needed.** Containers are independent. When quota increases, new containers can be spawned. Existing containers are unaffected. When quota decreases (downgrade), existing containers are NOT killed — but new ones can't be spawned until `active < max`.

---

## 4. MULTIPLE USERS IN SAME ORG — RESOURCE ABUSE PREVENTION

### Scenario: 3 users in Org A (Pro plan, 3 slots) all try to scan simultaneously

```
Org A — Pro Plan (3 Docker slots)
Users: raj, priya, amit (all Security Engineers)

TIME: 10:00:00
  raj clicks "Start Terminal" → acquireDockerSlot → SUCCESS → 1/3
  priya clicks "Start Terminal" → acquireDockerSlot → SUCCESS → 2/3
  amit clicks "Start Terminal" → acquireDockerSlot → SUCCESS → 3/3

TIME: 10:01:00
  raj tries to start ANOTHER terminal (already has one)
  → acquireDockerSlot → FAIL (3/3 slots used)
  → Error: "Docker quota full. Your org has 3 container slots. All 3 are in use."

TIME: 10:05:00
  New user neha joins org, tries to start terminal
  → acquireDockerSlot → FAIL (3/3 slots used)
  → Error: "All scan slots are currently in use. Please wait for an active scan to complete."
```

### Per-User Limits (additional layer)

```typescript
// lib/docker/quota.ts
export async function acquireDockerSlot(orgId: string, userId: string, type: 'kali' | 'zap') {
  // 1. Check if user already has an active container of this type
  const { data: existingSession } = await supabase
    .from('docker_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('container_type', type)
    .eq('status', 'running')
    .single()
  
  if (existingSession) {
    return { 
      error: 'already_running', 
      message: 'You already have an active terminal session. Please stop it before starting a new one.',
      existingSessionId: existingSession.id 
    }
  }
  
  // 2. Check org-level quota (atomic)
  const { data: slot } = await supabase.rpc('acquire_docker_slot', { p_org_id: orgId })
  
  if (!slot) {
    // Get current usage for better error message
    const { data: quota } = await supabase
      .from('org_quotas')
      .select('active_docker_containers, max_docker_containers, paid_extra_docker')
      .eq('org_id', orgId)
      .single()
    
    const max = (quota?.max_docker_containers || 1) + (quota?.paid_extra_docker || 0)
    const active = quota?.active_docker_containers || 0
    
    return { 
      error: 'quota_full', 
      message: `All ${max} scan slots are in use (${active}/${max}). Please wait for an active scan to complete or upgrade your plan.`,
      current: active,
      max 
    }
  }
  
  return { sessionId: slot, error: null }
}
```

### Resource Abuse Prevention Matrix

| Scenario | Prevention |
|----------|------------|
| User tries to open 2 Kali terminals | Blocked — one active session per user per type |
| 3 users in Free org (1 slot) try simultaneously | First one gets slot, others get "quota full" |
| User keeps terminal idle for hours | Heartbeat check — killed after 90s idle, hard TTL 4h |
| User rapidly starts/stops to hog resources | Rate limit: 3 spawn attempts per hour per user |
| Org tries to run ZAP + Kali on Free plan | Blocked — Free = 1 slot total (Kali OR ZAP) |
| User runs resource-heavy scan (e.g., full port scan) | Container CPU/memory limits enforced by Docker |

---

## 5. SCAN PRIORITY — WHO GETS THE SLOT?

### Strategy: First-Come, First-Served (FCFS) with Fairness

```
No priority queue needed for MVP because:
1. Scans are user-initiated, not automated
2. Container lifetime is short (minutes to hours, not days)
3. Atomic DB check ensures no race conditions
4. Users see clear "slots full" message with current usage

For future (Phase 6+):
  - Admin can force-kill any container in their org
  - "Queue" system: if slots full, user can join queue
  - When slot frees, next in queue gets notified
```

### What Happens When Slots Are Full

```
User clicks "Start Terminal":
  → acquireDockerSlot() returns { error: 'quota_full' }
  → Frontend shows modal:

  ┌──────────────────────────────────────────┐
  │  ⚠️  All Scan Slots In Use               │
  │                                          │
  │  Your organization has 1 container slot. │
  │  Currently: 1/1 slots active.            │
  │                                          │
  │  Active sessions:                        │
  │  • raj — Kali Terminal (started 12m ago) │
  │                                          │
  │  [Wait for slot]  [Upgrade Plan →]       │
  └──────────────────────────────────────────┘

  "Wait for slot": User can poll — when slot frees, button re-enables
  "Upgrade Plan": Redirects to billing page
```

---

## 6. PLAN TIER QUOTA TABLE

```sql
-- org_quotas table structure
CREATE TABLE org_quotas (
  org_id UUID PRIMARY KEY REFERENCES organizations(id),
  plan_tier TEXT DEFAULT 'free', -- free, starter, pro, enterprise
  
  -- Docker container limits
  max_docker_containers INTEGER DEFAULT 1,  -- base limit by plan
  paid_extra_docker INTEGER DEFAULT 0,       -- extra slots purchased
  active_docker_containers INTEGER DEFAULT 0, -- current running count
  
  -- CI/CD limits
  max_ci_scans_per_day INTEGER DEFAULT 3,
  ci_scans_today INTEGER DEFAULT 0,
  ci_scans_reset_at DATE DEFAULT CURRENT_DATE,
  
  -- Other limits
  max_projects INTEGER DEFAULT 5,
  max_users INTEGER DEFAULT 10,
  storage_limit_gb INTEGER DEFAULT 2,
  storage_used_gb REAL DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Plan Tier Defaults

| Plan | Docker Slots | CI Scans/Day | Projects | Users | Storage |
|------|-------------|--------------|----------|-------|---------|
| **Free** | 1 | 3 | 5 | 10 | 2GB |
| **Starter** | 2 | 20 | 20 | 25 | 10GB |
| **Pro** | 3 | Unlimited | Unlimited | 50 | 50GB |
| **Enterprise** | Custom | Custom | Custom | Custom | Custom |

### Upgrade/Downgrade Logic

```typescript
// lib/docker/quota.ts
export async function updatePlanTier(orgId: string, newTier: PlanTier) {
  const PLAN_DEFAULTS = {
    free:     { max_docker_containers: 1, max_ci_scans_per_day: 3,   max_projects: 5,   max_users: 10,  storage_limit_gb: 2 },
    starter:  { max_docker_containers: 2, max_ci_scans_per_day: 20,  max_projects: 20,  max_users: 25,  storage_limit_gb: 10 },
    pro:      { max_docker_containers: 3, max_ci_scans_per_day: 999, max_projects: 999, max_users: 50,  storage_limit_gb: 50 },
    enterprise: { max_docker_containers: 10, max_ci_scans_per_day: 9999, max_projects: 9999, max_users: 9999, storage_limit_gb: 500 },
  }
  
  const defaults = PLAN_DEFAULTS[newTier]
  
  // Update quota — preserves paid_extra_docker and active_docker_containers
  const { error } = await supabaseAdmin
    .from('org_quotas')
    .update({
      plan_tier: newTier,
      max_docker_containers: defaults.max_docker_containers,
      max_ci_scans_per_day: defaults.max_ci_scans_per_day,
      max_projects: defaults.max_projects,
      max_users: defaults.max_users,
      storage_limit_gb: defaults.storage_limit_gb,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
  
  // NOTE: We do NOT kill existing containers on downgrade.
  // If active_docker_containers > new max, new spawns are blocked
  // until active drops below max (containers naturally expire or are stopped).
  
  return { success: !error }
}
```

---

## 7. COMPLETE EDGE CASE MATRIX

### Edge Case 1: User closes browser tab (forgets to stop terminal)
```
Detection: Heartbeat stops → 90 seconds pass
Action: Cron job kills container → releases slot
Result: Slot freed for other users
```

### Edge Case 2: Docker host crashes/restarts
```
Detection: Worker API health check fails
Action: All docker_sessions marked as 'orphaned'
        All org active_docker_containers reset to 0
        On next spawn: containers recreated fresh
Result: Clean slate, no permanent quota corruption
```

### Edge Case 3: User's internet disconnects during scan
```
Detection: Heartbeat stops
Action: Container stays alive for 90 seconds (grace period)
        If user reconnects within 90s → session resumes
        If not → container killed, slot released
Result: Graceful recovery for temporary disconnects
```

### Edge Case 4: ZAP scan running, user wants Kali too (Pro plan, 3 slots)
```
User has: ZAP scan active (slot 1/3)
User clicks: Start Kali Terminal
Result: ✅ Allowed — Kali starts on slot 2/3
Both run simultaneously, different ports, isolated containers
```

### Edge Case 5: ZAP scan running, user wants Kali too (Free plan, 1 slot)
```
User has: ZAP scan active (slot 1/1)
User clicks: Start Kali Terminal
Result: ❌ Blocked — "All 1 scan slots are in use"
Message: "A ZAP scan is currently running. Wait for it to complete or stop it."
```

### Edge Case 6: Admin force-kills another user's container
```
Admin opens: Organization → Active Sessions
Sees: priya — Kali Terminal (running 45 min)
Clicks: "Force Stop"
Flow: 
  1. Verify admin role
  2. Call Worker API POST /kill/:containerId
  3. Release Docker slot
  4. Mark session as 'killed_by_admin'
  5. Audit log: "admin raj force-stopped priya's Kali terminal"
  6. Notification to priya: "Your terminal session was stopped by admin"
Result: Slot freed, audit trail created
```

### Edge Case 7: Plan downgrade while containers are running
```
Before: Pro plan (3 slots), 2 containers running (2/3)
Admin downgrades to Free (1 slot)
After: max_docker_containers = 1, active = 2
Result: 
  ✅ Existing 2 containers continue running (not killed)
  ❌ New spawns blocked until active drops to 0 (below new max of 1)
  ⚠️  Admin sees warning: "You have 2 active containers but only 1 slot. 
      New scans blocked until active sessions end."
```

### Edge Case 8: Same user in 2 different orgs
```
User raj is member of Org A (admin) and Org B (security_engineer)
Raj starts terminal in Org A → slot used from Org A's quota
Raj switches to Org B → tries to start terminal
Result: ✅ Allowed — different org, different quota
Each org's quota is independent
```

### Edge Case 9: CI/CD scan quota exhausted
```
Org has used 3/3 CI scans today
GitHub webhook fires for 4th PR
Flow:
  1. check_ci_scan_quota(orgId) → FALSE
  2. Return 429 "Daily CI scan limit reached (3/3)"
  3. GitHub PR comment: "⚠️ VAPTShield: Daily scan limit reached. Upgrade for unlimited scans."
Result: Scan skipped, clear message posted
```

### Edge Case 10: Massive concurrent load (stress test)
```
Scenario: 20 orgs, all Pro plan (3 slots each = 60 potential containers)
Docker host: 24GB RAM

Worst case: 60 Kali containers × 1GB = 60GB → EXCEEDS 24GB

Mitigation:
  1. Global container cap: MAX_TOTAL_CONTAINERS = 20
  2. If host reaches cap → new spawns get "System busy, try again later"
  3. Monitoring: Prometheus + Grafana (future) or simple health check
  4. Container memory limits enforced by Docker (OOM killer if exceeded)

Realistic case: Most containers use < 500MB (not running heavy tools 24/7)
  60 containers × 500MB = 30GB → close to limit but manageable
  With 20 container cap: 20 × 500MB = 10GB → well within 24GB
```

---

## 8. DATABASE SCHEMA — COMPLETE

```sql
-- Migration 018: Docker sessions + scan tables

-- Docker sessions (tracks every container)
CREATE TABLE docker_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  container_id TEXT NOT NULL,
  container_name TEXT NOT NULL,
  container_type TEXT NOT NULL CHECK (container_type IN ('kali', 'zap', 'cicd')),
  port INTEGER NOT NULL,
  ws_url TEXT,
  api_url TEXT,
  status TEXT NOT NULL DEFAULT 'running' 
    CHECK (status IN ('running', 'stopped', 'killed', 'orphaned', 'killed_by_admin')),
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  max_lifetime_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '4 hours'),
  stopped_by UUID REFERENCES profiles(id),
  stop_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  stopped_at TIMESTAMPTZ
);

-- Index for heartbeat cleanup
CREATE INDEX idx_docker_sessions_heartbeat ON docker_sessions(last_heartbeat) 
  WHERE status = 'running';
CREATE INDEX idx_docker_sessions_org ON docker_sessions(org_id, status);

-- Scan history (unified for all scanner types)
CREATE TABLE scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  scan_type TEXT NOT NULL CHECK (scan_type IN ('zap', 'kali', 'cicd')),
  tool_name TEXT, -- 'nmap', 'nikto', 'semgrep', 'trivy', etc.
  target TEXT,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  findings_count INTEGER DEFAULT 0,
  raw_output TEXT,
  triggered_by UUID NOT NULL REFERENCES profiles(id),
  docker_session_id UUID REFERENCES docker_sessions(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scan_history_org ON scan_history(org_id, created_at DESC);
CREATE INDEX idx_scan_history_project ON scan_history(project_id);

-- Scan findings (individual results from scans)
CREATE TABLE scan_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES scan_history(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'informational')),
  tool_name TEXT NOT NULL,
  file_path TEXT,
  line_number INTEGER,
  raw_data JSONB,
  ai_normalized JSONB,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected')),
  vuln_id UUID, -- linked vulnerability after approval
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scan_findings_scan ON scan_findings(scan_id);
CREATE INDEX idx_scan_findings_status ON scan_findings(status);

-- CI/CD configurations
CREATE TABLE ci_cd_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  repo_url TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  repo_owner TEXT,
  branch TEXT DEFAULT 'main',
  webhook_secret TEXT NOT NULL,
  encrypted_pat TEXT, -- AES-256-GCM encrypted GitHub PAT
  is_active BOOLEAN DEFAULT true,
  last_scan_at TIMESTAMPTZ,
  last_scan_status TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cicd_configs_org ON ci_cd_configs(org_id);
```

---

## 9. QUOTA FUNCTIONS — COMPLETE SQL

```sql
-- Migration 020: Quota management functions

-- Atomic Docker slot acquisition
CREATE OR REPLACE FUNCTION acquire_docker_slot(p_org_id UUID)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  UPDATE org_quotas
  SET active_docker_containers = active_docker_containers + 1,
      updated_at = now()
  WHERE org_id = p_org_id
    AND active_docker_containers < (max_docker_containers + COALESCE(paid_extra_docker, 0))
  RETURNING org_id INTO v_session_id;
  
  IF v_session_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic Docker slot release
CREATE OR REPLACE FUNCTION release_docker_slot(p_org_id UUID, p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Decrement active count (never go below 0)
  UPDATE org_quotas
  SET active_docker_containers = GREATEST(active_docker_containers - 1, 0),
      updated_at = now()
  WHERE org_id = p_org_id;
  
  -- Mark session as stopped
  UPDATE docker_sessions
  SET status = 'stopped', stopped_at = now()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check CI scan daily quota
CREATE OR REPLACE FUNCTION check_ci_scan_quota(p_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_max INTEGER;
  v_today_count INTEGER;
BEGIN
  SELECT max_ci_scans_per_day INTO v_max 
  FROM org_quotas 
  WHERE org_id = p_org_id;
  
  -- Reset counter if new day
  UPDATE org_quotas 
  SET ci_scans_today = 0, ci_scans_reset_at = CURRENT_DATE
  WHERE org_id = p_org_id AND ci_scans_reset_at < CURRENT_DATE;
  
  SELECT ci_scans_today INTO v_today_count
  FROM org_quotas
  WHERE org_id = p_org_id;
  
  IF v_today_count >= v_max THEN
    RETURN FALSE;
  END IF;
  
  -- Increment counter
  UPDATE org_quotas
  SET ci_scans_today = ci_scans_today + 1
  WHERE org_id = p_org_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset all orphaned containers (called on worker restart)
CREATE OR REPLACE FUNCTION reset_orphaned_containers()
RETURNS VOID AS $$
BEGIN
  -- Mark all running sessions as orphaned
  UPDATE docker_sessions
  SET status = 'orphaned', stopped_at = now()
  WHERE status = 'running';
  
  -- Reset all active container counts
  UPDATE org_quotas
  SET active_docker_containers = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 10. SUMMARY: ANSWERS TO YOUR QUESTIONS

| Question | Answer |
|----------|--------|
| **2 Kali images or 1?** | **1 image, N containers.** Image downloaded once. Each scan = new container instance. |
| **Multi-org simultaneous scans?** | Each org has independent quota. Org A's container and Org B's container run side-by-side, fully isolated. |
| **Plan upgrade effect?** | Instant. `max_docker_containers` updated in DB. Next `acquire_docker_slot` call sees new limit. No container restart needed. |
| **Docker shuffling?** | None needed. Containers are independent. Upgrade just increases the number allowed. |
| **Multiple users same org?** | First-come, first-served via atomic DB function. When slots full, others see clear error with usage info. |
| **Resource abuse prevention?** | Per-user: 1 active session per type. Per-org: quota limit. Global: container cap. Docker: CPU/memory limits. Rate limit: 3 spawns/hour/user. |
| **Scan priority?** | FCFS (first-come, first-served). No priority queue for MVP. Admin can force-kill any container. |
| **Plan downgrade?** | Existing containers NOT killed. New spawns blocked until active count drops below new max. |