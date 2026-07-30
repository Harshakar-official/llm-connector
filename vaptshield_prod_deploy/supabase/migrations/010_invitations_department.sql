-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Invitations Department Link (Migration 010)
-- Goal: Allow pre-assigning users to departments during invitation
-- ═══════════════════════════════════════════════════════════════

alter table invitations add column if not exists department_id uuid references departments(id) on delete set null;

-- Update RLS if necessary (usually not needed if just adding a column and policies don't restrict columns)
