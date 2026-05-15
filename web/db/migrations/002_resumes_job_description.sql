-- Run in Supabase SQL editor if `resumes` already exists without this column.
alter table resumes add column if not exists job_description text;
