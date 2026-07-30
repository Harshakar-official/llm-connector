-- ============================================================
-- VAPTShield Migration 048: Elite Status Lifecycle Unification
-- Standardizes ALL findings and tracker items into one master system.
-- ============================================================

-- 1. Temporarily drop existing status constraints to allow data migration
ALTER TABLE vulnerabilities DROP CONSTRAINT IF EXISTS vulnerabilities_status_check;
ALTER TABLE tracker DROP CONSTRAINT IF EXISTS tracker_status_check;

-- 2. Data Migration: Map legacy statuses to the new standardized system
-- Tracker: pending -> open
UPDATE tracker SET status = 'open' WHERE status = 'pending';

-- Vulnerabilities: in_review -> in_progress (Industry standard: review is part of fixing)
UPDATE vulnerabilities SET status = 'in_progress' WHERE status = 'in_review';

-- 3. Apply the new standardized CHECK constraints
ALTER TABLE vulnerabilities ADD CONSTRAINT vulnerabilities_status_check 
  CHECK (status IN (
    'open',           -- Initial state, needs attention
    'in_progress',    -- Developer has started working
    'resolved',       -- Fix submitted, waiting for SE verification
    'verified',       -- SE has confirmed the fix
    'reopened',       -- SE rejected the fix, back to Dev
    'closed',         -- Final archived state
    'accepted_risk',  -- PM/Admin decided not to fix
    'false_positive'  -- Not a real vulnerability
  ));

ALTER TABLE tracker ADD CONSTRAINT tracker_status_check 
  CHECK (status IN ('open', 'in_progress', 'resolved', 'verified', 'reopened', 'closed', 'accepted_risk', 'false_positive'));
