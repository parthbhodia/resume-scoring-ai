-- Add notify_prefs column to user_profiles for email marketing preferences.
-- Keys: accountChanges (bool), scanLimit (bool), features (bool)
alter table user_profiles
  add column if not exists notify_prefs jsonb not null default '{}'::jsonb;
