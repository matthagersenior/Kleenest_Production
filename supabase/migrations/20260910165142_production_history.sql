update public.national_ingestion_markets
set status='paused', current_source=null, updated_at=now()
where market_key not like 'focus_corridor_%'
  and status in ('running','pending');

update public.national_ingestion_markets
set name='KC→Chicago Frontier — Springfield MO',
    priority=-14980,
    updated_at=now()
where market_key='focus_corridor_springfield_mo_branch';

insert into public.national_ingestion_markets(
  market_key,name,state_code,market_kind,priority,bbox,status,current_source,source_progress
)
values(
  'focus_corridor_st_louis_mo',
  'KC→Chicago Frontier — St. Louis MO',
  'MO',
  'state_fill',
  -14970,
  '[38.10,-91.60,39.20,-89.55]'::jsonb,
  'pending',
  'osm',
  '{"osm":{"completed":false,"tile_cursor":0,"grid_version":"corridor_0.24_frontier_v1","consecutive_failures":0}}'::jsonb
)
on conflict (market_key) do update set
  name=excluded.name,
  state_code=excluded.state_code,
  market_kind=excluded.market_kind,
  priority=excluded.priority,
  bbox=excluded.bbox,
  status=case when public.national_ingestion_markets.status='completed' then 'completed' else 'pending' end,
  updated_at=now();

update public.national_ingestion_markets set priority=-15000,updated_at=now() where market_key='focus_corridor_kansas_city';
update public.national_ingestion_markets set priority=-14990,updated_at=now() where market_key='focus_corridor_columbia_mo';
update public.national_ingestion_markets set priority=-14980,updated_at=now() where market_key='focus_corridor_springfield_mo_branch';
update public.national_ingestion_markets set priority=-14970,updated_at=now() where market_key='focus_corridor_st_louis_mo';
update public.national_ingestion_markets set priority=-14960,updated_at=now() where market_key='focus_corridor_springfield_il';
update public.national_ingestion_markets set priority=-14950,updated_at=now() where market_key='focus_corridor_bloomington_il';
update public.national_ingestion_markets set priority=-14940,updated_at=now() where market_key='focus_corridor_chicago';

create or replace function public.run_corridor_ingestion_scheduler()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='kleenest_maps_scheduler'
  limit 1;

  if v_secret is null then
    raise exception 'Kleenest scheduler secret is unavailable';
  end if;

  select net.http_post(
    url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/focus-ingestion-orchestrator',
    headers := jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',v_secret),
    body := jsonb_build_object('action','cycle','scope','kc_to_chicago_corridor'),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$function$;

create or replace function public.run_national_ingestion_scheduler()
returns bigint
language sql
security definer
set search_path to ''
as $function$
  select public.run_corridor_ingestion_scheduler();
$function$;

select cron.unschedule('kleenest-national-ingestion') where exists (select 1 from cron.job where jobname='kleenest-national-ingestion');
select cron.schedule('kleenest-corridor-ingestion','*/5 * * * *','select public.run_corridor_ingestion_scheduler();');
