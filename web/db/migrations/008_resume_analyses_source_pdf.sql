-- Store uploaded source PDF for Analyze runs (advisor + library can link like Tailor pdf_url).

alter table public.resume_analyses
  add column if not exists source_pdf_url text,
  add column if not exists source_filename text;

create index if not exists resume_analyses_source_pdf_idx
  on public.resume_analyses (user_id, created_at desc)
  where source_pdf_url is not null and btrim(source_pdf_url) <> '';
