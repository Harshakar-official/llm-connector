-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Dynamic Functional Teams (Migration 011)
-- Goal: Empower PMs to create and manage dynamic project teams
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Teams Table ──────────────────────────────────────────
create table if not exists teams (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(name, org_id)
);

-- ─── 2. Team Members (Many-to-Many) ──────────────────────────
create table if not exists team_members (
  id uuid default gen_random_uuid() primary key,
  team_id uuid references teams(id) on delete cascade not null,
  profile_id uuid references profiles(id) on delete cascade not null,
  added_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique(team_id, profile_id)
);

-- ─── 3. Project Members Enhancement ──────────────────────────
-- Add team_id to project_members to track which team brought the user in (optional metadata)
alter table project_members add column if not exists source_team_id uuid references teams(id) on delete set null;

-- ─── 4. RLS Implementation (Z+ Security) ──────────────────────

alter table teams enable row level security;
alter table team_members enable row level security;

-- Teams: Select
-- Admins/PMs see all org teams. SEs see teams they are members of.
create policy "teams_select" on teams for select
  using (
    org_id = my_org_id() 
    and (
      my_role() in ('admin', 'program_manager')
      or exists (
        select 1 from team_members 
        where team_id = teams.id and profile_id = auth.uid()
      )
    )
  );

-- Teams: Insert
-- Only Admin and PM can create teams.
create policy "teams_insert" on teams for insert
  with check (
    org_id = my_org_id() 
    and my_role() in ('admin', 'program_manager')
  );

-- Teams: Update
-- Admin can update any. PM can update teams they created.
create policy "teams_update" on teams for update
  using (
    org_id = my_org_id() 
    and (
      my_role() = 'admin' 
      or (my_role() = 'program_manager' and created_by = auth.uid())
    )
  );

-- Teams: Delete
-- Admin can delete any. PM can delete teams they created.
create policy "teams_delete" on teams for delete
  using (
    org_id = my_org_id() 
    and (
      my_role() = 'admin' 
      or (my_role() = 'program_manager' and created_by = auth.uid())
    )
  );

-- Team Members: Select
create policy "team_members_select" on team_members for select
  using (
    exists (
      select 1 from teams 
      where id = team_members.team_id and org_id = my_org_id()
    )
  );

-- Team Members: Insert (Admin/PM only)
create policy "team_members_insert" on team_members for insert
  with check (
    exists (
      select 1 from teams 
      where id = team_members.team_id 
      and org_id = my_org_id()
      and (my_role() = 'admin' or (my_role() = 'program_manager' and created_by = auth.uid()))
    )
  );

-- Team Members: Delete (Admin/PM only)
create policy "team_members_delete" on team_members for delete
  using (
    exists (
      select 1 from teams 
      where id = team_members.team_id 
      and org_id = my_org_id()
      and (my_role() = 'admin' or (my_role() = 'program_manager' and created_by = auth.uid()))
    )
  );

-- ─── 5. Realtime & Triggers ──────────────────────────────────
alter publication supabase_realtime add table teams;
alter publication supabase_realtime add table team_members;

create trigger trg_teams_updated before update on teams
  for each row execute function update_updated_at();
