-- Add branch to UNIQUE constraint (D4)
ALTER TABLE "public"."cicd_configs"
DROP CONSTRAINT IF EXISTS cicd_configs_org_id_project_id_repo_url_key,
ADD CONSTRAINT cicd_configs_org_id_project_id_repo_url_branch_key UNIQUE (org_id, project_id, repo_url, branch);
