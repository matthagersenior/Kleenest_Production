create table if not exists public.capability_domain_contracts (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  canonical_capability text not null,
  canonical_rpc text not null,
  owner_surface text not null default 'platform',
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capability_domain_contracts_active_idx on public.capability_domain_contracts(active);

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
  select public.is_platform_owner() into is_owner;
  if not coalesce(is_owner, false) then
    raise exception 'platform owner access required';
  end if;

  with raw_tables as (
    select table_schema, table_name, table_type
    from information_schema.tables
    where table_schema = 'public'
  ), raw_functions as (
    select p.oid,
           n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as arguments,
           pg_get_function_result(p.oid) as returns,
           p.prosecdef as security_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ), raw_triggers as (
    select event_object_schema as schema_name,
           event_object_table as table_name,
           trigger_name,
           event_manipulation,
           action_timing,
           action_statement
    from information_schema.triggers
    where event_object_schema = 'public'
  ), raw_policies as (
    select schemaname as schema_name,
           tablename as table_name,
           policyname,
           permissive,
           roles,
           cmd
    from pg_policies
    where schemaname = 'public'
  ), contract_status as (
    select c.domain,
           c.canonical_capability,
           c.canonical_rpc,
           c.active,
           exists (
             select 1 from raw_functions f
             where f.function_name = c.canonical_rpc
           ) as rpc_exists
    from public.capability_domain_contracts c
  ), duplicate_domains as (
    select domain, count(*) as contract_count
    from public.capability_domain_contracts
    where active
    group by domain
    having count(*) > 1
  ), uncatalogued_rpc as (
    select f.function_name,
           f.arguments,
           f.security_definer
    from raw_functions f
    where not exists (
      select 1
      from public.capability_domain_contracts c
      where c.active and c.canonical_rpc = f.function_name
    )
      and f.function_name not like '\_%'
      and f.function_name not in ('set_updated_at','touch_updated_at','set_location_geom','current_user_id','is_platform_owner')
  )
  select jsonb_build_object(
    'generated_at', now(),
    'raw_schema_first', true,
    'tables', (select count(*) from raw_tables),
    'functions', (select count(*) from raw_functions),
    'triggers', (select count(*) from raw_triggers),
    'policies', (select count(*) from raw_policies),
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

revoke all on function public.admin_raw_schema_capability_audit() from public, anon, authenticated;
grant execute on function public.admin_raw_schema_capability_audit() to authenticated;

create or replace function public.check_single_capability_per_domain()
returns table(domain text, canonical_capability text, canonical_rpc text, issue text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select c.domain, c.canonical_capability, c.canonical_rpc,
         case
           when not c.active then 'inactive_contract'
           when not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc) then 'missing_canonical_rpc'
           else 'ok'
         end as issue
  from public.capability_domain_contracts c
  where c.active
  union all
  select c.domain, null, null, 'duplicate_domain_contract'
  from public.capability_domain_contracts c
  join (select domain from public.capability_domain_contracts where active group by domain having count(*) > 1) d using(domain)
  where c.active;
$$;

revoke all on function public.check_single_capability_per_domain() from public, anon, authenticated;
grant execute on function public.check_single_capability_per_domain() to authenticated;

insert into public.capability_domain_contracts (domain, canonical_capability, canonical_rpc, owner_surface, notes)
values
  ('location_discovery', 'Universal location discovery', 'prepare_universal_location_discovery', 'platform', 'Canonical map/results discovery boundary.'),
  ('bathroom_intelligence', 'Bathroom intelligence', 'compute_bathroom_intelligence', 'platform', 'Canonical bathroom intelligence computation boundary.'),
  ('consumer_checkins', 'Consumer check-in', 'kleenest_map_check_in', 'consumer', 'Canonical consumer location check-in boundary.'),
  ('consumer_reviews', 'Consumer review creation', 'create_review', 'consumer', 'Canonical review creation boundary.'),
  ('consumer_observations', 'Consumer restroom observation', 'submit_restroom_observation', 'consumer', 'Canonical restroom observation submission boundary.'),
  ('owner_admin_crud', 'Owner/Admin CRUD gateway', 'admin_crud_gateway', 'owner_admin', 'Canonical privileged CRUD debugging/admin boundary.')
on conflict (domain) do update set canonical_capability=excluded.canonical_capability, canonical_rpc=excluded.canonical_rpc, owner_surface=excluded.owner_surface, notes=excluded.notes, updated_at=now();
