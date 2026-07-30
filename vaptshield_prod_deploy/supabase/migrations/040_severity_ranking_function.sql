-- ============================================================
-- VAPTShield Migration 040: Severity Ranking Function
-- Fixes Advanced Sorting (Critical first, regardless of CVSS)
-- ============================================================

-- Function to convert severity text to a sortable numeric rank
CREATE OR REPLACE FUNCTION get_severity_rank(sev text) 
RETURNS int AS $$
BEGIN
  RETURN CASE sev
    WHEN 'critical' THEN 4
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    WHEN 'informational' THEN 0
    ELSE -1
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
