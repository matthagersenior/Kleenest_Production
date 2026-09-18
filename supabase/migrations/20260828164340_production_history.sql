create or replace function public.admin_operational_capability_catalog() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if not public.is_platform_owner(auth.uid()) then raise exception 'admin authorization required'; end if;
 with contracts as (
   select c.domain,c.canonical_capability,c.canonical_rpc,c.owner_surface,
          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc) rpc_exists,
          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc and has_function_privilege('authenticated',p.oid,'EXECUTE')) auth_execute,
          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc and has_function_privilege('anon',p.oid,'EXECUTE')) anon_execute
   from public.capability_domain_contracts c where c.active
 ), statuses as (
   select *,case when not rpc_exists then 'missing_rpc' when not auth_execute or anon_execute then 'authorization_gap' else 'unverified' end status from contracts
 ), feature_stats as (
   select count(*) total,count(*) filter(where enabled) enabled from public.feature_catalog
 ), impl_stats as (
   select count(*) total,count(*) filter(where classification='canonical') canonical,count(*) filter(where classification='supporting') supporting,count(*) filter(where classification='compatibility') compatibility,count(*) filter(where classification='trigger_helper') trigger_helpers,count(*) filter(where classification='legacy') legacy from public.capability_function_classifications
 )
 select jsonb_build_object(
   'generated_at',now(),
   'source','live_schema_authorization_and_catalog_layers',
   'model',jsonb_build_object('capabilities','capability_domain_contracts','features','feature_catalog','implementations','capability_function_classifications'),
   'summary',jsonb_build_object(
      'capabilities',jsonb_build_object('total',count(*),'wired',count(*) filter(where status='wired'),'not_wired',count(*) filter(where status<>'wired'),'unverified',count(*) filter(where status='unverified'),'missing_rpc',count(*) filter(where status='missing_rpc'),'authorization_gap',count(*) filter(where status='authorization_gap')),
      'features',(select jsonb_build_object('total',total,'enabled',enabled) from feature_stats),
      'implementations',(select jsonb_build_object('total',total,'canonical',canonical,'supporting',supporting,'compatibility',compatibility,'trigger_helpers',trigger_helpers,'legacy',legacy) from impl_stats)
   ),
   'items',coalesce(jsonb_agg(jsonb_build_object('domain',domain,'capability',canonical_capability,'rpc',canonical_rpc,'surface',owner_surface,'status',status,'rpc_exists',rpc_exists,'authenticated_execute',auth_execute,'anon_execute',anon_execute) order by domain),'[]'::jsonb)
 ) into v_result from statuses;
 return v_result;
end; $$;
revoke all on function public.admin_operational_capability_catalog() from public;
revoke all on function public.admin_operational_capability_catalog() from anon;
grant execute on function public.admin_operational_capability_catalog() to authenticated;
