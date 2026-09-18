create or replace function public.capability_retirement_audit(p_limit integer default 200)
returns table(function_signature text, domain text, classification text, db_dependency_count bigint, db_dependents text[], retirement_state text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  return query
  with classified as (
    select p.oid, p.oid::regprocedure::text as signature, c.domain, c.classification
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    join public.capability_function_classifications c on c.function_signature=p.oid::regprocedure::text
    where n.nspname='public' and p.prokind='f'
  ), compat as (
    select c.* from classified c where c.classification in ('compatibility','legacy')
  ), dep as (
    select c.oid,
           count(distinct d.classid::text||':'||d.objid::text||':'||d.objsubid::text) filter (where d.objid<>c.oid) as dep_count,
           array_remove(array_agg(distinct pg_catalog.pg_describe_object(d.classid,d.objid,d.objsubid)) filter (where d.objid<>c.oid),null) as dependents
    from compat c
    left join pg_catalog.pg_depend d on d.refclassid='pg_proc'::regclass and d.refobjid=c.oid and d.deptype in ('n','a')
    group by c.oid
  )
  select c.signature,c.domain,c.classification,
         coalesce(d.dep_count,0),coalesce(d.dependents,array[]::text[]),
         case when coalesce(d.dep_count,0)>0 then 'blocked_db_dependency' else 'candidate_pending_app_caller_audit' end
  from compat c
  left join dep d on d.oid=c.oid
  order by case when coalesce(d.dep_count,0)>0 then 0 else 1 end,c.domain,c.signature
  limit greatest(1,least(coalesce(p_limit,200),1000));
end;
$function$;

create or replace function public.admin_list_activity_events_window(
  p_limit integer default 100,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns setof public.activity_events
language sql
stable
security definer
set search_path to ''
as $function$
  select e.*
  from public.activity_events e
  where public.is_platform_owner()
    and (p_from is null or e.created_at >= p_from)
    and (p_to is null or e.created_at <= p_to)
  order by e.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$function$;

revoke all on function public.admin_list_activity_events_window(integer,timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_list_activity_events_window(integer,timestamptz,timestamptz) to authenticated, service_role;

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
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then
    raise exception 'Platform owner access required';
  end if;
  v_status:=public.admin_national_ingestion_status();
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

revoke all on function public.owner_ingestion_control_snapshot(integer) from public, anon;
grant execute on function public.owner_ingestion_control_snapshot(integer) to authenticated, service_role;
