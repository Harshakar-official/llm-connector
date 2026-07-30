-- ============================================================
-- VAPTShield Migration 038: Project Hardening (Data Locking)
-- Phase 1.4 of the Phase 5 Roadmap
-- ============================================================

-- Function to enforce project locking
CREATE OR REPLACE FUNCTION check_project_not_locked()
RETURNS TRIGGER AS $$
DECLARE
    v_status TEXT;
    v_project_id UUID;
BEGIN
    -- Determine project_id based on the table being modified
    IF TG_TABLE_NAME = 'projects' THEN
        v_project_id := OLD.id;
    ELSE
        -- For vulnerabilities, project_members, etc.
        IF TG_OP = 'INSERT' THEN
            v_project_id := NEW.project_id;
        ELSE
            v_project_id := OLD.project_id;
        END IF;
    END IF;

    -- Get current project status
    SELECT status INTO v_status FROM projects WHERE id = v_project_id;

    -- If project is completed or archived, block all modifications
    IF v_status IN ('completed', 'archived') THEN
        -- EXCEPTION: Allow changing the status BACK to active/planning IF it's the project table itself being updated
        -- This provides a "way out" if a project was closed by mistake, but only for the status column.
        IF TG_TABLE_NAME = 'projects' AND TG_OP = 'UPDATE' THEN
            -- Check if ONLY the status or updated_at is being changed
            -- (Simple check: if other critical fields like name or description change, block it)
            IF NEW.name <> OLD.name OR NEW.description <> OLD.description OR NEW.org_id <> OLD.org_id THEN
                RAISE EXCEPTION 'Project is % and its core details are locked.', v_status;
            END IF;
            -- Allow the update to proceed (e.g., status change)
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Project is % and all associated data is locked for security compliance.', v_status;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Apply to vulnerabilities (Insert, Update, Delete)
DROP TRIGGER IF EXISTS tr_lock_vulnerabilities ON vulnerabilities;
CREATE TRIGGER tr_lock_vulnerabilities
BEFORE INSERT OR UPDATE OR DELETE ON vulnerabilities
FOR EACH ROW
EXECUTE FUNCTION check_project_not_locked();

-- 2. Apply to project_members (Insert, Update, Delete)
DROP TRIGGER IF EXISTS tr_lock_project_members ON project_members;
CREATE TRIGGER tr_lock_project_members
BEFORE INSERT OR UPDATE OR DELETE ON project_members
FOR EACH ROW
EXECUTE FUNCTION check_project_not_locked();

-- 3. Apply to projects (Update core details, Delete)
-- Status updates are allowed by the function logic above
DROP TRIGGER IF EXISTS tr_lock_projects ON projects;
CREATE TRIGGER tr_lock_projects
BEFORE UPDATE OR DELETE ON projects
FOR EACH ROW
WHEN (OLD.status IN ('completed', 'archived'))
EXECUTE FUNCTION check_project_not_locked();
