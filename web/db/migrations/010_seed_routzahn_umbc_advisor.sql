-- UMBC Career Center advisor: Christine Routzahn

insert into public.institution_advisors (
  institution_id,
  advisor_email,
  display_name,
  title,
  role,
  active,
  external_email
)
select
  i.id,
  'routzahn@umbc.edu',
  'Christine Routzahn',
  'Director, UMBC Career Center',
  'advisor',
  true,
  false
from public.institutions i
where i.slug = 'umbc'
on conflict (institution_id, advisor_email) do update
set display_name = excluded.display_name,
    title = excluded.title,
    role = excluded.role,
    active = excluded.active,
    external_email = excluded.external_email;
