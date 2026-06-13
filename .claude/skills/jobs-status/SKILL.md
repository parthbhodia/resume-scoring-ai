---
description: Live snapshot of the Resunova jobs pipeline — scan activity, postings ingested/extracted, application-tracker funnel, and cron-job health. Invoke when the user asks to see jobs/scan/extraction status, "how many jobs", "how many scans", cron status, or wants the jobs analytics picture.
---

# Jobs pipeline status — live snapshot

Produces an at-a-glance dashboard of the job-feed pipeline from **live data**, not memory. Run all four steps, then render the visual.

## Environment

- **Staging Supabase project id**: `uvnncrtulyezsylcxnhw` (query via the `supabase` MCP `execute_sql`; this is the DB the staging API writes to).
- **Production Supabase project id**: `eiumlptnsmowvkxucprl` (the other Supabase MCP server). Default to **staging** unless the user says "prod"/"production".
- **GitHub repo for crons**: `parthbhodia/resunova-api` (use `gh` CLI).
- Tables: `job_postings`, `job_scan_runs`, `job_post_events`, `job_applications`, `usage_events`.

## Step 1 — Postings + extraction (one query)

**`pending` must mean RECENT-eligible** (postered within `EXTRACT_MAX_AGE_DAYS`, default 30) — that's all the extractor ever works on. Old postings (>window) are intentionally never extracted, so counting them as "pending" overstates the real backlog ~3-4×. Report `recent_pending` as the headline; surface `old_skipped` separately so it's clear it's not a backlog.

```sql
select
 (select count(*) from job_postings where is_active) as active_postings,
 (select count(*) from job_postings where is_active and requirement_concepts is not null) as extracted,
 (select count(*) from job_postings where is_active and requirement_concepts is null and posted_at > now() - interval '30 days') as recent_pending,
 (select count(*) from job_postings where is_active and requirement_concepts is null and (posted_at <= now() - interval '30 days' or posted_at is null)) as old_skipped,
 (select count(distinct company) from job_postings where is_active) as companies;
```
When rendering, the "Pending extraction" KPI = `recent_pending`; note `old_skipped` as "(+N old, not extracted by design)" so the big number never reads as a backlog.

Per-source breakdown:
```sql
select source, count(*) as active, count(*) filter (where requirement_concepts is not null) as extracted
from job_postings where is_active group by source order by active desc;
```

## Step 2 — Scan activity

```sql
select
 (select count(*) from job_scan_runs) as total_runs,
 (select count(*) from job_scan_runs where started_at > now() - interval '24 hours') as runs_24h,
 (select coalesce(sum(upserted),0) from job_scan_runs where started_at > now() - interval '24 hours') as jobs_added_24h,
 (select coalesce(sum(extracted),0) from job_scan_runs where started_at > now() - interval '24 hours') as extracted_24h,
 (select coalesce(sum(extraction_failures),0) from job_scan_runs where started_at > now() - interval '24 hours') as failures_24h;
```
Most recent run for freshness: `select started_at, companies, fetched, upserted, extracted, extraction_failures from job_scan_runs order by started_at desc limit 1;`

## Step 3 — Application-tracker funnel + LLM cost

```sql
select status, count(*) from job_applications group by status order by count(*) desc;
```
```sql
select count(*) filter (where event_type='apply_click') as apply_clicks,
       count(distinct user_id) filter (where event_type='apply_click') as unique_appliers
from job_post_events where created_at > now() - interval '30 days';
```
Extraction LLM spend (tokens): `select coalesce(sum(total_tokens),0) as jobs_extract_tokens, count(*) as calls from usage_events where tool_name='jobs_extract' and created_at > now() - interval '30 days';`

## Step 4 — Cron jobs (GitHub Actions)

```bash
cd /Users/mslcomx/Projects/resunova-api
# Scheduled workflows + their state
gh workflow list
# The daily job-feed scan cron — schedule is "0 10 * * *" (10:00 UTC ~6am ET). Recent runs:
gh run list --workflow="jobs-scan-cron.yml" --limit 5 --json status,conclusion,createdAt,event \
  -q '.[] | "\(.createdAt) \(.event) \(.status)/\(.conclusion // "running")"'
```
Report: how many cron workflows exist, their schedules, whether any run is currently in progress, and the last run's outcome. (As of this skill's creation there is **one** scheduled cron: `Daily job-feed scan`, daily at 10:00 UTC.) If a scan run is `in_progress`, say so — the corpus is actively growing.

## Step 5 — Render the dashboard

Use `mcp__visualize__show_widget` (read_me with `data_viz` first if not already loaded this session). Render:
- A metric-card row: scan runs (24h), companies, active postings, extracted (success color), pending extraction (warning color).
- A horizontal stacked bar of postings by source (extracted vs pending) — colors `#1D9E75` extracted / `#EF9F27` pending.
- A small line for the application funnel if there are any applications: applied → interviewing → offer counts.

In the **text response** (outside the widget), surface: cron health (count + schedule + last run + whether one is running now), the extraction backlog (pending count), and call out any data caveats — e.g. if `companies` is far below the seeded portal count (~1,465), note that new boards are seeded but not yet scanned in (a full scan is needed/running).

## Notes
- Always present numbers as **live** ("as of now"); never quote remembered figures.
- If the user asks for prod, swap the project id to `eiumlptnsmowvkxucprl` and say so.
