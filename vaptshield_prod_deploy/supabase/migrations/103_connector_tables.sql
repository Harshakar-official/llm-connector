-- ─── Connector API Keys ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connector_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE connector_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read api keys"
  ON connector_api_keys FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org admins can create api keys"
  ON connector_api_keys FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND org_id = connector_api_keys.org_id
        AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "org admins can revoke api keys"
  ON connector_api_keys FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND org_id = connector_api_keys.org_id
        AND role IN ('admin', 'super_admin')
    )
  );

-- ─── Connectors ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  connector_id TEXT UNIQUE NOT NULL,
  api_key_id UUID REFERENCES connector_api_keys(id) ON DELETE SET NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  hostname TEXT NOT NULL,
  status TEXT DEFAULT 'online' CHECK (status IN ('online', 'offline', 'degraded')),
  llm_type TEXT DEFAULT 'none',
  llm_status TEXT DEFAULT 'disconnected',
  models_count INTEGER DEFAULT 0,
  active_jobs INTEGER DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_connectors_org_id ON connectors(org_id);
CREATE INDEX idx_connectors_status ON connectors(status);

ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read connectors"
  ON connectors FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org admins can delete connectors"
  ON connectors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND org_id = connectors.org_id
        AND role IN ('admin', 'super_admin')
    )
  );

-- ─── Connector Jobs ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connector_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id TEXT REFERENCES connectors(connector_id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  response TEXT,
  latency_ms BIGINT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_connector_jobs_connector ON connector_jobs(connector_id);
CREATE INDEX idx_connector_jobs_org ON connector_jobs(org_id);
CREATE INDEX idx_connector_jobs_status ON connector_jobs(status);

ALTER TABLE connector_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read jobs"
  ON connector_jobs FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ─── Auto-update ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_connector_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_connectors_timestamp
  BEFORE UPDATE ON connectors
  FOR EACH ROW EXECUTE FUNCTION update_connector_timestamp();

CREATE TRIGGER update_connector_jobs_timestamp
  BEFORE UPDATE ON connector_jobs
  FOR EACH ROW EXECUTE FUNCTION update_connector_timestamp();
