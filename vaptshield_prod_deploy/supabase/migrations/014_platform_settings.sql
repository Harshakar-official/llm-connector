-- Migration: Platform Settings Table
-- Description: Global platform configuration for super admins.
-- Enables enterprise-grade settings management with audit trail.

create table if not exists platform_settings (
  id uuid default gen_random_uuid() primary key,
  key text unique not null,
  value text not null,
  category text not null default 'general',
  description text,
  updated_by uuid references profiles(id),
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Enable RLS
alter table platform_settings enable row level security;

-- Only super admins can read platform settings
create policy "platform_settings_select" on platform_settings for select
  using (is_super_admin());

-- Only super admins can insert/update platform settings
create policy "platform_settings_insert" on platform_settings for insert
  with check (is_super_admin());

create policy "platform_settings_update" on platform_settings for update
  using (is_super_admin());

-- Seed default settings
insert into platform_settings (key, value, category, description) values
  ('platform_name', 'VAPTShield', 'general', 'Platform display name'),
  ('support_email', 'support@vaptshield.com', 'general', 'Support contact email'),
  ('mfa_enforced', 'false', 'security', 'Enforce MFA for all users'),
  ('session_timeout_minutes', '480', 'security', 'Session timeout in minutes (default 8 hours)'),
  ('password_min_length', '12', 'security', 'Minimum password length'),
  ('max_failed_attempts', '5', 'security', 'Max failed login attempts before lockout'),
  ('self_registration_enabled', 'true', 'features', 'Allow self-registration'),
  ('ai_features_enabled', 'true', 'features', 'Enable AI-powered vulnerability analysis'),
  ('default_org_projects_limit', '5', 'quotas', 'Default max projects for new organizations'),
  ('default_org_users_limit', '10', 'quotas', 'Default max users for new organizations'),
  ('maintenance_mode', 'false', 'general', 'Put platform in maintenance mode'),
  ('maintenance_message', 'VAPTShield is currently undergoing scheduled maintenance. Please check back shortly.', 'general', 'Maintenance mode message')
on conflict (key) do nothing;