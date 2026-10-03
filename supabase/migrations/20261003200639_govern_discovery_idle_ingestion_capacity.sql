create or replace function public.acquisition_capacity_status()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_last_discovery timestamptz;
  v_discovery_15m integer;
  v_active integer;
  v_long_running integer;
  v_storage_paused boolean;
  v_storage_reason text;
  v_hydration integer;
  v_repair integer;
  v_allow boolean;
  v_reason text;
begin
  select max(created_at),
         count(*) filter(where created_at>now()-interval '15 minutes')
    into v_last_discovery,v_discovery_15m
  from public.location_discovery_events;

  select count(*) filter(where state='active' and pid<>pg_backend_pid()),
         count(*) filter(where state='active' and pid<>pg_backend_pid()
                          and query_start<now()-interval '30 seconds')
    into v_active,v_long_running
  from pg_catalog.pg_stat_activity
  where datname=current_database();

  select paused,pause_reason
    into v_storage_paused,v_storage_reason
  from public.national_ingestion_storage_guard
  where singleton=true;

  select count(*) into v_hydration from public.place_discovery_hydration_queue;
  select count(*) into v_repair from public.location_ingestion_repair_queue;

  v_allow:=coalesce(v_discovery_15m,0)=0
           and not coalesce(v_storage_paused,false)
           and coalesce(v_active,0)<=3
           and coalesce(v_long_running,0)=0
           and coalesce(v_hydration,0)<100;

  v_reason:=case
    when coalesce(v_storage_paused,false) then 'storage_guard'
    when coalesce(v_discovery_15m,0)>0 then 'active_discovery'
    when coalesce(v_long_running,0)>0 then 'long_running_query'
    when coalesce(v_active,0)>3 then 'production_busy'
    when coalesce(v_hydration,0)>=100 then 'hydration_backlog'
    else 'spare_capacity'
  end;

  return jsonb_build_object(
    'allow_background_ingestion',v_allow,
    'reason',v_reason,
    'checked_at',now(),
    'last_discovery_at',v_last_discovery,
    'discovery_events_15m',coalesce(v_discovery_15m,0),
    'active_queries',coalesce(v_active,0),
    'long_running_queries',coalesce(v_long_running,0),
    'hydration_queue',coalesce(v_hydration,0),
    'repair_queue',coalesce(v_repair,0),
    'storage_paused',coalesce(v_storage_paused,false),
    'storage_reason',v_storage_reason
  );
end
$$;

revoke all on function public.acquisition_capacity_status() from public,anon,authenticated;
grant execute on function public.acquisition_capacity_status() to service_role;

create or replace function public.run_corridor_open_data_scheduler()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_secret text;
  v_def text;
  v_base text;
  v_request_id bigint;
  v_capacity jsonb;
begin
  v_capacity:=public.acquisition_capacity_status();
  if not coalesce((v_capacity->>'allow_background_ingestion')::boolean,false) then
    return 0;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='kleenest_maps_scheduler'
  limit 1;
  if v_secret is null then raise exception 'Kleenest scheduler secret is unavailable'; end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='run_corridor_ingestion_scheduler'
  order by p.oid desc limit 1;
  if v_def is null then raise exception 'Corridor scheduler function is unavailable'; end if;

  v_base:=(regexp_match(v_def,'(https://[^'']+\\.supabase\\.co)/functions/v1/focus-ingestion-orchestrator'))[1];
  if v_base is null then raise exception 'Supabase function base URL could not be derived'; end if;

  select net.http_post(
    url:=v_base||'/functions/v1/corridor-open-data-ingestor',
    headers:=jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',v_secret),
    body:=jsonb_build_object('action','cycle','scope','kc_to_chicago_corridor','capacity_mode','discovery_idle'),
    timeout_milliseconds:=120000
  ) into v_request_id;
  return v_request_id;
end
$$;

select cron.alter_job(job_id:=24,schedule:='7-59/10 * * * *');
