-- Unify acquisition authority around interactive discovery + queued hydration.
-- Keep user-facing discovery fast and nonblocking while retiring duplicate
-- continuous OSM corridor acquisition that competes for database connections.

do $block$
declare
  v_job bigint;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'kleenest-corridor-ingestion',
      'reconcile-stale-corridor-ingestion-runs',
      'osm-adaptive-concurrency'
    )
  loop
    perform cron.alter_job(job_id=>v_job, active=>false);
  end loop;

  -- Civic/open-data enrichment remains useful, but it is maintenance work,
  -- not a second interactive discovery engine. Run it hourly off the hot path.
  select jobid into v_job
  from cron.job
  where jobname='kleenest-corridor-open-data-ingestion'
  order by jobid
  limit 1;

  if v_job is not null then
    perform cron.alter_job(
      job_id=>v_job,
      schedule=>'17 * * * *'
    );
  end if;
end
$block$;

-- Interactive ingest-map-candidates-v3 does not consult this background policy.
-- Disabling the OSM background policy retires autonomous corridor sweeping while
-- preserving on-demand discovery and canonical persistence.
update public.national_ingestion_source_policies
set enabled=false,
    notes=trim(coalesce(notes,'') || ' Background OSM corridor acquisition retired 2026-10-03; interactive discovery is the acquisition authority and Overture hydration remains queued.'),
    updated_at=now()
where source_key='osm';
