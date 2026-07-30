-- ============================================================================
-- 081_performance_indexes_and_triggers.sql
-- ----------------------------------------------------------------------------
-- Adds missing performance indexes and updated_at triggers identified during
-- the comprehensive security/performance audit.
-- ============================================================================

-- ── docker_sessions: composite index for frequent org+status queries ────────
CREATE INDEX IF NOT EXISTS idx_docker_sessions_org_status
  ON docker_sessions (org_id, status);

-- ── scan_history: composite index for stale scan detection ──────────────────
CREATE INDEX IF NOT EXISTS idx_scan_history_org_status_started
  ON scan_history (org_id, status, started_at);

-- ── scan_history: global stale scan detection (no org filter) ───────────────
CREATE INDEX IF NOT EXISTS idx_scan_history_status_started
  ON scan_history (status, started_at);

-- ── docker_sessions: index for container_id lookups ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_docker_sessions_container_id
  ON docker_sessions (container_id);

-- ── docker_sessions: index for heartbeat-based cleanup ─────────────────────
CREATE INDEX IF NOT EXISTS idx_docker_sessions_heartbeat
  ON docker_sessions (last_heartbeat, max_lifetime_at)
  WHERE status IN ('starting', 'running', 'idle');

-- ── updated_at triggers for tables missing them ────────────────────────────

-- scan_history
DROP TRIGGER IF EXISTS trg_scan_history_updated ON scan_history;
CREATE TRIGGER trg_scan_history_updated
  BEFORE UPDATE ON scan_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- zap_tasks
DROP TRIGGER IF EXISTS trg_zap_tasks_updated ON zap_tasks;
CREATE TRIGGER trg_zap_tasks_updated
  BEFORE UPDATE ON zap_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- docker_sessions
DROP TRIGGER IF EXISTS trg_docker_sessions_updated ON docker_sessions;
CREATE TRIGGER trg_docker_sessions_updated
  BEFORE UPDATE ON docker_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- org_quotas
DROP TRIGGER IF EXISTS trg_org_quotas_updated ON org_quotas;
CREATE TRIGGER trg_org_quotas_updated
  BEFORE UPDATE ON org_quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
