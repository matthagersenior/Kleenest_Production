create or replace function public.tune_osm_ingestion_concurrency()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_requests numeric := 0;
  v_imports numeric := 0;
  v_failures numeric := 0;
  v_runs numeric := 0;
  v_failure_rate numeric := 0;
  v_yield numeric := 0;
  v_current integer;
  v_target integer;
  v_storage jsonb;
  v_disk numeric := 0;
begin
  select coalesce(sum(requests_used),0), coalesce(sum(records_imported),0),
         count(*) filter (where status='failed'), count(*)
    into v_requests,v_imports,v_failures,v_runs
  from public.national_ingestion_runs
  where source_key='osm' and started_at >= now() - interval '1 hour';

  v_failure_rate := case when v_runs > 0 then v_failures/v_runs else 0 end;
  v_yield := case when v_requests > 0 then v_imports/v_requests else 0 end;
  v_storage := public.national_ingestion_storage_status();
  v_disk := coalesce((v_storage->>'disk_observed_fraction')::numeric,0);

  select max_requests_per_cycle into v_current
  from public.national_ingestion_source_policies where source_key='osm' for update;
  v_target := coalesce(v_current,2);

  if v_disk >= 0.87 then
    v_target := 1;
  elsif v_runs >= 4 and (v_failure_rate >= 0.15 or (v_requests >= 4 and v_yield < 25)) then
    v_target := 1;
  elsif v_disk < 0.82 and v_runs >= 6 and v_failure_rate < 0.10 and v_yield > 40 then
    v_target := 2;
  end if;

  if v_target is distinct from v_current then
    update public.national_ingestion_source_policies
       set max_requests_per_cycle=v_target,
           updated_at=now(),
           notes=coalesce(notes,'') || format(E'\nAdaptive concurrency %s at %s: disk=%s failure=%s yield=%s/request.',v_target,now(),round(v_disk,4),round(v_failure_rate,3),round(v_yield,2))
     where source_key='osm';
  end if;

  return jsonb_build_object('requests',v_requests,'imports',v_imports,'runs',v_runs,'failure_rate',v_failure_rate,'yield_per_request',v_yield,'disk_observed_fraction',v_disk,'previous',v_current,'target',v_target);
end;
$function$;
