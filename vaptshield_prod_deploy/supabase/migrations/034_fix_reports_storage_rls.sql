-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Reports Storage RLS Fix (Migration 034)
-- Goal: Allow Security Engineers to manage report artifacts in storage.
-- ═══════════════════════════════════════════════════════════════

-- 1. Fix reports_files_insert (Allow SE)
DROP POLICY IF EXISTS "reports_files_insert" ON storage.objects;
CREATE POLICY "reports_files_insert" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'reports'
  AND (
    my_role() = ANY (ARRAY['admin', 'program_manager', 'security_engineer'])
    OR is_project_member(((storage.foldername(name))[1])::uuid)
  )
);

-- 2. Fix reports_files_delete (Allow SE)
DROP POLICY IF EXISTS "reports_files_delete" ON storage.objects;
CREATE POLICY "reports_files_delete" ON storage.objects FOR DELETE
USING (
  bucket_id = 'reports'
  AND (
    my_role() = ANY (ARRAY['admin', 'program_manager', 'security_engineer'])
    OR is_project_member(((storage.foldername(name))[1])::uuid)
  )
);

-- 3. Fix reports_files_select (Ensure SE is clearly allowed)
DROP POLICY IF EXISTS "reports_files_select" ON storage.objects;
CREATE POLICY "reports_files_select" ON storage.objects FOR SELECT
USING (
  bucket_id = 'reports'
  AND (
    my_role() = ANY (ARRAY['admin', 'program_manager', 'security_engineer'])
    OR is_project_member(((storage.foldername(name))[1])::uuid)
  )
);
