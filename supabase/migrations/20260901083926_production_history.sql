create or replace function public.get_business_location_cap(p_business_id uuid)
returns integer
language sql
stable security definer
set search_path to 'public','pg_temp'
as $$
with b as (
  select x.id,x.business_tier::text tier from public.businesses x where x.id=p_business_id
), svc as (
  select a.service_tier
  from public.business_members bm
  join public.account_service_entitlements a on a.account_user_id=bm.user_id
  where bm.business_id=p_business_id and bm.role::text in ('owner','admin')
  order by case a.service_tier when 'enterprise' then 0 when 'growth' then 1 else 2 end,a.updated_at desc
  limit 1
)
select case
  when b.tier='enterprise' or coalesce((select service_tier from svc),'')='enterprise' then null
  when b.tier='growth' or coalesce((select service_tier from svc),'')='growth' then 5
  else 1
end
from b;
$$;

create or replace function public.enforce_growth_location_cap()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare v_cap integer; v_count integer; v_business uuid:=coalesce(new.business_id,old.business_id); v_becoming_active boolean;
begin
  v_cap:=public.get_business_location_cap(v_business);
  if v_cap is null then return new; end if;
  v_becoming_active := coalesce(new.is_active,true) and (tg_op='INSERT' or not coalesce(old.is_active,false));
  if not v_becoming_active then return new; end if;
  select count(*) into v_count from public.locations l where l.business_id=v_business and coalesce(l.is_active,true) and (tg_op='INSERT' or l.id<>new.id);
  if v_count>=v_cap then
    if v_cap=1 then raise exception 'Business Standard is limited to 1 active location; Growth supports up to 5 and Enterprise is required beyond 5';
    else raise exception 'Business Growth is limited to 5 active locations; Enterprise is required beyond 5'; end if;
  end if;
  return new;
end;
$$;
