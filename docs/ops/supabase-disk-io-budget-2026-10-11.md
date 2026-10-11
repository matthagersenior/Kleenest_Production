# Kleenest Production: disk I/O budget prevention (2026-10-11)

Supabase sent a low disk-I/O-budget warning for Production (`ssgesjzdvdsqacdtasje`).
The observed recurring work included an exact metrics refresh every five minutes
that scanned the whole ~555k-location catalog and an hourly historical brand
identity backfill repeatedly searching the same records.

## Fix deployed

- Migration `20261011001057`: keep the five-minute Owner metric freshness and
  exact totals by reusing the existing trigger-maintained active-location counter,
  counting rare inactive locations, and adding B-tree indexes for the
  `created_at` and `updated_at` rolling windows.
- Migration `20261011001305`: persist a history-repair cursor and suspend
  repeat no-work scans for six hours. New ingestion/canonicalization stays enabled.
- Existing ingestion and Owner UI API signatures were not changed.

## Operational checks

1. Supabase Production → Observability → Database: inspect Disk I/O budget,
   throughput/IOPS, I/O wait, response latency, and compute size. **Database
   statistics are not equivalent to Supabase's actual storage burst-credit
   budget**.
2. Inspect `cron.job_run_details` for
   `kleenest-ingestion-canonical-metrics` and
   `kleenest-brand-identity-backfill`. Check successful runs and duration.
3. Validate `select internal.refresh_ingestion_canonical_metrics();` returns
   count_source `cached_exact`. Compare with a one-off exact location count
   during a low-traffic maintenance window.
4. Check `EXPLAIN SELECT count(*) FROM public.locations WHERE created_at >=
   now()-interval '24 hours';` and similarly for `updated_at`; both should
   use the respective `locations_canonical_*_idx` index.
5. Compare Production and Kleenest_Data capacity separately before moving
   additional archival workloads. Do not blindly pause discovery or restrict
   growth based on storage size alone.

## Capacity considerations

The database connection does not expose the Supabase disk-I/O credit percentage
or current compute add-on size. If the provider chart continues to fall under
normal traffic, investigate expensive ingest/search RPCs and insufficient
baseline throughput and evaluate compute upgrades. It is not safe to declare
budget exhaustion fully prevented until provider I/O trends remain stable.
