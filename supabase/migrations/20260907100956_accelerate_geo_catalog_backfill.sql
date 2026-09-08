create or replace function public.run_geo_catalog_exporter()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_id bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='kleenest_maps_scheduler' limit 1;
  if v_secret is null then raise exception 'scheduler secret missing'; end if;
  select net.http_post(
    url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/geo-catalog-exporter',
    headers := jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',v_secret),
    body := jsonb_build_object('batches',20,'limit',1000),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end;
$$;
