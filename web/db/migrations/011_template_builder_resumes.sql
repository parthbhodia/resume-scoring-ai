-- Migration 011: cloud-saved Template Builder drafts (Resume Hub)
-- Run in Supabase SQL Editor → New query

create table if not exists public.template_builder_resumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  label       text not null default 'Untitled résumé',
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists template_builder_resumes_user_updated_idx
  on public.template_builder_resumes (user_id, updated_at desc);

alter table public.template_builder_resumes enable row level security;

drop policy if exists "users read own builder resumes" on public.template_builder_resumes;
create policy "users read own builder resumes" on public.template_builder_resumes
  for select using (auth.uid() = user_id);

drop policy if exists "users insert own builder resumes" on public.template_builder_resumes;
create policy "users insert own builder resumes" on public.template_builder_resumes
  for insert with check (auth.uid() = user_id);

drop policy if exists "users update own builder resumes" on public.template_builder_resumes;
create policy "users update own builder resumes" on public.template_builder_resumes
  for update using (auth.uid() = user_id);

drop policy if exists "users delete own builder resumes" on public.template_builder_resumes;
create policy "users delete own builder resumes" on public.template_builder_resumes
  for delete using (auth.uid() = user_id);
