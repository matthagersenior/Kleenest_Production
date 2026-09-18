create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        coalesce(p.is_admin,false)
        or lower(coalesce(p.role::text,'')) in ('owner','platform_admin','super_admin','admin')
      )
  );
$$;

create or replace function public.business_can_manage(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.business_members bm
      where bm.business_id = p_business_id
        and bm.user_id = auth.uid()
        and lower(bm.role::text) in ('owner','admin','manager')
    );
$$;

create or replace function public.business_admin_guard(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.business_members bm
      where bm.business_id = p_business_id
        and bm.user_id = auth.uid()
        and lower(bm.role::text) in ('owner','admin')
    );
$$;

create or replace function public.business_advanced_allowed(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.businesses b
      where b.id = p_business_id
        and b.business_tier::text in ('growth','enterprise','fleet')
    );
$$;

create or replace function public.fleet_actor_is_manager(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.business_members bm
      where bm.business_id = p_business_id
        and bm.user_id = auth.uid()
        and lower(bm.role::text) in ('owner','admin','manager')
    );
$$;

create or replace function public.has_fleet_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.business_members bm
      join public.businesses b on b.id = bm.business_id
      where bm.business_id = p_business_id
        and bm.user_id = auth.uid()
        and lower(bm.role::text) in ('owner','admin','manager')
        and b.business_tier = 'fleet'::public.business_tier
    );
$$;

create or replace function public.current_user_business_role(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select lower(bm.role::text) from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() limit 1),
    case when public.is_platform_owner() then 'admin' else null end
  );
$$;

create or replace function public.require_business_admin(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_platform_owner() then return; end if;
  if not exists(
    select 1 from public.business_members
    where business_id=p_business_id and user_id=auth.uid() and lower(role::text) in ('owner','admin')
  ) then raise exception 'business_admin_required'; end if;
end;
$$;

create or replace function public.get_business_product_access(p_business_id uuid)
returns table(business_id uuid, plan text, location_count integer, location_limit integer, enterprise_enabled boolean, fleet_enabled boolean, is_admin boolean)
language sql
security definer
set search_path = public
as $$
with owner_access as (
  select public.is_platform_owner() as a
),
member as (
  select exists(select 1 from public.app_business_memberships m where m.business_id=p_business_id and m.user_id=auth.uid()) as a
),
b as (
  select x.id,x.business_tier::text tier from public.businesses x where x.id=p_business_id
),
lc as (
  select count(*)::integer n from public.locations l where l.business_id=p_business_id and coalesce(l.is_active,true)
)
select b.id,
       coalesce(b.tier,'standard'),
       lc.n,
       case when coalesce(b.tier,'standard')='growth' then 5 else null end,
       (coalesce(b.tier,'standard') in ('growth','enterprise')) or owner_access.a,
       exists(select 1 from public.account_service_entitlements e where e.account_user_id=auth.uid() and e.fleet_enabled) or owner_access.a,
       owner_access.a
from b,lc,owner_access,member
where member.a or owner_access.a;
$$;
