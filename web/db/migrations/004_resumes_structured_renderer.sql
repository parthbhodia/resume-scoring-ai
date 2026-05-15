-- Structured renderer metadata (ResumeDoc + patch provenance)
-- Safe additive migration; no behavior change for existing rows.

alter table if exists resumes
  add column if not exists resume_doc jsonb,
  add column if not exists applied_patch jsonb,
  add column if not exists renderer text,
  add column if not exists schema_version int;

-- Backfill sensible defaults for existing rows
update resumes
set renderer = coalesce(renderer, 'legacy'),
    schema_version = coalesce(schema_version, 1)
where renderer is null
   or schema_version is null;

-- Soft guardrails (non-breaking)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'resumes_renderer_check'
  ) then
    alter table resumes
      add constraint resumes_renderer_check
      check (renderer is null or renderer in ('legacy', 'structured'));
  end if;
end $$;
