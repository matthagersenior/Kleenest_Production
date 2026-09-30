-- Complete the scheduled capability-audit repair.
-- This migration is already applied in Production as 20260930083516.

create or replace function public.check_single_capability_per_domain()
returns table(
  domain text,
  canonical_capability text,
  canonical_rpc text,
  issue text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_trusted_scheduler boolean :=
    session_user = 'postgres'
    or coalesce(auth.jwt()->>'role','') = 'service_role';
begin
  if not v_trusted_scheduler and not public.is_platform_owner_session() then
    raise exception 'platform owner or service role required' using errcode='42501';
  end if;

  return query
  select c.domain, c.canonical_capability, c.canonical_rpc,
         case
           when not c.active then 'inactive_contract'
           when not exists (
             select 1
             from pg_catalog.pg_proc p
             join pg_catalog.pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public'
               and p.proname=c.canonical_rpc
           ) then 'missing_canonical_rpc'
           else 'ok'
         end
  from public.capability_domain_contracts c
  where c.active

  union all

  select c.domain, null::text, null::text, 'duplicate_domain_contract'
  from public.capability_domain_contracts c
  join (
    select d.domain
    from public.capability_domain_contracts d
    where d.active
    group by d.domain
    having count(*)>1
  ) dup using(domain)
  where c.active;
end;
$function$;

revoke all on function public.check_single_capability_per_domain() from public,anon;
grant execute on function public.check_single_capability_per_domain()
  to authenticated,service_role;
