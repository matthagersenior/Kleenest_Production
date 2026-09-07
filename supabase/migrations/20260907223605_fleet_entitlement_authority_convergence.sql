-- Converge Fleet workspace authorization on the canonical Business product-access contract.
-- This exact migration version is already applied live in Production.

create or replace function public.business_fleet_authorized(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.business_can_manage(p_business_id)
     and exists (
       select 1
       from public.get_business_product_access(p_business_id) access
       where coalesce(access.fleet_enabled, false)
     );
$$;

revoke execute on function public.business_fleet_authorized(uuid) from public, anon;
grant execute on function public.business_fleet_authorized(uuid) to authenticated, service_role;
