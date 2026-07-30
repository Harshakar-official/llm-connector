-- Add post_pr_comment toggle to cicd_configs
-- When true, completed CI/CD scans will post a summary comment on the PR
ALTER TABLE cicd_configs
ADD COLUMN IF NOT EXISTS post_pr_comment BOOLEAN NOT NULL DEFAULT false;