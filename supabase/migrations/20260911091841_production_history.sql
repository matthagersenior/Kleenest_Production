-- Fleet operational event convergence uses ON CONFLICT(deduplication_key).
-- Make the database invariant match that trigger contract.

drop index if exists public.idx_data_feature_events_dedup;
create unique index if not exists data_feature_events_deduplication_key_unique
  on public.data_feature_events(deduplication_key);

comment on index public.data_feature_events_deduplication_key_unique is
  'Required by operational-event intelligence convergence for idempotent feature-event ingestion.';
