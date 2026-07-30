-- ============================================================
-- VAPTShield Migration 051: Comment Time-Locks & Edited Flag
-- Enforces a 2-minute window for edits/deletions at DB level
-- ============================================================

-- 1. Add is_edited flag
ALTER TABLE vuln_comments ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;

-- 2. Trigger to auto-set is_edited to true on UPDATE
CREATE OR REPLACE FUNCTION set_comment_edited_flag()
RETURNS TRIGGER AS $$
BEGIN
    -- Only set to true if content actually changed
    IF NEW.content <> OLD.content THEN
        NEW.is_edited := true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vuln_comments_edited ON vuln_comments;
CREATE TRIGGER trg_vuln_comments_edited
    BEFORE UPDATE ON vuln_comments
    FOR EACH ROW
    EXECUTE FUNCTION set_comment_edited_flag();

-- 3. Update RLS Policy to enforce the 2-minute rule
-- Current time must be less than created_at + 2 minutes (120 seconds)
DROP POLICY IF EXISTS "comments_update_delete" ON vuln_comments;
CREATE POLICY "comments_update_delete" ON vuln_comments
    FOR ALL
    USING (
        author_id = auth.uid() AND 
        (now() <= created_at + interval '2 minutes')
    )
    WITH CHECK (
        author_id = auth.uid() AND 
        (now() <= created_at + interval '2 minutes')
    );

-- 4. Enable Realtime for vuln_comments so UI can subscribe
alter publication supabase_realtime add table vuln_comments;
