-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Fix Invitation Acceptance (Migration 027)
-- Goal: Allow users to mark their own invitations as accepted,
-- removing the need for the admin client (which is failing).
-- ═══════════════════════════════════════════════════════════════

create policy "invitations_accept" on public.invitations for update
using (
  email = (select email from auth.users where id = auth.uid())
  and accepted_at is null
)
with check (
  email = (select email from auth.users where id = auth.uid())
);
