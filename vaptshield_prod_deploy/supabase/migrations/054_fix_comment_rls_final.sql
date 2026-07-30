-- ============================================================
-- VAPTShield Migration 054: Fix Comment RLS & Time-Locks
-- 1. Fixes 'disappearing comments' caused by FOR ALL policy
-- 2. Simplifies INSERT check to prevent 'access denied' error
-- ============================================================

-- Clean up existing policies
DROP POLICY IF EXISTS "comments_select" ON vuln_comments;
DROP POLICY IF EXISTS "comments_insert" ON vuln_comments;
DROP POLICY IF EXISTS "comments_update_delete" ON vuln_comments;
DROP POLICY IF EXISTS "comments_update" ON vuln_comments;
DROP POLICY IF EXISTS "comments_delete" ON vuln_comments;

-- 1. SELECT: Users can see comments if they can see the vulnerability
-- (The vulnerabilities table already handles project/org isolation)
CREATE POLICY "comments_select" ON vuln_comments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM vulnerabilities v
            WHERE v.id = vuln_id
        )
    );

-- 2. INSERT: Users can comment if they can see the vulnerability
-- and they set themselves as the author.
CREATE POLICY "comments_insert" ON vuln_comments
    FOR INSERT
    WITH CHECK (
        author_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM vulnerabilities v
            WHERE v.id = vuln_id
        )
    );

-- 3. UPDATE: Author only, within 2-minute window
CREATE POLICY "comments_update" ON vuln_comments
    FOR UPDATE
    USING (
        author_id = auth.uid() AND 
        (now() <= created_at + interval '2 minutes')
    )
    WITH CHECK (
        author_id = auth.uid() AND 
        (now() <= created_at + interval '2 minutes')
    );

-- 4. DELETE: Author only, within 2-minute window
CREATE POLICY "comments_delete" ON vuln_comments
    FOR DELETE
    USING (
        author_id = auth.uid() AND 
        (now() <= created_at + interval '2 minutes')
    );
