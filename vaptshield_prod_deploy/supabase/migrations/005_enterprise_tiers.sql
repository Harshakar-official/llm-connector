-- Migration: Enterprise Quotas & Plan Tiers
-- Description: Sets up the structure for tiered pricing and automated management.

-- 1. Create Enum for Plan Tiers
DO $$ BEGIN
    CREATE TYPE plan_tier AS ENUM ('starter', 'pro', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Update org_quotas to include more granular limits
ALTER TABLE org_quotas 
ADD COLUMN IF NOT EXISTS plan_tier plan_tier DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Create Audit Logs Table (For Enterprise Compliance)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL, -- 'user', 'project', 'finding', 'scan'
    resource_id TEXT,
    old_data JSONB,
    new_value JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_admin_view_logs" ON audit_log 
FOR SELECT USING (org_id = my_org_id() OR is_super_admin());

-- 4. Function to check quota before insert
CREATE OR REPLACE FUNCTION check_org_quota()
RETURNS TRIGGER AS $$
DECLARE
    v_max_users INTEGER;
    v_current_users INTEGER;
    v_org_id UUID;
BEGIN
    -- Get org_id from the profile being inserted/updated
    v_org_id := NEW.org_id;
    
    IF v_org_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get limits
    SELECT max_users INTO v_max_users FROM org_quotas WHERE org_id = v_org_id;
    
    -- Get current count
    SELECT count(*) INTO v_current_users FROM profiles WHERE org_id = v_org_id;

    IF v_current_users >= v_max_users THEN
        RAISE EXCEPTION 'Quota exceeded: This organization has reached its maximum user limit (%)', v_max_users;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Helper for Super Admin to delete unassigned users safely
CREATE OR REPLACE FUNCTION delete_platform_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_project_count INTEGER;
BEGIN
    -- Only super admin can run this
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Check if user owns any projects or is the last admin
    -- For now, simple check: are they linked to an org?
    SELECT count(*) INTO v_project_count FROM projects WHERE created_by = p_user_id;
    
    IF v_project_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete user: They own active projects. Re-assign projects first.';
    END IF;

    -- Delete from auth.users (cascades to profiles)
    -- This requires a separate service role call or a triggered function in auth schema
    -- We will handle the actual auth deletion via API, this function is for safety check
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
