create table if not exists public.capability_audit_runs (
  id bigint generated always as identity primary key,
  executed_at timestamptz not null default now(),
  executed_by uuid null,
  source text not null default 'scheduled',
  domain_count integer not null default 0,
  issue_count integer not null default 0,
  duplicate_domain_count integer not null default 0,
  uncovered_rpc_count integer not null default 0,
  report jsonb not null default '{}'::jsonb
);
create index if not exists capability_audit_runs_executed_at_idx on public.capability_audit_runs (executed_at desc);

create or replace function public._collect_raw_schema_capability_audit()
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare result jsonb;
begin
  with raw_tables as (select table_schema,table_name,table_type from information_schema.tables where table_schema='public'),
  raw_functions as (select p.oid,n.nspname schema_name,p.proname function_name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_function_result(p.oid) returns,p.prosecdef security_definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  raw_triggers as (select event_object_schema schema_name,event_object_table table_name,trigger_name,event_manipulation,action_timing,action_statement from information_schema.triggers where event_object_schema='public'),
  raw_policies as (select schemaname schema_name,tablename table_name,policyname,permissive,roles,cmd from pg_policies where schemaname='public'),
  contract_status as (select c.domain,c.canonical_capability,c.canonical_rpc,c.active,exists(select 1 from raw_functions f where f.function_name=c.canonical_rpc) rpc_exists from public.capability_domain_contracts c),
  duplicate_domains as (select domain,count(*) contract_count from public.capability_domain_contracts where active group by domain having count(*)>1),
  uncatalogued_rpc as (select f.function_name,f.arguments,f.security_definer from raw_functions f where not exists(select 1 from public.capability_domain_contracts c where c.active and c.canonical_rpc=f.function_name) and f.function_name not like '\_%' and f.function_name not in ('set_updated_at','touch_updated_at','set_location_geom','current_user_id','is_platform_owner'))
  select jsonb_build_object('generated_at',now(),'raw_schema_first',true,'tables',(select count(*) from raw_tables),'functions',(select count(*) from raw_functions),'triggers',(select count(*) from raw_triggers),'policies',(select count(*) from raw_policies),'active_domain_contracts',(select count(*) from public.capability_domain_contracts where active),'contract_violations',coalesce((select jsonb_agg(jsonb_build_object('domain',domain,'contract_count',contract_count)) from duplicate_domains),'[]'::jsonb),'missing_canonical_rpcs',coalesce((select jsonb_agg(to_jsonb(x)) from contract_status x where x.active and not x.rpc_exists),'[]'::jsonb),'uncatalogued_public_rpcs',coalesce((select jsonb_agg(to_jsonb(x) order by x.function_name) from uncatalogued_rpc x),'[]'::jsonb),'raw_tables',coalesce((select jsonb_agg(jsonb_build_object('schema',table_schema,'name',table_name,'type',table_type) order by table_name) from raw_tables),'[]'::jsonb),'raw_functions',coalesce((select jsonb_agg(jsonb_build_object('name',function_name,'arguments',arguments,'returns',returns,'security_definer',security_definer) order by function_name,arguments) from raw_functions),'[]'::jsonb)) into result;
  return result;
end;
$$;

create or replace function public.admin_raw_schema_capability_audit() returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$ begin if not public.is_platform_owner(auth.uid()) then raise exception 'platform owner access required'; end if; return public._collect_raw_schema_capability_audit(); end; $$;

create or replace function public.run_capability_audit(p_source text default 'manual') returns public.capability_audit_runs language plpgsql security definer set search_path=public,pg_catalog as $$
declare v jsonb; d jsonb; issues jsonb; uncatalogued jsonb; r public.capability_audit_runs; domain_count integer; issue_count integer;
begin
  if p_source <> 'scheduled' and not public.is_platform_owner(auth.uid()) then raise exception 'platform owner access required'; end if;
  v := public._collect_raw_schema_capability_audit();
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into d from public.check_single_capability_per_domain() x where x.issue <> 'ok';
  issues := coalesce(v->'contract_violations','[]'::jsonb) || coalesce(v->'missing_canonical_rpcs','[]'::jsonb) || d;
  uncatalogued := coalesce(v->'uncatalogued_public_rpcs','[]'::jsonb);
  select count(*) into domain_count from public.capability_domain_contracts where active;
  issue_count := jsonb_array_length(issues);
  insert into public.capability_audit_runs(executed_by,source,domain_count,issue_count,duplicate_domain_count,uncovered_rpc_count,report) values(auth.uid(),coalesce(nullif(p_source,''),'manual'),domain_count,issue_count,coalesce(jsonb_array_length(v->'contract_violations'),0),jsonb_array_length(uncatalogued),jsonb_build_object('raw_schema',v,'single_capability_issues',d)) returning * into r;
  return r;
end;
$$;

revoke all on public.capability_audit_runs from public;
grant select on public.capability_audit_runs to authenticated;
revoke all on function public._collect_raw_schema_capability_audit() from public;
revoke all on function public.run_capability_audit(text) from public;
grant execute on function public.run_capability_audit(text) to authenticated;
alter table public.capability_audit_runs enable row level security;
drop policy if exists capability_audit_runs_owner_select on public.capability_audit_runs;
create policy capability_audit_runs_owner_select on public.capability_audit_runs for select to authenticated using (public.is_platform_owner(auth.uid()));
select public.run_capability_audit('scheduled');
