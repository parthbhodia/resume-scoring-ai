-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

create extension if not exists "pgcrypto";

-- ── resumes ──────────────────────────────────────────────────────────────────
create table if not exists resumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  folder      text not null,
  company     text not null,
  role        text not null,
  model_used  text,
  tex_path    text,
  pdf_url     text,
  score       int,
  verdict     text,
  created_at  timestamptz default now(),
  unique (user_id, folder)
);

-- ── criteria ─────────────────────────────────────────────────────────────────
create table if not exists criteria (
  id          uuid primary key default gen_random_uuid(),
  resume_id   uuid not null references resumes(id) on delete cascade,
  name        text not null,
  weight     text,   -- 'High' | 'Medium' | 'Low'
  score       int,    -- 1-10
  notes       text,
  unique (resume_id, name)
);

-- ── resume_signals (whats_working + gaps) ───────────────────────────────────
create table if not exists resume_signals (
  id          uuid primary key default gen_random_uuid(),
  resume_id   uuid not null references resumes(id) on delete cascade,
  kind        text not null,   -- 'working' | 'gap'
  text        text not null
);

-- ── RLS (Row Level Security) ─────────────────────────────────────────────────
-- Proper user isolation: users can only see/edit their own data
alter table resumes        enable row level security;
alter table criteria       enable row level security;
alter table resume_signals enable row level security;

-- Users can read their own resumes
create policy "users read own resumes" on resumes
  for select using (auth.uid() = user_id);

-- Users can insert their own resumes
create policy "users insert own resumes" on resumes
  for insert with check (auth.uid() = user_id);

-- Users can update their own resumes
create policy "users update own resumes" on resumes
  for update using (auth.uid() = user_id);

-- Users can delete their own resumes
create policy "users delete own resumes" on resumes
  for delete using (auth.uid() = user_id);

-- Criteria: user must own the parent resume
create policy "users manage own criteria" on criteria
  for all using (
    exists (select 1 from resumes where id = resume_id and user_id = auth.uid())
  );

-- Resume signals: user must own the parent resume
create policy "users manage own signals" on resume_signals
  for all using (
    exists (select 1 from resumes where id = resume_id and user_id = auth.uid())
  );

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

-- JSON backup bucket for editor state
insert into storage.buckets (id, name, public)
  values ('resume-json', 'resume-json', true)
  on conflict (id) do nothing;

-- ── Storage RLS ────────────────────────────────────────────────────────────────
-- Allow service role full access (backend uploads)
-- Allow users to read their own files via owner tag
create policy "service role full access" on storage.objects
  for all using (bucket_id in ('resume-pdfs', 'resume-tex'))
  with check (true);

-- ── share_links (Phase 8b) ───────────────────────────────────────────────────
-- Lightweight shortid → folder map so users can hand out a public link to a
-- recipient (recruiter, hiring manager) without exposing the underlying
-- Supabase Storage URL or user_id. View counter is a soft analytic.
create table if not exists share_links (
  shortid     text primary key,                  -- 8-char base32 nanoid
  user_id     uuid not null,
  folder      text not null,
  pdf_url     text,                              -- snapshot at share time
  created_at  timestamptz default now(),
  views       int default 0,
  revoked     bool default false
);

-- Earlier drafts tried to reference resumes(user_id), but one user can own many
-- resumes, so that column cannot be a foreign key target by itself.
alter table share_links drop constraint if exists share_links_user_id_fkey;

-- folder is only unique per-user on resumes, not globally unique, so it cannot
-- be a standalone FK target. The backend checks ownership before minting links.
alter table share_links drop constraint if exists share_links_folder_fkey;

create index if not exists share_links_folder_idx on share_links (folder);
create index if not exists share_links_user_idx on share_links (user_id);

alter table share_links enable row level security;

-- Users can only see their own share links
create policy "users manage own shares" on share_links
  for all using (auth.uid() = user_id);

-- ── resume_versions ─────────────────────────────────────────────────────────
-- Version history for resumes — stores parsed JSON snapshots
create table if not exists resume_versions (
  id          uuid primary key default gen_random_uuid(),
  resume_id   uuid not null references resumes(id) on delete cascade,
  version     int not null,
  parsed_json text not null,           -- Full editor tree snapshot
  created_at  timestamptz default now(),
  unique (resume_id, version)
);

create index if not exists resume_versions_resume_idx on resume_versions (resume_id);

alter table resume_versions enable row level security;

-- Users can only see versions of their own resumes
create policy "users manage own versions" on resume_versions
  for all using (
    exists (select 1 from resumes where id = resume_id and user_id = auth.uid())
  );
