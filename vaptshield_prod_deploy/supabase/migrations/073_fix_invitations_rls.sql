-- 073_fix_invitations_rls.sql
-- Fixes critical IDOR and Information Disclosure vulnerabilities in invitations

BEGIN;

-- 1. Fix Information Disclosure on anon read
-- Drop the overly permissive anon read
DROP POLICY IF EXISTS "invitations_public_read" ON public.invitations;

-- Create a secure function for validating invitations via RPC (Security Definer)
-- This allows the API to validate tokens without exposing the whole table to anon users
CREATE OR REPLACE FUNCTION public.validate_invitation_token(p_token text)
RETURNS TABLE (
    email text,
    org_id uuid,
    role text,
    token text,
    accepted_at timestamptz,
    expires_at timestamptz,
    org_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.email, 
        i.org_id, 
        i.role, 
        i.token, 
        i.accepted_at, 
        i.expires_at,
        o.name AS org_name
    FROM public.invitations i
    LEFT JOIN public.organizations o ON i.org_id = o.id
    WHERE i.token = p_token
    LIMIT 1;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.validate_invitation_token(text) TO anon, authenticated;


-- 2. Fix High Severity IDOR on authenticated UPDATE and SELECT
DROP POLICY IF EXISTS "invitations_update" ON public.invitations;
DROP POLICY IF EXISTS "invitations_select" ON public.invitations;

-- Authenticated users can SELECT if:
-- 1. They are super admin
-- 2. It belongs to their org and they are admin/pm
-- 3. They sent the invitation
-- 4. It's sent to their email
CREATE POLICY "invitations_select_secure" ON public.invitations
FOR SELECT TO authenticated
USING (
    is_super_admin() 
    OR (org_id = my_org_id() AND my_role() IN ('admin', 'program_manager'))
    OR invited_by = auth.uid()
    OR email = (SELECT auth.jwt() ->> 'email')
);

-- Authenticated users can UPDATE if:
-- 1. They are super admin
-- 2. It belongs to their org and they are admin/pm
CREATE POLICY "invitations_update_secure" ON public.invitations
FOR UPDATE TO authenticated
USING (
    is_super_admin() 
    OR (org_id = my_org_id() AND my_role() IN ('admin', 'program_manager'))
);

COMMIT;
