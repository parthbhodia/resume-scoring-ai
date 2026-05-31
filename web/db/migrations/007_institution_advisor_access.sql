-- Institution-scoped advisor access.
--
-- Goal: an advisor at UMBC can sign in with Google and only see students
-- whose authenticated email belongs to umbc.edu. The app backend still uses
-- service-role access for dashboard queries, so it must enforce this scope too;
-- these tables/policies make the institution boundary explicit and ready for
-- future direct Supabase reads.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ── helpers ──────────────────────────────────────────────────────────────────

create or replace function public.email_domain(email text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(split_part(lower(btrim(coalesce(email, ''))), '@', 2), '')
$$;

-- ── institutions ─────────────────────────────────────────────────────────────

create table if not exists public.institutions (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  institution_type text not null default 'university',
  email_domain citext not null unique,
  created_at   timestamptz not null default now(),
  constraint institutions_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint institutions_type_check check (
    institution_type in ('university', 'college', 'high_school', 'bootcamp', 'workforce_program', 'nonprofit', 'other')
  ),
  constraint institutions_email_domain_check check (email_domain::text ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
);

alter table public.institutions
  add column if not exists institution_type text not null default 'university';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'institutions_type_check'
  ) then
    alter table public.institutions
      add constraint institutions_type_check
      check (institution_type in ('university', 'college', 'high_school', 'bootcamp', 'workforce_program', 'nonprofit', 'other'));
  end if;
end $$;

insert into public.institutions (slug, name, institution_type, email_domain)
values ('umbc', 'University of Maryland Baltimore County', 'university', 'umbc.edu')
on conflict (slug) do update
set name = excluded.name,
    institution_type = excluded.institution_type,
    email_domain = excluded.email_domain;

-- ── advisors ────────────────────────────────────────────────────────────────

create table if not exists public.institution_advisors (
  institution_id uuid not null references public.institutions (id) on delete cascade,
  advisor_email  citext not null,
  advisor_user_id uuid references auth.users (id) on delete set null,
  display_name   text,
  title          text,
  role           text not null default 'advisor',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  primary key (institution_id, advisor_email),
  constraint institution_advisors_role_check check (role in ('advisor', 'admin'))
);

alter table public.institution_advisors
  add column if not exists display_name text,
  add column if not exists title text;

create index if not exists institution_advisors_user_idx
  on public.institution_advisors (advisor_user_id)
  where advisor_user_id is not null;

create index if not exists institution_advisors_email_idx
  on public.institution_advisors (advisor_email)
  where active = true;

create or replace function public.validate_institution_advisor_domain()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  expected_domain text;
begin
  select i.email_domain::text
    into expected_domain
    from public.institutions i
   where i.id = new.institution_id;

  if expected_domain is null then
    raise exception 'institution % does not exist', new.institution_id;
  end if;

  if public.email_domain(new.advisor_email::text) <> expected_domain then
    raise exception 'advisor email must belong to %', expected_domain;
  end if;

  return new;
end;
$$;

drop trigger if exists institution_advisors_validate_domain on public.institution_advisors;
create trigger institution_advisors_validate_domain
before insert or update of institution_id, advisor_email
on public.institution_advisors
for each row execute function public.validate_institution_advisor_domain();

-- Seed a UMBC test advisor account.
insert into public.institution_advisors (institution_id, advisor_email, display_name, title, role, active)
select id, 'pbhodia1@umbc.edu', 'Parth Bhodia', 'Test Advisor', 'advisor', true
from public.institutions
where slug = 'umbc'
on conflict (institution_id, advisor_email) do update
set display_name = excluded.display_name,
    title = excluded.title,
    role = excluded.role,
    active = excluded.active;

-- To grant another UMBC advisor:
-- insert into public.institution_advisors (institution_id, advisor_email, display_name, title)
-- select id, 'advisor.name@umbc.edu', 'Advisor Name', 'Advisor Title'
-- from public.institutions
-- where slug = 'umbc';

-- ── student membership ──────────────────────────────────────────────────────

create table if not exists public.institution_students (
  institution_id uuid not null references public.institutions (id) on delete cascade,
  student_user_id uuid not null references auth.users (id) on delete cascade,
  student_email citext not null,
  source text not null default 'analysis_email',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (institution_id, student_user_id),
  constraint institution_students_source_check check (source in ('analysis_email', 'manual'))
);

create index if not exists institution_students_user_idx
  on public.institution_students (student_user_id);

create index if not exists institution_students_email_idx
  on public.institution_students (student_email);

create or replace function public.sync_institution_student_from_analysis()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  matched_institution_id uuid;
begin
  if new.user_id is null or public.email_domain(new.user_email) is null then
    return new;
  end if;

  select i.id
    into matched_institution_id
    from public.institutions i
   where i.email_domain::text = public.email_domain(new.user_email)
   limit 1;

  if matched_institution_id is null then
    return new;
  end if;

  insert into public.institution_students (
    institution_id,
    student_user_id,
    student_email,
    source,
    first_seen_at,
    last_seen_at
  )
  values (
    matched_institution_id,
    new.user_id,
    lower(new.user_email),
    'analysis_email',
    now(),
    now()
  )
  on conflict (institution_id, student_user_id) do update
  set student_email = excluded.student_email,
      last_seen_at = now();

  return new;
end;
$$;

revoke all on function public.sync_institution_student_from_analysis() from public, anon, authenticated;

drop trigger if exists resume_analyses_sync_institution_student on public.resume_analyses;
create trigger resume_analyses_sync_institution_student
after insert or update of user_email
on public.resume_analyses
for each row execute function public.sync_institution_student_from_analysis();

insert into public.institution_students (
  institution_id,
  student_user_id,
  student_email,
  source,
  first_seen_at,
  last_seen_at
)
select
  i.id,
  ra.user_id,
  lower(ra.user_email),
  'analysis_email',
  min(ra.created_at),
  max(ra.created_at)
from public.resume_analyses ra
join public.institutions i
  on i.email_domain::text = public.email_domain(ra.user_email)
where ra.user_id is not null
  and public.email_domain(ra.user_email) is not null
group by i.id, ra.user_id, lower(ra.user_email)
on conflict (institution_id, student_user_id) do update
set student_email = excluded.student_email,
    last_seen_at = greatest(public.institution_students.last_seen_at, excluded.last_seen_at);

-- ── RLS readiness ───────────────────────────────────────────────────────────

alter table public.institutions enable row level security;
alter table public.institution_advisors enable row level security;
alter table public.institution_students enable row level security;

drop policy if exists "authenticated users read institutions" on public.institutions;
create policy "authenticated users read institutions" on public.institutions
  for select using (auth.role() = 'authenticated');

drop policy if exists "advisors read own advisor memberships" on public.institution_advisors;
create policy "advisors read own advisor memberships" on public.institution_advisors
  for select using (
    active = true
    and (
      advisor_user_id = auth.uid()
      or lower(advisor_email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "students read own institution memberships" on public.institution_students;
create policy "students read own institution memberships" on public.institution_students
  for select using (student_user_id = auth.uid());

drop policy if exists "advisors read institution students" on public.institution_students;
create policy "advisors read institution students" on public.institution_students
  for select using (
    exists (
      select 1
      from public.institution_advisors ia
      where ia.institution_id = institution_students.institution_id
        and ia.active = true
        and (
          ia.advisor_user_id = auth.uid()
          or lower(ia.advisor_email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists "advisors read institution analyses" on public.resume_analyses;
create policy "advisors read institution analyses" on public.resume_analyses
  for select using (
    exists (
      select 1
      from public.institution_students ist
      join public.institution_advisors ia
        on ia.institution_id = ist.institution_id
      where ist.student_user_id = resume_analyses.user_id
        and ia.active = true
        and (
          ia.advisor_user_id = auth.uid()
          or lower(ia.advisor_email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists "advisors read institution resumes" on public.resumes;
create policy "advisors read institution resumes" on public.resumes
  for select using (
    exists (
      select 1
      from public.institution_students ist
      join public.institution_advisors ia
        on ia.institution_id = ist.institution_id
      where ist.student_user_id = resumes.user_id
        and ia.active = true
        and (
          ia.advisor_user_id = auth.uid()
          or lower(ia.advisor_email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists "advisors read institution criteria" on public.criteria;
create policy "advisors read institution criteria" on public.criteria
  for select using (
    exists (
      select 1
      from public.resumes r
      join public.institution_students ist
        on ist.student_user_id = r.user_id
      join public.institution_advisors ia
        on ia.institution_id = ist.institution_id
      where r.id = criteria.resume_id
        and ia.active = true
        and (
          ia.advisor_user_id = auth.uid()
          or lower(ia.advisor_email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists "advisors read institution resume signals" on public.resume_signals;
create policy "advisors read institution resume signals" on public.resume_signals
  for select using (
    exists (
      select 1
      from public.resumes r
      join public.institution_students ist
        on ist.student_user_id = r.user_id
      join public.institution_advisors ia
        on ia.institution_id = ist.institution_id
      where r.id = resume_signals.resume_id
        and ia.active = true
        and (
          ia.advisor_user_id = auth.uid()
          or lower(ia.advisor_email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );
