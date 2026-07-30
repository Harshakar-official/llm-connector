-- ============================================================
-- VAPTShield Migration 061: Admin Infrastructure Hardening
-- 1. Create 'logos' bucket with Z+ Security RLS
-- 2. Fix 'audit_log' relationships and schema
-- 3. Update 'org_quotas' for Unlimited Users/Projects vision
-- ============================================================

-- 1. STORAGE: LOGOS BUCKET
INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for Logos: Admins can only upload/delete for their own org
-- Filename pattern will be: orgs/{org_id}/logo.png
DROP POLICY IF EXISTS "Admin Logo Management" ON storage.objects;
CREATE POLICY "Admin Logo Management" ON storage.objects
    FOR ALL
    TO authenticated
    USING (
        bucket_id = 'logos' AND (
            (storage.foldername(name))[1] = 'orgs' AND 
            (storage.foldername(name))[2] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
        )
    )
    WITH CHECK (
        bucket_id = 'logos' AND (
            (storage.foldername(name))[1] = 'orgs' AND 
            (storage.foldername(name))[2] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
        )
    );

-- Public Read for Logos
DROP POLICY IF EXISTS "Public Logo Read" ON storage.objects;
CREATE POLICY "Public Logo Read" ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'logos');


-- 2. AUDIT LOG: FIX RELATIONSHIPS
-- Add missing FK to organizations for PostgREST joins
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_org_id_fkey') THEN
        ALTER TABLE public.audit_log 
        ADD CONSTRAINT audit_log_org_id_fkey 
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. QUOTAS: UNLIMITED VISION
-- Add scan limits tracking
ALTER TABLE public.org_quotas 
ADD COLUMN IF NOT EXISTS max_scans_per_month INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS scans_this_month INTEGER DEFAULT 0;

-- Update defaults for unlimited users/projects (effectively 1 Million)
ALTER TABLE public.org_quotas 
ALTER COLUMN max_users SET DEFAULT 1000000,
ALTER COLUMN max_projects SET DEFAULT 1000000;

-- Update existing records to reflect unlimited vision
UPDATE public.org_quotas SET max_users = 1000000, max_projects = 1000000 WHERE max_users < 1000000;
