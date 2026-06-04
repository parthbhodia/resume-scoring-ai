-- Allow non-@umbc.edu advisor emails when explicitly marked external (e.g. Gmail SSO).

alter table public.institution_advisors
  add column if not exists external_email boolean not null default false;

create or replace function public.validate_institution_advisor_domain()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  expected_domain text;
begin
  if coalesce(new.external_email, false) then
    return new;
  end if;

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

insert into public.institution_advisors (
  institution_id,
  advisor_email,
  advisor_user_id,
  display_name,
  title,
  role,
  active,
  external_email
)
select
  i.id,
  'adishshah29@gmail.com',
  u.id,
  'Adish Shah',
  'UMBC Advisor',
  'advisor',
  true,
  true
from public.institutions i
cross join lateral (
  select id from auth.users where email = 'adishshah29@gmail.com' limit 1
) u
where i.slug = 'umbc'
on conflict (institution_id, advisor_email) do update
set display_name = excluded.display_name,
    title = excluded.title,
    role = excluded.role,
    active = excluded.active,
    external_email = excluded.external_email,
    advisor_user_id = coalesce(excluded.advisor_user_id, institution_advisors.advisor_user_id);
