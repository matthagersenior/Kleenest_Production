
create or replace function public.business_tier_qualification_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_current text;
  v_locations integer;
  v_members integer;
  v_access record;
  v_limit integer;
  v_fleet_limit integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_platform_owner_session() and not exists(
    select 1
    from public.business_members bm
    where bm.business_id=p_business_id and bm.user_id=auth.uid()
  ) then
    raise exception 'Business membership required';
  end if;

  select lower(coalesce(b.business_tier::text,'standard'))
    into v_current
  from public.businesses b
  where b.id=p_business_id;

  if v_current is null then raise exception 'Business not found'; end if;

  select count(*)::integer into v_locations
  from public.locations l
  where coalesce(l.claimed_business_id,l.business_id)=p_business_id
    and coalesce(l.is_active,true);

  select count(*)::integer into v_members
  from public.business_members bm
  where bm.business_id=p_business_id;

  select * into v_access
  from public.get_business_product_access(p_business_id);

  v_limit:=v_access.location_limit;

  if coalesce(v_access.fleet_enabled,false) then
    v_fleet_limit:=public.business_fleet_premium_limit(p_business_id);
  end if;

  return jsonb_build_object(
    'business_id',p_business_id,
    'current_tier',v_current,
    'effective_plan',v_current,
    'threshold_plan',case when v_locations>5 then 'enterprise' else v_current end,
    'location_count',v_locations,
    'member_count',v_members,
    'location_limit',v_limit,
    'growth_included',
      v_current in ('growth','fleet','enterprise')
      or coalesce(v_access.enterprise_enabled,false),
    'fleet_enabled',coalesce(v_access.fleet_enabled,false),
    'fleet_premium_limit',v_fleet_limit,
    'enterprise_enabled',coalesce(v_access.enterprise_enabled,false),
    'enterprise_qualifies',(v_locations>5),
    'upgrade_required',(v_locations>5 and not coalesce(v_access.enterprise_enabled,false)),
    'qualification_reason',case
      when v_locations>5 then 'More than 5 active locations requires Enterprise pricing.'
      when v_current='fleet' then 'Fleet includes Business Growth tools and 75 Premium users.'
      when v_current='growth' then 'Business Growth supports up to 5 locations; Fleet and Enterprise remain available upgrade/add-on paths.'
      when v_current='enterprise' then 'Enterprise is active; Fleet remains an optional add-on unless separately enabled.'
      else 'Business Standard can upgrade to Growth, Fleet, or Enterprise.'
    end
  );
end;
$$;

revoke all on function public.business_tier_qualification_snapshot(uuid) from public,anon;
grant execute on function public.business_tier_qualification_snapshot(uuid) to authenticated,service_role;
