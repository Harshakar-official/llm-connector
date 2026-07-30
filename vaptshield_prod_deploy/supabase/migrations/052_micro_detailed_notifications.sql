-- ============================================================
-- VAPTShield Migration 052: Micro-Detailed Targeted Notifications (v3)
-- Professional crystal-clear alerts for security teams
-- ============================================================

CREATE OR REPLACE FUNCTION handle_vulnerability_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_project_name TEXT;
    v_actor_name TEXT;
BEGIN
    -- 1. Cache Project Name
    SELECT name INTO v_project_name FROM projects WHERE id = NEW.project_id;
    
    -- 2. NOTIFY ON ASSIGNMENT (Target: Developer)
    IF (TG_OP = 'UPDATE' AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL) 
       OR (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) THEN
        
        -- Get the name of the person who assigned it (if available)
        SELECT full_name INTO v_actor_name FROM profiles WHERE id = NEW.assigned_by;

        INSERT INTO notifications (user_id, org_id, title, message, type, link)
        VALUES (
            NEW.assigned_to,
            NEW.org_id,
            '🚨 Assigned: ' || NEW.ticket_id,
            COALESCE(v_actor_name, 'A team member') || ' assigned task [' || NEW.title || '] in project "' || v_project_name || '" to you.',
            'finding_assigned',
            '/findings/' || NEW.id || '?tab=discussion'
        );
    END IF;

    -- 3. NOTIFY ON RESOLUTION (Target: Assigner + SE)
    IF (TG_OP = 'UPDATE' AND OLD.status <> 'resolved' AND NEW.status = 'resolved') THEN
        -- Get the Developer's name
        SELECT full_name INTO v_actor_name FROM profiles WHERE id = NEW.resolved_by;

        -- Alert the original Assigner (Accountability)
        IF NEW.assigned_by IS NOT NULL THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                NEW.assigned_by,
                NEW.org_id,
                '✅ Fix Ready: ' || NEW.ticket_id,
                COALESCE(v_actor_name, 'The developer') || ' submitted a fix for [' || NEW.title || '] in "' || v_project_name || '". Please verify.',
                'finding_resolved',
                '/findings/' || NEW.id || '?tab=remediation'
            );
        END IF;

        -- Also alert the SE (Finder) if they are not the assigner
        IF NEW.found_by IS NOT NULL AND NEW.found_by <> COALESCE(NEW.assigned_by, '00000000-0000-0000-0000-000000000000') THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                NEW.found_by,
                NEW.org_id,
                '🔍 Re-test: ' || NEW.ticket_id,
                'Fix submitted for finding [' || NEW.title || '] in "' || v_project_name || '". Retest is required.',
                'finding_resolved',
                '/findings/' || NEW.id || '?tab=remediation'
            );
        END IF;
    END IF;

    -- 4. NOTIFY ON RE-OPEN (Target: Developer)
    IF (TG_OP = 'UPDATE' AND OLD.status IN ('resolved', 'verified') AND NEW.status IN ('open', 'reopened')) THEN
        INSERT INTO notifications (user_id, org_id, title, message, type, link)
        VALUES (
            NEW.assigned_to,
            NEW.org_id,
            '❌ Rejected: ' || NEW.ticket_id,
            'Your fix for [' || NEW.title || '] in "' || v_project_name || '" was rejected. Finding has been RE-OPENED.',
            'finding_reopened',
            '/findings/' || NEW.id || '?tab=discussion'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
