create or replace function public.get_business_product_access(p_business_id uuid)
returns table(
  business_id uuid,
  plan text,
  location_count integer,
  location_limit integer,
  enterprise_enabled boolean,
  fleet_enabled boolean,
  is_admin boolean
)
language sql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
with owner_access as (
  select public.is_platform_owner_session() as allowed
),
member_access as (
  select exists(
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
  ) as allowed
),
b as (
  select x.id, coalesce(x.business_tier::text,'standard') as tier
  from public.businesses x
  where x.id = p_business_id
),
account_entitlement as (
  select a.service_tier, a.location_limit, a.enterprise_fleet_enabled, a.fleet_enabled
  from public.business_members bm
  join public.account_service_entitlements a on a.account_user_id = bm.user_id
  where bm.business_id = p_business_id
    and lower(bm.role::text) in ('owner','admin','manager','enterprise_owner','enterprise_admin','enterprise_manager','fleet_owner','fleet_manager')
  order by case when bm.user_id = auth.uid() then 0 else 1 end,
           case when lower(bm.role::text) in ('owner','enterprise_owner','fleet_owner') then 0 else 1 end,
           bm.created_at,
           a.updated_at desc
  limit 1
),
resolved as (
  select b.id,
         b.tier,
         coalesce(ae.service_tier,
           case
             when b.tier='enterprise' then 'enterprise'
             when b.tier='fleet' then 'fleet'
             when b.tier='growth' then 'growth'
             else 'business'
           end) as service_tier,
         ae.location_limit as entitlement_location_limit,
         coalesce(ae.enterprise_fleet_enabled,false) as enterprise_fleet_enabled,
         coalesce(ae.fleet_enabled,false) as entitlement_fleet_enabled
  from b
  left join account_entitlement ae on true
),
lc as (
  select count(*)::integer as n
  from public.locations l
  where (l.business_id = p_business_id or l.claimed_business_id = p_business_id)
    and coalesce(l.is_active,true)
)
select r.id,
       r.tier,
       lc.n,
       case
         when oa.allowed then null
         when r.service_tier='enterprise' or r.tier='enterprise' then null
         when r.entitlement_location_limit is not null then r.entitlement_location_limit
         when r.service_tier='growth' or r.tier='growth' then 5
         else 1
       end,
       (r.service_tier='enterprise' or r.tier='enterprise' or oa.allowed),
       (r.entitlement_fleet_enabled or r.enterprise_fleet_enabled or r.service_tier in ('fleet','enterprise') or r.tier in ('fleet','enterprise') or oa.allowed),
       oa.allowed
from resolved r, lc, owner_access oa, member_access ma
where ma.allowed or oa.allowed;
$function$;

revoke all on function public.get_business_product_access(uuid) from public;
grant execute on function public.get_business_product_access(uuid) to authenticated, service_role;
