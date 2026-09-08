create or replace function public.tune_osm_ingestion_concurrency()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_requests numeric := 0;
  v_imports numeric := 0;
  v_failures numeric := 0;
  v_runs numeric := 0;
  v_failure_rate numeric := 0;
  v_yield numeric := 0;
  v_current integer;
  v_target integer;
begin
  select coalesce(sum(requests_used),0), coalesce(sum(records_imported),0),
         count(*) filter (where status='failed'), count(*)
    into v_requests,v_imports,v_failures,v_runs
  from public.national_ingestion_runs
  where source_key='osm' and started_at >= now() - interval '1 hour';
  v_failure_rate := case when v_runs > 0 then v_failures/v_runs else 0 end;
  v_yield := case when v_requests > 0 then v_imports/v_requests else 0 end;
  select max_requests_per_cycle into v_current
  from public.national_ingestion_source_policies where source_key='osm' for update;
  v_target := coalesce(v_current,2);
  if v_runs >= 4 and (v_failure_rate >= 0.15 or (v_requests >= 4 and v_yield < 25)) then
    v_target := 1;
  elsif v_runs >= 6 and v_failure_rate < 0.10 and v_yield > 40 then
    v_target := 2;
  end if;
  if v_target is distinct from v_current then
    update public.national_ingestion_source_policies
       set max_requests_per_cycle=v_target, updated_at=now(),
           notes=coalesce(notes,'') || format(E'\nAdaptive concurrency %s at %s: 1h failure=%.3s yield=%.2s/request.',v_target,now(),v_failure_rate,v_yield)
     where source_key='osm';
  end if;
  return jsonb_build_object('requests',v_requests,'imports',v_imports,'runs',v_runs,'failure_rate',v_failure_rate,'yield_per_request',v_yield,'previous',v_current,'target',v_target);
end;
$$;
revoke all on function public.tune_osm_ingestion_concurrency() from public, anon, authenticated;
grant execute on function public.tune_osm_ingestion_concurrency() to service_role;

create or replace function public.run_cold_provenance_offloader()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare v_secret text; v_id bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='kleenest_maps_scheduler' limit 1;
  if v_secret is null then raise exception 'scheduler secret missing'; end if;
  select net.http_post(
    url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/cold-provenance-offloader',
    headers := jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',v_secret),
    body := jsonb_build_object('batches',10,'limit',1000),
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end;
$$;
revoke all on function public.run_cold_provenance_offloader() from public, anon, authenticated;
grant execute on function public.run_cold_provenance_offloader() to service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('osm-adaptive-concurrency','cold-provenance-offload');
select cron.schedule('osm-adaptive-concurrency','*/5 * * * *','select public.tune_osm_ingestion_concurrency();');
select cron.schedule('cold-provenance-offload','*/30 * * * *','select public.run_cold_provenance_offloader();');
select cron.alter_job(16, command := 'select case when ((public.national_ingestion_storage_status()->>''disk_observed_fraction'')::numeric >= 0.85) then public.compact_kleenest_storage() else jsonb_build_object(''skipped'',true,''reason'',''disk_below_85_percent'') end;');

update public.national_ingestion_source_policies set max_requests_per_cycle=1, updated_at=now() where source_key='osm';
