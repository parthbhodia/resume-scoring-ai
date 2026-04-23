-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

create extension if not exists "pgcrypto";

-- ── resumes ──────────────────────────────────────────────────────────────────
create table if not exists resumes (
  id          uuid primary key default gen_random_uuid(),
  folder      text unique not null,
  company     text not null,
  role        text not null,
  model_used  text,
  tex_path    text,
  pdf_url     text,
  score       int,
  verdict     text,
  created_at  timestamptz default now()
);

-- ── criteria ─────────────────────────────────────────────────────────────────
create table if not exists criteria (
  id          uuid primary key default gen_random_uuid(),
  resume_id   uuid not null references resumes(id) on delete cascade,
  name        text not null,
  weight      text,   -- 'High' | 'Medium' | 'Low'
  score       int,    -- 1-10
  notes       text,
  unique (resume_id, name)
);

-- ── resume_signals (whats_working + gaps) ────────────────────────────────────
create table if not exists resume_signals (
  id          uuid primary key default gen_random_uuid(),
  resume_id   uuid not null references resumes(id) on delete cascade,
  kind        text not null,   -- 'working' | 'gap'
  text        text not null
);

-- ── RLS (Row Level Security) ─────────────────────────────────────────────────
-- Anon key can read and write (single-user personal tool)
alter table resumes        enable row level security;
alter table criteria       enable row level security;
alter table resume_signals enable row level security;

create policy "anon full access" on resumes        for all using (true) with check (true);
create policy "anon full access" on criteria       for all using (true) with check (true);
create policy "anon full access" on resume_signals for all using (true) with check (true);

-- ── Storage buckets ──────────────────────────────────────────────────────────
-- Generated PDFs and .tex sources are uploaded by the Railway backend with
-- the SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Buckets are public so the
-- Download PDF link in the UI works without per-request signed URLs — paths
-- include the user's UUID + a timestamped folder slug, so they're effectively
-- unguessable.
insert into storage.buckets (id, name, public)
  values ('resume-pdfs', 'resume-pdfs', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('resume-tex',  'resume-tex',  true)
  on conflict (id) do nothing;
