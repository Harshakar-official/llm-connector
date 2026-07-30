-- ============================================================
-- VAPTShield Migration 039: Automated Notification Triggers
-- Phase 2.2 of the Phase 5 Roadmap
-- ============================================================

-- Function to handle vulnerability-related notifications
CREATE OR REPLACE FUNCTION handle_vulnerability_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_project_name TEXT;
    v_actor_name TEXT;
BEGIN
    -- Get project name
    SELECT name INTO v_project_name FROM projects WHERE id = NEW.project_id;
    
    -- Get the name of the person who made the change (if available in the context or session)
    -- For now, we use a generic message or try to get it from the profile if we had an 'updated_by' column.
    -- Since we don't have 'updated_by' yet in vulnerabilities, we keep it simple.

    -- 1. NOTIFY ON ASSIGNMENT
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

    -- 2. NOTIFY ON RESOLUTION (Notify SEs and PMs of the project)
    IF (TG_OP = 'UPDATE' AND OLD.status <> 'resolved' AND NEW.status = 'resolved') THEN
        -- Notify the person who found it (SE)
        IF NEW.found_by IS NOT NULL THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                NEW.found_by,
                NEW.org_id,
                'Finding Resolved',
                'Finding ' || NEW.ticket_id || ' has been marked as Resolved and is ready for verification.',
                'finding_resolved',
                '/findings/' || NEW.id
            );
        END IF;
    END IF;

    -- 3. NOTIFY ON RE-OPEN (Notify the Developer)
    IF (TG_OP = 'UPDATE' AND OLD.status = 'resolved' AND NEW.status = 'open') THEN
        IF NEW.assigned_to IS NOT NULL THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                NEW.assigned_to,
                NEW.org_id,
                'Finding Re-opened',
                'Finding ' || NEW.ticket_id || ' was not approved during verification and has been re-opened.',
                'finding_reopened',
                '/findings/' || NEW.id
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to vulnerabilities
DROP TRIGGER IF EXISTS tr_vulnerability_notifications ON vulnerabilities;
CREATE TRIGGER tr_vulnerability_notifications
AFTER INSERT OR UPDATE ON vulnerabilities
FOR EACH ROW
EXECUTE FUNCTION handle_vulnerability_notifications();
