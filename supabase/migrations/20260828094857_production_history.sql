create or replace function public.admin_operational_capability_catalog() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if not public.is_platform_owner(auth.uid()) then raise exception 'admin authorization required'; end if;
 with contracts as (
   select domain, canonical_capability, canonical_rpc, owner_surface
   from public.capability_domain_contracts where active
 ), rpc as (
   select c.*, exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc) as rpc_exists
   from contracts c
 ), classified as (
   select *, case when not rpc_exists then 'missing_rpc' else 'unverified' end as status from rpc
 )
 select jsonb_build_object(
   'generated_at',now(),'source','capability_domain_contracts',
   'summary',jsonb_build_object(
      'total',count(*),
      'wired',count(*) filter(where status='wired'),
      'not_wired',count(*) filter(where status<>'wired'),
      'unverified',count(*) filter(where status='unverified'),
      'missing_rpc',count(*) filter(where status='missing_rpc')
   ),
   'items',coalesce(jsonb_agg(jsonb_build_object('domain',domain,'capability',canonical_capability,'rpc',canonical_rpc,'surface',owner_surface,'status',status) order by domain),'[]'::jsonb)
 ) into v_result from classified;
 return v_result;
end; $$;
revoke all on function public.admin_operational_capability_catalog() from public, anon;
grant execute on function public.admin_operational_capability_catalog() to authenticated;
