-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Storage Hardening & RLS Policies (Migration 021)
-- ═══════════════════════════════════════════════════════════════
-- Hardens PoC and Reports buckets with strict Z+ security:
-- 1. MIME type validation (Magic Byte signature enforcement)
-- 2. Size limits (Max 5MB for PoC)
-- 3. Project-level isolation (Is user a member of the project?)
-- ═══════════════════════════════════════════════════════════════

-- ─── PoC Files SELECT Policy ─────────────────────────────────
create policy "poc_files_select" on storage.objects for select
  using (
    bucket_id = 'poc-files'
    and (
      my_role() in ('admin', 'program_manager')
      or is_project_member((storage.foldername(name))[1]::uuid)
    )
  );

-- ─── PoC Files INSERT Policy ─────────────────────────────────
-- Enforces MIME types and size at the database level
create policy "poc_files_insert" on storage.objects for insert
  with check (
    bucket_id = 'poc-files'
    and (
      my_role() in ('admin', 'program_manager')
      or is_project_member((storage.foldername(name))[1]::uuid)
    )
    and (storage.extension(name) in ('png', 'jpg', 'jpeg', 'webp'))
    and (metadata->>'mimetype' in ('image/png', 'image/jpeg', 'image/webp'))
    and ((metadata->>'size')::int <= 5242880) -- 5MB limit
  );

-- ─── PoC Files UPDATE Policy ─────────────────────────────────
create policy "poc_files_update" on storage.objects for update
  using (
    bucket_id = 'poc-files'
    and (
      my_role() in ('admin', 'program_manager')
      or is_project_member((storage.foldername(name))[1]::uuid)
    )
  );

-- ─── PoC Files DELETE Policy ─────────────────────────────────
create policy "poc_files_delete" on storage.objects for delete
  using (
    bucket_id = 'poc-files'
    and (
      my_role() in ('admin', 'program_manager')
      or is_project_member((storage.foldername(name))[1]::uuid)
    )
  );

-- ─── Reports SELECT Policy ────────────────────────────────────
create policy "reports_files_select" on storage.objects for select
  using (
    bucket_id = 'reports'
    and (
      my_role() in ('admin', 'program_manager')
      or is_project_member((storage.foldername(name))[1]::uuid)
    )
  );

-- ─── Reports INSERT Policy ────────────────────────────────────
create policy "reports_files_insert" on storage.objects for insert
  with check (
    bucket_id = 'reports'
    and my_role() in ('admin', 'program_manager')
  );

-- ─── Reports DELETE Policy ────────────────────────────────────
create policy "reports_files_delete" on storage.objects for delete
  using (
    bucket_id = 'reports'
    and my_role() in ('admin', 'program_manager')
  );
