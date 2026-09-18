create or replace function public.run_corridor_open_data_scheduler()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret text;
  v_def text;
  v_base text;
  v_request_id bigint;
begin
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

  v_base := (regexp_match(v_def, '(https://[^'']+\.supabase\.co)/functions/v1/focus-ingestion-orchestrator'))[1];
  if v_base is null then raise exception 'Supabase function base URL could not be derived'; end if;

  select net.http_post(
    url := v_base || '/functions/v1/corridor-open-data-ingestor',
    headers := jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',v_secret),
    body := jsonb_build_object('action','cycle','scope','kc_to_chicago_corridor'),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.run_corridor_open_data_scheduler() from public;
grant execute on function public.run_corridor_open_data_scheduler() to postgres,service_role;

do $$
begin
  if exists(select 1 from cron.job where jobname='kleenest-corridor-open-data-ingestion') then
    perform cron.unschedule('kleenest-corridor-open-data-ingestion');
  end if;
  perform cron.schedule('kleenest-corridor-open-data-ingestion','*/10 * * * *','select public.run_corridor_open_data_scheduler();');
end $$;
