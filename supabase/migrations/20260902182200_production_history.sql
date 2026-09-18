create or replace function public.repair_stalled_national_ingestion_cells()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  sub jsonb;
  cells jsonb;
  current_cell jsonb;
  new_cells jsonb;
  idx integer;
  lvl integer;
  i integer;
  s numeric; w numeric; n numeric; e numeric; my numeric; mx numeric;
  repaired integer := 0;
begin
  for r in
    select id, source_progress
    from public.national_ingestion_markets
    where status = 'running'
      and coalesce((source_progress->'osm'->>'consecutive_failures')::integer,0) >= 2
      and source_progress->'osm'->'subdivision' is not null
  loop
    sub := r.source_progress->'osm'->'subdivision';
    idx := coalesce((sub->>'index')::integer,0);
    lvl := coalesce((sub->>'level')::integer,1);
    cells := sub->'cells';
    if lvl >= 4 or jsonb_typeof(cells) <> 'array' or idx < 0 or idx >= jsonb_array_length(cells) then
      continue;
    end if;
    current_cell := cells->idx;
    if jsonb_typeof(current_cell) <> 'array' or jsonb_array_length(current_cell) <> 4 then
      continue;
    end if;
    s := (current_cell->>0)::numeric; w := (current_cell->>1)::numeric;
    n := (current_cell->>2)::numeric; e := (current_cell->>3)::numeric;
    my := (s+n)/2; mx := (w+e)/2;
    new_cells := '[]'::jsonb;
    if idx > 0 then
      for i in 0..idx-1 loop new_cells := new_cells || jsonb_build_array(cells->i); end loop;
    end if;
    new_cells := new_cells || jsonb_build_array(
      jsonb_build_array(s,w,my,mx),
      jsonb_build_array(s,mx,my,e),
      jsonb_build_array(my,w,n,mx),
      jsonb_build_array(my,mx,n,e)
    );
    if idx + 1 < jsonb_array_length(cells) then
      for i in idx+1..jsonb_array_length(cells)-1 loop new_cells := new_cells || jsonb_build_array(cells->i); end loop;
    end if;
    sub := jsonb_set(sub,'{cells}',new_cells,true);
    sub := jsonb_set(sub,'{level}',to_jsonb(lvl+1),true);
    update public.national_ingestion_markets
      set source_progress = jsonb_set(source_progress,'{osm,subdivision}',sub,true),
          updated_at = now()
      where id = r.id;
    repaired := repaired + 1;
  end loop;
  return repaired;
end;
$$;

create or replace function public.run_national_ingestion_scheduler()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  perform public.repair_stalled_national_ingestion_cells();
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='kleenest_maps_scheduler' limit 1;
  if v_secret is null then raise exception 'Kleenest scheduler secret is unavailable'; end if;
  select net.http_post(
    url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/national-ingestion-orchestrator',
    headers := jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',v_secret),
    body := jsonb_build_object('action','cycle'),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.repair_stalled_national_ingestion_cells() from public, anon, authenticated;
revoke all on function public.run_national_ingestion_scheduler() from public, anon, authenticated;
grant execute on function public.repair_stalled_national_ingestion_cells() to postgres, service_role;
grant execute on function public.run_national_ingestion_scheduler() to postgres, service_role;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='kleenest-national-ingestion' limit 1),
  command := 'select public.run_national_ingestion_scheduler();'
);
