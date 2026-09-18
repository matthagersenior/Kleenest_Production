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
           notes=coalesce(notes,'') || format(E'\nAdaptive concurrency %s at %s: disk=%.4s failure=%.3s yield=%.2s/request.',v_target,now(),v_disk,v_failure_rate,v_yield)
     where source_key='osm';
  end if;

  return jsonb_build_object('requests',v_requests,'imports',v_imports,'runs',v_runs,'failure_rate',v_failure_rate,'yield_per_request',v_yield,'disk_observed_fraction',v_disk,'previous',v_current,'target',v_target);
end;
$function$;

create or replace function public.strip_cold_location_metadata()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.source_metadata is not null then
    new.source_metadata := new.source_metadata - 'captured_at' - 'source_dataset';
  end if;
  return new;
end
$function$;

create or replace function public.cold_external_location_archive_batch(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  payload jsonb;
  v_disk numeric := 0;
  v_age interval := interval '48 hours';
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then raise exception 'service_role required'; end if;
  begin
    v_disk := coalesce((public.national_ingestion_storage_status()->>'disk_observed_fraction')::numeric,0);
  exception when others then
    v_disk := 0;
  end;
  if v_disk >= 0.86 then v_age := interval '12 hours';
  elsif v_disk >= 0.82 then v_age := interval '24 hours';
  end if;

  with q as materialized (
    select e.*
    from public.external_location_records e
    where e.last_seen_at < now()-v_age
      and not exists (select 1 from public.external_observations o where o.external_record_id=e.id)
      and not exists (select 1 from public.external_location_evidence x where x.external_record_id=e.id)
    order by e.last_seen_at,e.id
    limit greatest(1,least(p_limit,1000))
  )
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into payload from q;
  return jsonb_build_object('rows',payload,'count',jsonb_array_length(payload),'retention_hours',extract(epoch from v_age)/3600,'disk_observed_fraction',v_disk);
end
$function$;

create or replace function public.cold_external_location_archive_ack(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
  v_disk numeric := 0;
  v_age interval := interval '48 hours';
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then raise exception 'service_role required'; end if;
  begin
    v_disk := coalesce((public.national_ingestion_storage_status()->>'disk_observed_fraction')::numeric,0);
  exception when others then
    v_disk := 0;
  end;
  if v_disk >= 0.86 then v_age := interval '12 hours';
  elsif v_disk >= 0.82 then v_age := interval '24 hours';
  end if;

  delete from public.external_location_records e
  where e.id=any(p_ids)
    and e.last_seen_at < now()-v_age
    and not exists (select 1 from public.external_observations o where o.external_record_id=e.id)
    and not exists (select 1 from public.external_location_evidence x where x.external_record_id=e.id);
  get diagnostics v_count=row_count;
  return v_count;
end
$function$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname='cold-provenance-offload';
exception when others then null;
end$$;

select cron.schedule('cold-provenance-offload','*/5 * * * *','select public.run_cold_provenance_offloader();');
