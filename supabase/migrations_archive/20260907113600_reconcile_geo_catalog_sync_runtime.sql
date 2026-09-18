-- Reconcile the source-controlled schema with the live Production -> Kleenest_Data
-- compact geo catalog synchronization runtime.

create table if not exists public.geo_catalog_export_state (
  singleton boolean primary key default true check (singleton),
  last_updated_at timestamptz not null default '1970-01-01 00:00:00+00'::timestamptz,
  last_id uuid,
  rows_exported bigint not null default 0,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  backfill_complete boolean not null default false
);

alter table public.geo_catalog_export_state
  add column if not exists backfill_complete boolean not null default false;

insert into public.geo_catalog_export_state(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.geo_catalog_export_state enable row level security;
revoke all on public.geo_catalog_export_state from public, anon, authenticated;
grant select, insert, update, delete on public.geo_catalog_export_state to service_role;

create or replace function public.get_internal_geo_archive_secret()
returns text
language sql
security definer
set search_path to ''
as $function$
  select decrypted_secret from vault.decrypted_secrets where name='kleenest_geo_archive' limit 1
$function$;

revoke all on function public.get_internal_geo_archive_secret() from public, anon, authenticated;
grant execute on function public.get_internal_geo_archive_secret() to service_role;

create or replace function public.geo_catalog_export_batch(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s public.geo_catalog_export_state%rowtype;
  payload jsonb;
  wm_id uuid;
  wm_ts timestamptz;
begin
  select * into s from public.geo_catalog_export_state where singleton=true;
  if not s.backfill_complete then
    with q as materialized (
      select l.id,l.name,l.address,l.city,l.state,l.postal_code,l.country,l.latitude,l.longitude,l.place_type,
             l.phone,l.website,l.source,l.source_dataset,l.source_external_id,l.source_metadata,
             null::timestamptz as source_updated_at,l.created_at as first_seen_at,l.updated_at as last_seen_at,l.updated_at
      from public.locations l
      where l.latitude is not null and l.longitude is not null
        and (s.last_id is null or l.id > s.last_id)
      order by l.id
      limit greatest(1,least(p_limit,2000))
    )
    select coalesce((select jsonb_agg(to_jsonb(q)) from q),'[]'::jsonb),
           (select id from q order by id desc limit 1)
      into payload,wm_id;
    return jsonb_build_object('mode','backfill','rows',payload,'watermark_id',wm_id,'watermark_updated_at',null);
  else
    with q as materialized (
      select l.id,l.name,l.address,l.city,l.state,l.postal_code,l.country,l.latitude,l.longitude,l.place_type,
             l.phone,l.website,l.source,l.source_dataset,l.source_external_id,l.source_metadata,
             null::timestamptz as source_updated_at,l.created_at as first_seen_at,l.updated_at as last_seen_at,l.updated_at
      from public.locations l
      where l.latitude is not null and l.longitude is not null
        and (l.updated_at > s.last_updated_at or (l.updated_at = s.last_updated_at and (s.last_id is null or l.id > s.last_id)))
      order by l.updated_at,l.id
      limit greatest(1,least(p_limit,2000))
    )
    select coalesce((select jsonb_agg(to_jsonb(q)) from q),'[]'::jsonb),
           (select id from q order by updated_at desc,id desc limit 1),
           (select updated_at from q order by updated_at desc,id desc limit 1)
      into payload,wm_id,wm_ts;
    return jsonb_build_object('mode','incremental','rows',payload,'watermark_id',wm_id,'watermark_updated_at',wm_ts);
  end if;
end;
$function$;

create or replace function public.geo_catalog_export_ack(
  p_mode text,
  p_watermark_id uuid,
  p_watermark_updated_at timestamptz,
  p_rows integer
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_mode='backfill' then
    if p_rows=0 then
      update public.geo_catalog_export_state
      set backfill_complete=true,last_id=null,last_updated_at=now(),last_success_at=now(),last_error=null,updated_at=now()
      where singleton=true;
    else
      update public.geo_catalog_export_state
      set last_id=p_watermark_id,rows_exported=rows_exported+p_rows,last_success_at=now(),last_error=null,updated_at=now()
      where singleton=true;
    end if;
  else
    if p_rows>0 then
      update public.geo_catalog_export_state
      set last_id=p_watermark_id,last_updated_at=p_watermark_updated_at,rows_exported=rows_exported+p_rows,last_success_at=now(),last_error=null,updated_at=now()
      where singleton=true;
    else
      update public.geo_catalog_export_state
      set last_success_at=now(),last_error=null,updated_at=now()
      where singleton=true;
    end if;
  end if;
end;
$function$;

revoke all on function public.geo_catalog_export_batch(integer) from public, anon, authenticated;
revoke all on function public.geo_catalog_export_ack(text,uuid,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.geo_catalog_export_batch(integer) to service_role;
grant execute on function public.geo_catalog_export_ack(text,uuid,timestamptz,integer) to service_role;

create or replace function public.run_geo_catalog_exporter()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_secret text;
  v_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='kleenest_maps_scheduler'
  limit 1;
  if v_secret is null then raise exception 'scheduler secret missing'; end if;
  select net.http_post(
    url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/geo-catalog-exporter',
    headers := jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',v_secret),
    body := jsonb_build_object('batches',20,'limit',1000),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end;
$function$;

revoke all on function public.run_geo_catalog_exporter() from public, anon, authenticated;
grant execute on function public.run_geo_catalog_exporter() to service_role;

do $do$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in ('geo-catalog-export', 'geo_catalog_export_sync')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule('geo-catalog-export','* * * * *','select public.run_geo_catalog_exporter();');
end;
$do$;
