-- Tailor / Profile defaults + EEO fields (JSON) per auth user.
-- Run in Supabase SQL Editor if `user_profiles` does not exist yet.

create table if not exists user_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  profile    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_updated_idx on user_profiles (updated_at desc);

alter table user_profiles enable row level security;

create policy "users read own profile" on user_profiles
  for select using (auth.uid() = user_id);

create policy "users insert own profile" on user_profiles
  for insert with check (auth.uid() = user_id);

create policy "users update own profile" on user_profiles
  for update using (auth.uid() = user_id);

create policy "users delete own profile" on user_profiles
  for delete using (auth.uid() = user_id);
