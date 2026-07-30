-- Fix: Add 'cicd' to container_type check constraint
ALTER TABLE docker_sessions
  DROP CONSTRAINT IF EXISTS docker_sessions_container_type_check;

ALTER TABLE docker_sessions
  ADD CONSTRAINT docker_sessions_container_type_check
  CHECK (container_type IN ('kali', 'zap', 'cicd'));