-- Coordinate background ingestion and lower database connection pressure.
-- Interactive discovery keeps using ingest_external_locations directly; background
-- Overture/OSM/civic writers use a non-blocking transaction-level admission lock.

create or replace function public.ingest_external_locations_background(
  p_source_key text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not pg_catalog.pg_try_advisory_xact_lock(812733, 1) then
    return jsonb_build_object(
      'deferred', true,
      'reason', 'background_ingestion_busy',
      'durably_accounted', false,
      'source_key', p_source_key
    );
  end if;

  return public.ingest_external_locations(p_source_key, p_rows);
end;
$function$;

revoke all on function public.ingest_external_locations_background(text,jsonb) from public, anon, authenticated;
grant execute on function public.ingest_external_locations_background(text,jsonb) to service_role;

-- Use the existing geography GiST index for fuzzy cross-source identity matching.
create or replace function public.resolve_location_external_identity_v2(
  p_source_dataset text,
  p_source_external_id text,
  p_latitude double precision,
  p_longitude double precision,
  p_name text default null,
  p_brand text default null,
  p_operator text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_brand_key text:=public.normalize_brand_key(p_brand);
  v_name_key text:=public.normalize_brand_key(p_name);
  v_point extensions.geography;
begin
  if p_source_dataset is not null and p_source_external_id is not null then
    select l.id into v_id
    from public.locations l
    where l.source_dataset=p_source_dataset
      and l.source_external_id=p_source_external_id
    limit 1;
    if v_id is not null then return v_id; end if;

    select elr.location_id into v_id
    from public.external_location_records elr
    join public.external_data_sources eds on eds.id=elr.source_id
    where eds.source_key=p_source_dataset
      and elr.external_id=p_source_external_id
      and elr.location_id is not null
    limit 1;
    if v_id is not null then return v_id; end if;

    if p_source_dataset='overture' and p_source_external_id like 'overture:%' then
      select elr.location_id into v_id
      from public.external_location_records elr
      join public.external_data_sources eds on eds.id=elr.source_id
      where eds.source_key='overture_places'
        and elr.external_id=substr(p_source_external_id,length('overture:')+1)
        and elr.location_id is not null
      limit 1;
      if v_id is not null then return v_id; end if;
    end if;
  end if;

  if p_latitude is null or p_longitude is null then return null; end if;

  v_point:=extensions.st_setsrid(
    extensions.st_makepoint(p_longitude,p_latitude),
    4326
  )::extensions.geography;

  select l.id into v_id
  from public.locations l
  left join public.location_brand_identities bi on bi.location_id=l.id
  where l.is_active=true
    and l.geom is not null
    and extensions.st_dwithin(l.geom,v_point,80.0)
    and (
      (v_brand_key is not null and public.normalize_brand_key(coalesce(bi.canonical_brand,l.brand_name))=v_brand_key)
      or (v_name_key is not null and public.normalize_brand_key(l.name)=v_name_key)
      or (
        nullif(trim(coalesce(p_address,'')),'') is not null
        and lower(trim(coalesce(l.address,'')))=lower(trim(p_address))
        and (nullif(trim(coalesce(p_city,'')),'') is null or lower(trim(coalesce(l.city,'')))=lower(trim(p_city)))
        and (nullif(trim(coalesce(p_state,'')),'') is null or lower(trim(coalesce(l.state,'')))=lower(trim(p_state)))
      )
    )
  order by
    case
      when v_brand_key is not null and public.normalize_brand_key(coalesce(bi.canonical_brand,l.brand_name))=v_brand_key then 0
      when v_name_key is not null and public.normalize_brand_key(l.name)=v_name_key then 1
      else 2
    end,
    extensions.st_distance(l.geom,v_point)
  limit 1;

  if v_id is not null then return v_id; end if;

  -- Compatibility fallback for the small set of legacy rows without geography.
  select l.id into v_id
  from public.locations l
  left join public.location_brand_identities bi on bi.location_id=l.id
  where l.is_active=true
    and l.geom is null
    and l.latitude between p_latitude-0.00055 and p_latitude+0.00055
    and l.longitude between p_longitude-0.00055 and p_longitude+0.00055
    and (
      (v_brand_key is not null and public.normalize_brand_key(coalesce(bi.canonical_brand,l.brand_name))=v_brand_key)
      or (v_name_key is not null and public.normalize_brand_key(l.name)=v_name_key)
      or (
        nullif(trim(coalesce(p_address,'')),'') is not null
        and lower(trim(coalesce(l.address,'')))=lower(trim(p_address))
        and (nullif(trim(coalesce(p_city,'')),'') is null or lower(trim(coalesce(l.city,'')))=lower(trim(p_city)))
        and (nullif(trim(coalesce(p_state,'')),'') is null or lower(trim(coalesce(l.state,'')))=lower(trim(p_state)))
      )
    )
  order by
    case
      when v_brand_key is not null and public.normalize_brand_key(coalesce(bi.canonical_brand,l.brand_name))=v_brand_key then 0
      when v_name_key is not null and public.normalize_brand_key(l.name)=v_name_key then 1
      else 2
    end,
    abs(l.latitude-p_latitude)+abs(l.longitude-p_longitude)
  limit 1;

  return v_id;
end;
$function$;

-- Bound reverse-geocoding candidate work to the nearest eligible locations instead
-- of sorting every incomplete location inside a 5-25 km discovery radius.
create or replace function public.address_backfill_candidates(p_limit integer default 12)
returns table(
  id uuid,
  latitude double precision,
  longitude double precision,
  address text,
  city text,
  state text,
  postal_code text,
  country text
)
language sql
stable
security definer
set search_path to 'pg_catalog','public','extensions'
as $function$
  with center as (
    select
      e.latitude,
      e.longitude,
      greatest(
        5000.0,
        least(25000.0, coalesce(e.radius_km,1.609)*1000.0+3000.0)
      ) as radius_m,
      st_setsrid(st_makepoint(e.longitude,e.latitude),4326)::geography as point
    from public.location_discovery_events e
    where e.created_at>=now()-interval '30 days'
      and e.latitude is not null
      and e.longitude is not null
    order by e.created_at desc
    limit 1
  ),
  candidate_pool as materialized (
    select
      l.id,l.latitude,l.longitude,l.address,l.city,l.state,l.postal_code,l.country,l.updated_at,
      case
        when nullif(trim(coalesce(l.address,'')),'') is null then 0
        when l.address ~ '^[A-Z]{2},[[:space:]]*[0-9]{5}(-[0-9]{4})?,[[:space:]]*[A-Z]{2}$' then 1
        when nullif(trim(coalesce(l.city,'')),'') is null then 2
        else 3
      end as priority
    from center c
    join lateral (
      select l.*
      from public.locations l
      left join public.location_address_backfills b on b.location_id=l.id
      where l.is_active=true
        and l.geom is not null
        and st_dwithin(l.geom,c.point,c.radius_m)
        and (
          nullif(trim(coalesce(l.address,'')),'') is null
          or nullif(trim(coalesce(l.city,'')),'') is null
          or nullif(trim(coalesce(l.state,'')),'') is null
          or nullif(trim(coalesce(l.postal_code,'')),'') is null
          or l.address ~ '^[A-Z]{2},[[:space:]]*[0-9]{5}(-[0-9]{4})?,[[:space:]]*[A-Z]{2}$'
          or l.address ~ '^[A-Z]{2}$'
        )
        and (b.fetched_at is null or b.fetched_at<now()-interval '30 days')
      order by l.geom <-> c.point
      limit greatest(200,least(greatest(1,coalesce(p_limit,12))*40,1000))
    ) l on true
  )
  select
    c.id,c.latitude,c.longitude,c.address,c.city,c.state,c.postal_code,c.country
  from candidate_pool c
  order by c.priority,c.updated_at asc
  limit greatest(1,least(coalesce(p_limit,12),25));
$function$;

-- Overture processes one hydration request per automated cycle. Faster cadence
-- replaces large multi-job bursts.
update public.national_ingestion_source_policies
set max_requests_per_cycle=1
where source_key='overture';

-- Re-grid recurring work so routine starts stay at or below three jobs/minute.
do $block$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='kleenest-intelligence-notification-worker';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'0-59/4 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-native-push-receipts';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'1-59/4 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-platform-webhook-worker';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'2-59/4 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-intelligence-outbox';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'3-59/4 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-brand-identity-backfill';
  if v_job is not null then
    perform cron.alter_job(
      job_id=>v_job,
      schedule=>'13,43 * * * *',
      command=>'select public.backfill_location_brand_identities(500);'
    );
  end if;

  select jobid into v_job from cron.job where jobname='kleenest-corridor-ingestion';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'4-59/5 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='reconcile-stale-corridor-ingestion-runs';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'3-59/5 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-corridor-open-data-ingestion';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'1-59/10 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='geo-catalog-export';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'5-59/15 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='cold-provenance-offload';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'8-59/15 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-address-backfill';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'10-59/15 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='fleet-active-dwell-watch';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'2-59/5 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-intelligence-action-worker';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'6-59/10 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-owner-email-notifications';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'6-59/10 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='location-ingestion-repair';
  if v_job is not null then
    perform cron.alter_job(
      job_id=>v_job,
      schedule=>'2-59/10 * * * *',
      command=>'select public.retry_location_ingestion_repairs(25);'
    );
  end if;

  select jobid into v_job from cron.job where jobname='kleenest-reporting-scheduler';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'0-59/15 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-capability-audit-hourly';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'33 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-preventive-work-materializer';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'58 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='storage-object-deletion';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'7-59/10 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-native-push-pending-recovery';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'8-59/10 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-storage-pressure-controller';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'1-59/10 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-restroom-remediation-sla';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'3-59/15 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-preventive-work-sla';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'0-59/15 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='osm-adaptive-concurrency';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'5-59/15 * * * *'); end if;

  select jobid into v_job from cron.job where jobname='kleenest-cron-history-retention';
  if v_job is not null then perform cron.alter_job(job_id=>v_job,schedule=>'28 * * * *'); end if;
end
$block$;
