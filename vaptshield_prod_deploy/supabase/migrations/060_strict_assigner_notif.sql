-- ============================================================
-- VAPTShield Migration 060: Strict Assigner Notification Rule
-- As per user requirement: ONLY the person who assigned the task
-- (assigned_by) gets the resolution notification.
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
    IF (TG_OP = 'UPDATE' AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)) 
       OR (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) THEN
        
        SELECT full_name INTO v_actor_name FROM profiles WHERE id = auth.uid();

        IF NEW.assigned_to IS NOT NULL THEN
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

        IF OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NULL THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                OLD.assigned_to,
                NEW.org_id,
                'ℹ️ Unassigned: ' || NEW.ticket_id,
                'You have been unassigned from [' || NEW.title || '] in "' || v_project_name || '".',
                'system',
                '/findings/' || NEW.id
            );
        END IF;
    END IF;

    -- 3. NOTIFY ON RESOLUTION (Target: ONLY THE ASSIGNER)
    -- User Rule: "jisne assign kiya hai sirf usi ko notification jayega"
    IF (TG_OP = 'UPDATE' AND OLD.status <> 'resolved' AND NEW.status = 'resolved') THEN
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
        
        -- Z+ NOTE: found_by (Security Engineer) notification block REMOVED as per strict user request.
    END IF;

    -- 4. NOTIFY ON VERIFIED (Target: Developer)
    IF (TG_OP = 'UPDATE' AND OLD.status <> 'verified' AND NEW.status = 'verified') THEN
        IF NEW.assigned_to IS NOT NULL THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                NEW.assigned_to,
                NEW.org_id,
                '🎊 Verified: ' || NEW.ticket_id,
                'Your fix for [' || NEW.title || '] in "' || v_project_name || '" has been VERIFIED by security.',
                'finding_approved',
                '/findings/' || NEW.id
            );
        END IF;
    END IF;

    -- 5. NOTIFY ON CLOSED (Target: Developer)
    IF (TG_OP = 'UPDATE' AND OLD.status <> 'closed' AND NEW.status = 'closed') THEN
        IF NEW.assigned_to IS NOT NULL THEN
            INSERT INTO notifications (user_id, org_id, title, message, type, link)
            VALUES (
                NEW.assigned_to,
                NEW.org_id,
                '🔒 Closed: ' || NEW.ticket_id,
                'Ticket [' || NEW.title || '] is now CLOSED.',
                'system',
                '/findings/' || NEW.id
            );
        END IF;
    END IF;

    -- 6. NOTIFY ON RE-OPEN (Target: Developer)
    IF (TG_OP = 'UPDATE' AND OLD.status IN ('resolved', 'verified') AND NEW.status IN ('open', 'reopened')) THEN
        IF NEW.assigned_to IS NOT NULL THEN
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
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
