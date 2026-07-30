-- ============================================================
-- VAPTShield Migration 053: Simplify Comment RLS
-- Fixes 'Failed to post comment' error by simplifying the check.
-- If a user can SEE the vulnerability, they can comment on it.
-- ============================================================

-- Drop the complex and potentially broken insert policy
DROP POLICY IF EXISTS "comments_insert" ON vuln_comments;

-- Create a streamlined insert policy
-- Z+ Logic: We rely on the 'vulnerabilities' table RLS to handle 
-- project membership and org isolation. If the EXISTS passes,
-- it means the user is authorized to interact with this finding.
CREATE POLICY "comments_insert" ON vuln_comments
    FOR INSERT
    WITH CHECK (
        author_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM vulnerabilities v
            WHERE v.id = vuln_id
        )
    );

-- Also ensure SELECT is simple
DROP POLICY IF EXISTS "comments_select" ON vuln_comments;
CREATE POLICY "comments_select" ON vuln_comments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM vulnerabilities v
            WHERE v.id = vuln_id
        )
    );
