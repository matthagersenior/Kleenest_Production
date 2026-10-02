-- One acquisition authority per provider: official Overture GeoParquet is canonical.
update public.external_data_sources
set active=false, updated_at=now()
where source_key='overture_places';

delete from public.external_ingestion_adapters
where source_key='overture_places';

alter table public.external_ingestion_adapters
  drop constraint if exists external_ingestion_adapters_adapter_kind_check;

alter table public.external_ingestion_adapters
  add constraint external_ingestion_adapters_adapter_kind_check
  check (adapter_kind = any (array['socrata'::text,'arcgis'::text,'geojson'::text,'bulk'::text]));

-- Recover abandoned Overture hydration leases. The worker will increment attempts on retry.
update public.place_discovery_hydration_queue
set status='failed',
    started_at=null,
    last_error='STALE_WORKER_RECOVERED',
    updated_at=now()
where status='running'
  and started_at < now()-interval '90 minutes'
  and attempt_count < 5;
