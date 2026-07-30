-- ============================================================
-- VAPTShield Migration 049: Enhanced Remediation Tracking
-- 1. Add assigned_by to vulnerabilities to track who assigned the task
-- 2. Update notification trigger to notify assigner when resolved
-- ============================================================

-- 1. Add column
ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES profiles(id);

-- 2. Update notification function
CREATE OR REPLACE FUNCTION handle_vulnerability_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_project_name TEXT;
BEGIN
    -- Get project name
    SELECT name INTO v_project_name FROM projects WHERE id = NEW.project_id;
    
    -- 1. NOTIFY ON ASSIGNMENT (Notify the Developer)
    IF (TG_OP = 'UPDATE' AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL) 
       OR (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) THEN
        
        INSERT INTO notifications (user_id, org_id, title, message, type, link)
        VALUES (
            NEW.assigned_to,
            NEW.org_id,
            'New Finding Assigned',
            'You have been assigned to: ' || NEW.ticket_id || ' (' || NEW.title || ') in project ' || v_project_name,
            'finding_assigned',
            '/findings/' || NEW.id
        );
    END IF;

    -- 2. NOTIFY ON RESOLUTION (Notify BOTH the SE and the Assigner)
    IF (TG_OP = 'UPDATE' AND OLD.status <> 'resolved' AND NEW.status = 'resolved') THEN
        -- Notify the person who found it (SE)
        IF NEW.found_by IS NOT NULL THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                NEW.found_by,
                NEW.org_id,
                'Finding Resolved (SE)',
                'Finding ' || NEW.ticket_id || ' has been marked as Resolved. Please verify the fix.',
                'finding_resolved',
                '/findings/' || NEW.id
            );
        END IF;

        -- Notify the person who assigned it (PM/Admin) if different from SE
        IF NEW.assigned_by IS NOT NULL AND NEW.assigned_by <> COALESCE(NEW.found_by, '00000000-0000-0000-0000-000000000000') THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                NEW.assigned_by,
                NEW.org_id,
                'Task Completed',
                'The developer has resolved the task: ' || NEW.ticket_id || '. SE has been notified for verification.',
                'finding_resolved',
                '/findings/' || NEW.id
            );
        END IF;
    END IF;

    -- 3. NOTIFY ON RE-OPEN (Notify the Developer)
    IF (TG_OP = 'UPDATE' AND OLD.status IN ('resolved', 'verified') AND NEW.status IN ('open', 'reopened')) THEN
        IF NEW.assigned_to IS NOT NULL THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                NEW.assigned_to,
                NEW.org_id,
                'Finding Re-opened',
                'Finding ' || NEW.ticket_id || ' was not approved and has been re-opened for further fixing.',
                'finding_reopened',
                '/findings/' || NEW.id
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
