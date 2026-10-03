-- Coordinate Kleenest_Data as the worker/data plane while Production remains canonical.
-- Safe on Production: jobs are installed only on the project that owns public.geo_locations.

do $$
begin
  if to_regclass('public.geo_locations') is null
     or to_regclass('archive.object_manifests') is null
     or to_regprocedure('public.get_internal_geo_archive_secret()') is null then
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('kleenest-data-geo-archive-worker','kleenest-data-provenance-archive-worker');

  perform cron.schedule(
    'kleenest-data-geo-archive-worker',
    '11-59/15 * * * *',
    $job$
      select net.http_post(
        url := 'https://sxgymblzmwdqnaidbbuq.supabase.co/functions/v1/archive-object-backfill',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-kleenest-geo-archive', public.get_internal_geo_archive_secret()
        ),
        body := jsonb_build_object(
          'kind','geo_locations',
          'batches',2,
          'limit',1000,
          'after_id',(
            select last_row_id
            from archive.object_manifests
            where kind='geo_locations'
              and object_path like 'geo_locations/backfill/%'
            order by created_at desc
            limit 1
          )
        ),
        timeout_milliseconds := 120000
      );
    $job$
  );

  perform cron.schedule(
    'kleenest-data-provenance-archive-worker',
    '41 * * * *',
    $job$
      select net.http_post(
        url := 'https://sxgymblzmwdqnaidbbuq.supabase.co/functions/v1/archive-object-backfill',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-kleenest-geo-archive', public.get_internal_geo_archive_secret()
        ),
        body := jsonb_build_object(
          'kind','external_location_records',
          'batches',2,
          'limit',1000,
          'after_id',(
            select last_row_id
            from archive.object_manifests
            where kind='external_location_records'
              and object_path like 'external_location_records/backfill/%'
            order by created_at desc
            limit 1
          )
        ),
        timeout_milliseconds := 120000
      );
    $job$
  );
end
$$;
