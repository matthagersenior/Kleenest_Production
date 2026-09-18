create or replace function public.admin_raw_schema_capability_audit()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  result jsonb;
  is_owner boolean;
begin
  select public.is_platform_owner(auth.uid()) into is_owner;
  if not coalesce(is_owner, false) then
    raise exception 'platform owner access required';
  end if;

  with raw_tables as (
    select table_schema, table_name, table_type
    from information_schema.tables
    where table_schema = 'public'
  ), raw_functions as (
    select p.oid, n.nspname as schema_name, p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as arguments,
           pg_get_function_result(p.oid) as returns,
           p.prosecdef as security_definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ), raw_triggers as (
    select event_object_schema as schema_name, event_object_table as table_name,
           trigger_name, event_manipulation, action_timing, action_statement
    from information_schema.triggers where event_object_schema = 'public'
  ), raw_policies as (
    select schemaname as schema_name, tablename as table_name, policyname,
           permissive, roles, cmd from pg_policies where schemaname = 'public'
  ), contract_status as (
    select c.domain, c.canonical_capability, c.canonical_rpc, c.active,
           exists (select 1 from raw_functions f where f.function_name = c.canonical_rpc) as rpc_exists
    from public.capability_domain_contracts c
  ), duplicate_domains as (
    select domain, count(*) as contract_count
    from public.capability_domain_contracts where active group by domain having count(*) > 1
  ), uncatalogued_rpc as (
    select f.function_name, f.arguments, f.security_definer
    from raw_functions f
    where not exists (select 1 from public.capability_domain_contracts c where c.active and c.canonical_rpc = f.function_name)
      and f.function_name not like '\_%'
      and f.function_name not in ('set_updated_at','touch_updated_at','set_location_geom','current_user_id','is_platform_owner')
  )
  select jsonb_build_object(
    'generated_at', now(), 'raw_schema_first', true,
    'tables', (select count(*) from raw_tables), 'functions', (select count(*) from raw_functions),
    'triggers', (select count(*) from raw_triggers), 'policies', (select count(*) from raw_policies),
    'active_domain_contracts', (select count(*) from public.capability_domain_contracts where active),
    'contract_violations', coalesce((select jsonb_agg(jsonb_build_object('domain', domain, 'contract_count', contract_count)) from duplicate_domains), '[]'::jsonb),
    'missing_canonical_rpcs', coalesce((select jsonb_agg(to_jsonb(x)) from contract_status x where x.active and not x.rpc_exists), '[]'::jsonb),
    'uncatalogued_public_rpcs', coalesce((select jsonb_agg(to_jsonb(x) order by x.function_name) from uncatalogued_rpc x), '[]'::jsonb),
    'raw_tables', coalesce((select jsonb_agg(jsonb_build_object('schema', table_schema, 'name', table_name, 'type', table_type) order by table_name) from raw_tables), '[]'::jsonb),
    'raw_functions', coalesce((select jsonb_agg(jsonb_build_object('name', function_name, 'arguments', arguments, 'returns', returns, 'security_definer', security_definer) order by function_name, arguments) from raw_functions), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
