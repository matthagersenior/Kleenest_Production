create or replace function public.business_engagement_authorized(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
  select auth.uid() is not null
     and public.business_can_manage(p_business_id)
     and exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text in ('growth','enterprise'));
$$;

create or replace function public.business_qr_authorized(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
  select auth.uid() is not null
     and public.business_can_manage(p_business_id)
     and exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text in ('standard','growth','fleet','enterprise'));
$$;

create or replace function public.business_fleet_authorized(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
  select auth.uid() is not null
     and public.business_can_manage(p_business_id)
     and exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text in ('fleet','enterprise'));
$$;

create or replace function public.business_enterprise_authorized(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
  select auth.uid() is not null
     and public.business_can_manage(p_business_id)
     and exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text='enterprise');
$$;

revoke all on function public.business_engagement_authorized(uuid) from public, anon;
revoke all on function public.business_qr_authorized(uuid) from public, anon;
revoke all on function public.business_fleet_authorized(uuid) from public, anon;
revoke all on function public.business_enterprise_authorized(uuid) from public, anon;
grant execute on function public.business_engagement_authorized(uuid) to authenticated;
grant execute on function public.business_qr_authorized(uuid) to authenticated;
grant execute on function public.business_fleet_authorized(uuid) to authenticated;
grant execute on function public.business_enterprise_authorized(uuid) to authenticated;
