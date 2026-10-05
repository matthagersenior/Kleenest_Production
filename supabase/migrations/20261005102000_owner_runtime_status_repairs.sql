-- Repair the owner Email Center PostgREST boundary and align ingestion controls with active background workers.
-- Runtime repair was applied first; this migration keeps production/main authoritative.

create or replace function public.owner_email_center_provider_config()
returns jsonb
language sql
security definer
set search_path=''
as $$
  select internal.owner_email_center_provider_config();
$$;

revoke all on function public.owner_email_center_provider_config() from public, anon, authenticated;
grant execute on function public.owner_email_center_provider_config() to service_role;

create or replace function public.owner_email_center_status_snapshot(p_owner_user_id uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select internal.owner_email_center_status_snapshot(p_owner_user_id);
$$;

revoke all on function public.owner_email_center_status_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.owner_email_center_status_snapshot(uuid) to service_role;

create or replace function public.owner_run_ingestion_cycle(p_reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_request_id bigint;
  v_capacity jsonb;
  v_result jsonb;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then
    raise exception 'Platform owner access required';
  end if;
  v_capacity:=public.acquisition_capacity_status();
  v_request_id:=public.run_corridor_open_data_scheduler();
  v_result:=jsonb_build_object(
    'status',case when coalesce(v_request_id,0)=0 then 'deferred_by_capacity_guard' else 'queued' end,
    'request_id',coalesce(v_request_id,0),
    'capacity',v_capacity,
    'requested_at',now()
  );
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,new_state,reason)
  values(v_uid,'ingestion','run_cycle','current_background',v_result,p_reason);
  return v_result;
end;
$function$;

create or replace function public.owner_ingestion_control_snapshot(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);
  v_status jsonb;
  v_marked_running integer:=0;
  v_live_runs integer:=0;
  v_stale_markets integer:=0;
  v_capacity jsonb;
  v_background jsonb;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then
    raise exception 'Platform owner access required';
  end if;
  v_status:=public.admin_national_ingestion_status();
  v_capacity:=public.acquisition_capacity_status();
  v_marked_running:=coalesce((v_status->'markets'->>'running')::integer,0);
  select count(*)::integer into v_live_runs
  from public.national_ingestion_runs r
  where r.status='running' and r.started_at>=now()-interval '30 minutes';
  select count(*)::integer into v_stale_markets
  from public.national_ingestion_markets m
  where m.status='running'
    and coalesce(m.updated_at,m.last_run_at,'epoch'::timestamptz)<now()-interval '30 minutes';
  v_status:=jsonb_set(v_status,'{markets,marked_running}',to_jsonb(v_marked_running),true);
  v_status:=jsonb_set(v_status,'{markets,stale_running}',to_jsonb(v_stale_markets),true);
  v_status:=jsonb_set(v_status,'{markets,running}',to_jsonb(v_live_runs),true);
  select jsonb_build_object(
    'enabled_sources',count(*) filter(where a.enabled),
    'due_sources',count(*) filter(where a.enabled and a.next_run_at<=now()),
    'last_run_at',max(a.last_run_at),
    'last_success_at',max(a.last_success_at),
    'sources',coalesce(jsonb_agg(to_jsonb(a) order by a.source_key),'[]'::jsonb)
  )
  into v_background
  from public.external_ingestion_adapters a;
  return jsonb_build_object(
    'status',v_status,
    'capacity',coalesce(v_capacity,'{}'::jsonb),
    'background',coalesce(v_background,'{}'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.priority) from public.national_ingestion_source_policies s),'[]'::jsonb),
    'markets',coalesce((select jsonb_agg(to_jsonb(m) order by m.priority,m.population_rank nulls last) from (select * from public.national_ingestion_markets order by priority,population_rank nulls last limit v_limit) m),'[]'::jsonb),
    'storage_guard',coalesce(v_status->'storage_guard','{}'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from public.platform_owner_control_audit where domain='ingestion' order by created_at desc limit v_limit) a),'[]'::jsonb),
    'generated_at',now()
  );
end;
$function$;
