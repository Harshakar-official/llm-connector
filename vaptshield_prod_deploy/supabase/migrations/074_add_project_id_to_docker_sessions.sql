ALTER TABLE docker_sessions
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS docker_sessions_project ON docker_sessions(project_id);
