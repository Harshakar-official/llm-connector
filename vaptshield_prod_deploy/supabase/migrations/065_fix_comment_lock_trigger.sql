-- ============================================================
-- VAPTShield Migration 065: Fix Project Lock Trigger for Comments
-- Resolves the 'record "new" has no field "project_id"' error
-- by correctly deriving the project_id from the vulnerabilities
-- table when triggered from vuln_comments.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_project_not_locked()
RETURNS TRIGGER AS $$
DECLARE
    v_status TEXT;
    v_project_id UUID;
BEGIN
    -- 1. Determine project_id based on the table being modified
    IF TG_TABLE_NAME = 'projects' THEN
        v_project_id := OLD.id;
    ELSIF TG_TABLE_NAME = 'vuln_comments' THEN
        -- Comments don't have project_id, they have vuln_id
        IF TG_OP = 'INSERT' THEN
            SELECT project_id INTO v_project_id FROM vulnerabilities WHERE id = NEW.vuln_id;
        ELSE
            SELECT project_id INTO v_project_id FROM vulnerabilities WHERE id = OLD.vuln_id;
        END IF;
    ELSE
        -- For vulnerabilities, project_members, etc.
        IF TG_OP = 'INSERT' THEN
            v_project_id := NEW.project_id;
        ELSE
            v_project_id := OLD.project_id;
        END IF;
    END IF;

    -- 2. Get current project status
    SELECT status INTO v_status FROM projects WHERE id = v_project_id;
    
    -- 3. If project is completed or archived, block all modifications
    IF v_status IN ('completed', 'archived') THEN
        -- EXCEPTION: Allow changing the status BACK to active/planning IF it's the project table itself being updated
        IF TG_TABLE_NAME = 'projects' AND TG_OP = 'UPDATE' THEN
            IF NEW.name <> OLD.name OR NEW.description <> OLD.description OR NEW.org_id <> OLD.org_id THEN
                RAISE EXCEPTION 'Project is % and its core details are locked.', v_status;
            END IF;
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
