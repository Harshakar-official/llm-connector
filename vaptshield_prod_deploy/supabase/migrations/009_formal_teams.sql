-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Enterprise Team Management (Migration 009)
-- Goal: Transform free-text departments into formal managed entities
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Create Departments Table ─────────────────────────────
create table if not exists departments (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  org_id uuid references organizations(id) on delete cascade not null,
  description text,
  manager_id uuid references profiles(id) on delete set null, -- The PM in charge
  created_at timestamptz default now(),
  unique(name, org_id) -- Unique name per organization
);

-- Enable RLS
alter table departments enable row level security;

-- Policies
create policy "deps_select" on departments for select
  using (org_id = my_org_id());

create policy "deps_insert" on departments for insert
  with check (org_id = my_org_id() and my_role() = 'admin');

create policy "deps_update" on departments for update
  using (org_id = my_org_id() and (my_role() = 'admin' or manager_id = auth.uid()));

create policy "deps_delete" on departments for delete
  using (org_id = my_org_id() and my_role() = 'admin');

-- ─── 2. Link Profiles to Formal Departments ─────────────────
-- First, drop the old text column (optional, but cleaner to rename if possible)
-- We will keep the name 'department' but store the UUID of the formal department.
-- For smooth transition, let's add department_id.
alter table profiles add column if not exists department_id uuid references departments(id) on delete set null;

-- Enable Realtime
alter publication supabase_realtime add table departments;
