-- ─── Storage Configuration ───────────────────────────────────

-- Create poc-files bucket
insert into storage.buckets (id, name, public)
values ('poc-files', 'poc-files', false)
on conflict (id) do nothing;

-- ─── Storage RLS Policies ────────────────────────────────────

-- Policy for users to upload PoC files to their own org's folder
-- Path format: {project_id}/{file_id}.ext
create policy "PoC Upload Policy"
on storage.objects for insert
with check (
  bucket_id = 'poc-files'
  and (
    select count(*) > 0
    from public.projects
    where id::text = (storage.foldername(name))[1]
    and org_id = (select org_id from public.profiles where id = auth.uid())
  )
  and (select role from public.profiles where id = auth.uid()) in ('admin', 'program_manager', 'security_engineer')
);

-- Policy for users to view PoC files in their own org's folder
create policy "PoC View Policy"
on storage.objects for select
using (
  bucket_id = 'poc-files'
  and (
    select count(*) > 0
    from public.projects
    where id::text = (storage.foldername(name))[1]
    and org_id = (select org_id from public.profiles where id = auth.uid())
  )
);

-- Policy for users to delete PoC files
create policy "PoC Delete Policy"
on storage.objects for delete
using (
  bucket_id = 'poc-files'
  and (
    select count(*) > 0
    from public.projects
    where id::text = (storage.foldername(name))[1]
    and org_id = (select org_id from public.profiles where id = auth.uid())
  )
  and (select role from public.profiles where id = auth.uid()) in ('admin', 'program_manager', 'security_engineer')
);
