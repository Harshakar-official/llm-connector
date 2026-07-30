-- Add composite index on pending_alerts (Z-F3)
CREATE INDEX IF NOT EXISTS idx_pending_alerts_task_org_status 
ON "public"."pending_alerts" (task_id, org_id, status);
