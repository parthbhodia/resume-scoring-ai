-- Migration 006: persist per-student analysis results + cohort stats support
-- Run in Supabase SQL Editor → New query

-- ── analyses ─────────────────────────────────────────────────────────────────
-- Stores every AI analysis result so students can track improvement over time
-- and advisors can query cohort-level patterns.
create table if not exists analyses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  user_email       text,
  resume_name      text,               -- extracted name from resume header
  overall_score    int,                -- 0-100
  category_scores  jsonb not null default '{}'::jsonb,
  -- ^ {readability, atsCompatibility, jobMatch, achievementQuality,
  --    quantification, sectionStructure, languageQuality, technicalBranding}
  top_issues       jsonb not null default '[]'::jsonb,   -- [{title, severity, description}]
  top_strengths    jsonb not null default '[]'::jsonb,   -- [string]
  ats_warnings     jsonb not null default '[]'::jsonb,   -- [string]
  missing_keywords jsonb not null default '[]'::jsonb,   -- [string]
  keyword_score    int,                -- null when no JD provided
  bullet_count     int,                -- total bullets analysed
  weak_bullet_count int,               -- bullets scoring < 55
  has_jd           bool not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists analyses_user_created_idx on analyses (user_id, created_at desc);
create index if not exists analyses_created_idx      on analyses (created_at desc);
create index if not exists analyses_score_idx        on analyses (overall_score);

alter table analyses enable row level security;

-- Students can only read their own analyses
create policy "users read own analyses" on analyses
  for select using (auth.uid() = user_id);

-- Backend (service role) inserts on behalf of users — bypasses RLS
-- Students themselves cannot insert directly (backend always writes)

-- ── cohort_stats view ─────────────────────────────────────────────────────────
-- Advisors query this via service-role key — not exposed to students directly.
-- Aggregates across ALL users so RLS is intentionally bypassed by service role.
create or replace view cohort_stats_v as
select
  count(distinct user_id)                                       as student_count,
  count(*)                                                      as analysis_count,
  round(avg(overall_score))                                     as avg_overall_score,
  round(avg((category_scores->>'readability')::numeric))        as avg_readability,
  round(avg((category_scores->>'atsCompatibility')::numeric))   as avg_ats_compatibility,
  round(avg((category_scores->>'achievementQuality')::numeric)) as avg_achievement_quality,
  round(avg((category_scores->>'quantification')::numeric))     as avg_quantification,
  round(avg((category_scores->>'sectionStructure')::numeric))   as avg_section_structure,
  round(avg((category_scores->>'languageQuality')::numeric))    as avg_language_quality,
  round(avg((category_scores->>'technicalBranding')::numeric))  as avg_technical_branding,
  round(avg(keyword_score) filter (where keyword_score is not null)) as avg_keyword_score,
  round(avg(weak_bullet_count::numeric / nullif(bullet_count, 0) * 100)) as pct_weak_bullets,
  count(*) filter (where overall_score < 50)  as score_tier_low,
  count(*) filter (where overall_score between 50 and 69) as score_tier_mid,
  count(*) filter (where overall_score between 70 and 84) as score_tier_good,
  count(*) filter (where overall_score >= 85)  as score_tier_strong
from analyses;

-- ── student_progress view ─────────────────────────────────────────────────────
-- Per-student first vs. latest score delta for advisor dashboards.
create or replace view student_progress_v as
select
  user_id,
  user_email,
  count(*)                           as analysis_count,
  min(created_at)                    as first_analysis_at,
  max(created_at)                    as last_analysis_at,
  (array_agg(overall_score order by created_at asc))[1]  as first_score,
  (array_agg(overall_score order by created_at desc))[1] as latest_score,
  (array_agg(overall_score order by created_at desc))[1]
    - (array_agg(overall_score order by created_at asc))[1] as score_delta
from analyses
group by user_id, user_email;
