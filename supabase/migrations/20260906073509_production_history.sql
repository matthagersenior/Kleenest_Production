create or replace function public.run_national_ingestion_scheduler()
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
    body := jsonb_build_object('action','cycle'),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$function$;
