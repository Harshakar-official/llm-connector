-- ─── Avatars Storage Bucket ─────────────────────────────────
-- Created for Feature 1: Profile avatar upload functionality
-- profile/page.tsx uploads to supabase.storage.from("avatars")

-- Create avatars bucket (public for direct URL access)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ─── Storage RLS Policies ────────────────────────────────────

-- Policy: Authenticated users can upload their own avatar
-- File naming convention: {user_id}.{ext} (e.g., abc-123.png)
create policy "Avatar Upload Policy"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] is null  -- no subfolders, root-level only
  and starts_with(name, auth.uid()::text)    -- filename must start with user's UUID
);

-- Policy: Authenticated users can update (upsert) their own avatar
create policy "Avatar Update Policy"
on storage.objects for update
with check (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
  and starts_with(name, auth.uid()::text)
);

-- Policy: Anyone can view avatars (public bucket)
create policy "Avatar View Policy"
on storage.objects for select
using (
  bucket_id = 'avatars'
);

-- Policy: Authenticated users can delete their own avatar
create policy "Avatar Delete Policy"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
  and starts_with(name, auth.uid()::text)
);