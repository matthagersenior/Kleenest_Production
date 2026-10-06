alter table public.ingestion_candidate_batches
  add column if not exists skipped_count integer not null default 0,
  add column if not exists repair_count integer not null default 0,
  add column if not exists metrics_version integer not null default 0,
  add column if not exists result_summary jsonb;
