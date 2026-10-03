-- Keep Production -> Kleenest_Data archive scans bounded as ingestion grows.
-- Each index matches the workflow's time watermark plus deterministic ID keyset order.

create index if not exists external_location_records_archive_sync_idx
  on public.external_location_records(last_seen_at,id)
  where last_seen_at is not null;

create index if not exists external_observations_archive_sync_idx
  on public.external_observations(imported_at,id)
  where imported_at is not null;

create index if not exists national_ingestion_runs_archive_sync_idx
  on public.national_ingestion_runs(started_at,id)
  where started_at is not null;
