create or replace function public.admin_get_business_access(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  b public.businesses;
  owner_id uuid;
  ent record;
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and is_platform_owner=true) then
    raise exception 'platform owner authorization required';
  end if;
  if p_business_id is null then raise exception 'business required'; end if;
  select * into b from public.businesses where id=p_business_id;
  if b.id is null then raise exception 'business not found'; end if;
  select bm.user_id into owner_id
  from public.business_members bm
  where bm.business_id=p_business_id and bm.role::text in ('owner','admin')
  order by case when bm.role::text='owner' then 0 else 1 end, bm.created_at
  limit 1;
  if owner_id is not null then
    select e.service_tier,e.location_limit,e.enterprise_fleet_enabled,e.fleet_enabled
      into ent
    from public.account_service_entitlements e
    where e.account_user_id=owner_id
      and e.service_tier in ('business','enterprise')
    order by case when e.service_tier='enterprise' then 0 else 1 end, e.updated_at desc
    limit 1;
  end if;
  return jsonb_build_object(
    'business_id',b.id,
    'business_tier',b.business_tier::text,
    'owner_user_id',owner_id,
    'fleet_enabled',coalesce(ent.fleet_enabled,false) or b.business_tier in ('fleet','enterprise'),
    'enterprise_enabled',coalesce(ent.enterprise_fleet_enabled,false) or b.business_tier='enterprise',
    'service_tier',coalesce(ent.service_tier,case when b.business_tier='enterprise' then 'enterprise' else 'business' end),
    'location_limit',case when b.business_tier='growth' then 5 else ent.location_limit end
  );
end;
$$;

create or replace function public.admin_set_business_access(
  p_business_id uuid,
  p_tier public.business_tier,
  p_fleet_enabled boolean default false,
  p_enterprise_enabled boolean default false,
  p_reason text default 'Owner business membership change'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  caller uuid := auth.uid();
  owner_id uuid;
  effective_fleet boolean;
  effective_enterprise boolean;
  service_tier text;
  result jsonb;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.profiles where id=caller and is_platform_owner=true) then
    raise exception 'platform owner authorization required';
  end if;
  if p_business_id is null then raise exception 'business required'; end if;
  if not exists (select 1 from public.businesses where id=p_business_id) then raise exception 'business not found'; end if;

  effective_fleet := coalesce(p_fleet_enabled,false) or p_tier in ('fleet','enterprise');
  effective_enterprise := coalesce(p_enterprise_enabled,false) or p_tier='enterprise';
  service_tier := case when effective_enterprise then 'enterprise' else 'business' end;

  update public.businesses
    set business_tier=p_tier, updated_at=now()
    where id=p_business_id;

  select bm.user_id into owner_id
  from public.business_members bm
  where bm.business_id=p_business_id and bm.role::text in ('owner','admin')
  order by case when bm.role::text='owner' then 0 else 1 end, bm.created_at
  limit 1;

  if owner_id is not null then
    insert into public.account_service_entitlements(account_user_id,service_tier,location_limit,enterprise_fleet_enabled,fleet_enabled)
    values(owner_id,service_tier,case when p_tier='growth' then 5 else null end,effective_enterprise,effective_fleet)
    on conflict(account_user_id,service_tier) do update set
      location_limit=excluded.location_limit,
      enterprise_fleet_enabled=excluded.enterprise_fleet_enabled,
      fleet_enabled=excluded.fleet_enabled,
      updated_at=now();
  end if;

  select jsonb_build_object(
    'business_id',b.id,
    'business_tier',b.business_tier::text,
    'owner_user_id',owner_id,
    'fleet_enabled',effective_fleet,
    'enterprise_enabled',effective_enterprise,
    'service_tier',service_tier,
    'location_limit',case when b.business_tier='growth' then 5 else null end
  ) into result
  from public.businesses b where b.id=p_business_id;

  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
  values(caller,owner_id,
    jsonb_build_object('business_id',p_business_id,'business_tier',null),
    result,
    coalesce(nullif(trim(p_reason),''),'Owner business membership change'));
  return result;
end;
$$;

revoke execute on function public.admin_get_business_access(uuid) from anon;
revoke execute on function public.admin_set_business_access(uuid,public.business_tier,boolean,boolean,text) from anon;
grant execute on function public.admin_get_business_access(uuid) to authenticated;
grant execute on function public.admin_set_business_access(uuid,public.business_tier,boolean,boolean,text) to authenticated;
