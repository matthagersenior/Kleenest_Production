create or replace function public.admin_list_activity_events(
  p_limit integer,
  p_from timestamptz,
  p_to timestamptz
)
returns setof public.activity_events
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.admin_list_activity_events_window(p_limit,p_from,p_to);
$function$;
revoke all on function public.admin_list_activity_events(integer,timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_list_activity_events(integer,timestamptz,timestamptz) to authenticated, service_role;

create or replace function public.owner_ingestion_control_snapshot(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);
  v_status jsonb;
  v_marked_running integer:=0;
  v_live_runs integer:=0;
  v_stale_markets integer:=0;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then
    raise exception 'Platform owner access required';
  end if;
  v_status:=public.admin_national_ingestion_status();
  v_marked_running:=coalesce((v_status->'markets'->>'running')::integer,0);
  select count(*)::integer into v_live_runs
  from public.national_ingestion_runs r
  where r.status='running' and r.started_at>=now()-interval '30 minutes';
  select count(*)::integer into v_stale_markets
  from public.national_ingestion_markets m
  where m.status='running' and coalesce(m.updated_at,m.last_run_at,'epoch'::timestamptz)<now()-interval '30 minutes';
  v_status:=jsonb_set(v_status,'{markets,marked_running}',to_jsonb(v_marked_running),true);
  v_status:=jsonb_set(v_status,'{markets,stale_running}',to_jsonb(v_stale_markets),true);
  v_status:=jsonb_set(v_status,'{markets,running}',to_jsonb(v_live_runs),true);
  return jsonb_build_object(
    'status',v_status,
    'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.priority) from public.national_ingestion_source_policies s),'[]'::jsonb),
    'markets',coalesce((select jsonb_agg(to_jsonb(m) order by m.priority,m.population_rank nulls last) from (select * from public.national_ingestion_markets order by priority,population_rank nulls last limit v_limit) m),'[]'::jsonb),
    'storage_guard',coalesce(v_status->'storage_guard','{}'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from public.platform_owner_control_audit where domain='ingestion' order by created_at desc limit v_limit) a),'[]'::jsonb),
    'generated_at',now()
  );
end;
$function$;
