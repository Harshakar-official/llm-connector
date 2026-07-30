-- ============================================================
-- VAPTShield Migration 057: Developer RLS Hardening (Audit Fix #20)
-- Strict control over which fields Developers can update.
-- ============================================================

-- Drop the overly permissive update policy
DROP POLICY IF EXISTS "vulns_update" ON vulnerabilities;

-- 1. ADMIN/PM/SE: Can update findings in their assigned projects (All fields)
CREATE POLICY "vulns_update_privileged" ON vulnerabilities
    FOR UPDATE
    USING (
        org_id = my_org_id() AND (
            my_role() = 'admin' OR 
            (my_role() IN ('program_manager', 'security_engineer') AND public.is_project_member(project_id))
        )
    );

-- 2. DEVELOPER: Can ONLY update findings assigned to them, 
-- and ONLY remediation/status fields.
-- Z+ SECURITY: We use an AFTER UPDATE trigger or direct field-level check if possible.
-- Since field-level RLS isn't native, we enforce it via Server Actions (already done) 
-- and a database-level trigger for absolute safety.

CREATE OR REPLACE FUNCTION public.check_developer_update_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF my_role() = 'developer' THEN
        -- Verify assignment
        IF OLD.assigned_to IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'Access Denied: You can only update findings assigned to you.';
        END IF;

        -- Prevent changing critical metadata
        IF OLD.title IS DISTINCT FROM NEW.title OR
           OLD.severity IS DISTINCT FROM NEW.severity OR
           OLD.cvss_score IS DISTINCT FROM NEW.cvss_score OR
           OLD.project_id IS DISTINCT FROM NEW.project_id OR
           OLD.org_id IS DISTINCT FROM NEW.org_id THEN
            RAISE EXCEPTION 'Access Denied: Developers cannot modify vulnerability metadata (Title, Severity, CVSS).';
        END IF;

        -- Only allow certain status transitions (Safety net for the server action)
        IF NEW.status NOT IN ('open', 'in_progress', 'resolved') THEN
             RAISE EXCEPTION 'Access Denied: Invalid status for developer update.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_developer_update_guard
BEFORE UPDATE ON public.vulnerabilities
FOR EACH ROW EXECUTE FUNCTION public.check_developer_update_fields();
