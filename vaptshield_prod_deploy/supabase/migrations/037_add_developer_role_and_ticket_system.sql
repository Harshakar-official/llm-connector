-- ============================================================
-- VAPTShield Migration 037: Developer Role & Ticket System
-- Phase 1.1 & 1.2 of the Phase 5 Roadmap
-- ============================================================

-- 1. Add 'developer' role to profiles
-- We use an anonymous block to safely drop and recreate the constraint
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the check constraint name for the 'role' column on 'profiles' table
    SELECT conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'profiles' AND att.attname = 'role' AND con.contype = 'c';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE profiles DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('super_admin', 'admin', 'program_manager', 'security_engineer', 'guest', 'developer'));

-- 2. Ticket System Enhancements for Vulnerabilities
-- 2.1. Sequence for Ticket IDs
CREATE SEQUENCE IF NOT EXISTS ticket_id_seq START 1000;

-- 2.2. Add ticket_id column (human-readable)
ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS ticket_id text UNIQUE;

-- 2.3. Add remediation tracking columns
ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS remediation_proof_url text;
ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS remediation_notes text;
ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES profiles(id);

-- 3. Trigger to auto-populate ticket_id for new findings
CREATE OR REPLACE FUNCTION generate_ticket_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_id IS NULL THEN
    NEW.ticket_id := 'VAPT-' || nextval('ticket_id_seq')::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Safely recreate trigger
DROP TRIGGER IF EXISTS tr_generate_ticket_id ON vulnerabilities;
CREATE TRIGGER tr_generate_ticket_id
BEFORE INSERT ON vulnerabilities
FOR EACH ROW
EXECUTE FUNCTION generate_ticket_id();

-- 4. Backfill ticket_id for existing vulnerabilities (if any)
UPDATE vulnerabilities SET ticket_id = 'VAPT-' || nextval('ticket_id_seq')::text WHERE ticket_id IS NULL;

-- 5. Update notifications type check to include new potential types (optional but good for future)
-- The 'notifications' table also has a check constraint on 'type'
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'notifications' AND att.attname = 'type' AND con.contype = 'c';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'scan_complete','finding_critical','finding_approved',
    'report_ready','invite_received','role_changed',
    'member_assigned','system','docker_quota_warning','docker_expired',
    'finding_resolved', 'finding_reopened', 'finding_assigned'
  ));
