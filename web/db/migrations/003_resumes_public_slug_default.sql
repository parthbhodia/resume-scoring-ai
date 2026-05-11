-- Custom public URL slug + single default resume per user (see web/db/schema.sql)
alter table resumes add column if not exists public_slug text;
alter table resumes add column if not exists is_default boolean not null default false;

create unique index if not exists resumes_public_slug_lower_uidx
  on resumes (lower(public_slug))
  where public_slug is not null and btrim(public_slug) <> '';

create unique index if not exists resumes_one_default_per_user_uidx
  on resumes (user_id)
  where is_default = true;
