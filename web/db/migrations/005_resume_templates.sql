-- Canonical structured-template source for the Jinja renderer.
-- Backend now resolves template TeX from this table (Supabase-first).

create table if not exists resume_templates (
  id               uuid primary key default gen_random_uuid(),
  reference_folder text not null,
  tex_body         text not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists resume_templates_reference_folder_uidx
  on resume_templates (reference_folder)
  where active = true;

create index if not exists resume_templates_active_idx
  on resume_templates (active);
