-- Migration: Allow Super Admin to manage invitations
-- Description: Updates RLS policies for invitations to allow platform-level management.

drop policy if exists "invitations_select" on invitations;
create policy "invitations_select" on invitations for select
  using (org_id = my_org_id() or is_super_admin());

drop policy if exists "invitations_insert" on invitations;
create policy "invitations_insert" on invitations for insert
  with check (org_id = my_org_id() or is_super_admin());

drop policy if exists "invitations_update" on invitations;
create policy "invitations_update" on invitations for update
  using (org_id = my_org_id() or is_super_admin());
