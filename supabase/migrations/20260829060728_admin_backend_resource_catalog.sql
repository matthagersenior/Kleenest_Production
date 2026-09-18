create or replace function public.admin_backend_resource_catalog()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_platform_owner(auth.uid()) then raise exception 'admin authorization required'; end if;

  with table_resources as (
    select
      c.relname as resource,
      case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table' when 'v' then 'view' when 'm' then 'materialized_view' else c.relkind::text end as resource_type,
      true as exists,
      case when c.relkind in ('r','p') then greatest(0,coalesce(s.n_live_tup,0))::bigint else null end as estimated_rows,
      n.nspname as schema_name
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    left join pg_stat_all_tables s on s.relid=c.oid
    where n.nspname='public' and c.relkind in ('r','p','v','m')
  ), function_resources as (
    select
      p.proname as resource,
      'function' as resource_type,
      true as exists,
      null::bigint as estimated_rows,
      n.nspname as schema_name
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
  ), resources as (
    select * from table_resources
    union all
    select * from function_resources
  )
  select jsonb_build_object(
    'generated_at', now(),
    'source', 'live_public_schema_catalog',
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'resource', resource,
      'resource_type', resource_type,
      'exists', exists,
      'estimated_rows', estimated_rows,
      'schema', schema_name
    ) order by resource_type, resource), '[]'::jsonb)
  ) into v_result
  from resources;

  return v_result;
end;
$function$;

revoke all on function public.admin_backend_resource_catalog() from public;
grant execute on function public.admin_backend_resource_catalog() to authenticated;
