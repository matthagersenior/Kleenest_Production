create or replace function public.get_business_location_cap(p_business_id uuid)
returns integer language sql stable security invoker set search_path=public,pg_temp as $$
 select case when b.business_tier::text='growth' then 5 else null end
 from public.businesses b where b.id=p_business_id;
$$;
create or replace function public.business_engagement_authorized(p_business_id uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text in ('growth','enterprise'));
$$;
create or replace function public.business_qr_authorized(p_business_id uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text in ('standard','growth','fleet','enterprise'));
$$;
create or replace function public.business_enterprise_authorized(p_business_id uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text in ('growth','enterprise'));
$$;
create or replace function public.business_fleet_authorized(p_business_id uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text in ('fleet','enterprise'));
$$;
grant execute on function public.get_business_location_cap(uuid) to authenticated;
grant execute on function public.business_engagement_authorized(uuid) to authenticated;
grant execute on function public.business_qr_authorized(uuid) to authenticated;
grant execute on function public.business_enterprise_authorized(uuid) to authenticated;
grant execute on function public.business_fleet_authorized(uuid) to authenticated;
revoke execute on function public.get_business_location_cap(uuid) from anon;
revoke execute on function public.business_engagement_authorized(uuid) from anon;
revoke execute on function public.business_qr_authorized(uuid) from anon;
revoke execute on function public.business_enterprise_authorized(uuid) from anon;
revoke execute on function public.business_fleet_authorized(uuid) from anon;
