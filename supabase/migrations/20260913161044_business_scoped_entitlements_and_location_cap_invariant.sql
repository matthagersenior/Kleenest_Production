
create table if not exists public.business_service_entitlements (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan public.business_tier not null,
  location_limit integer,
  fleet_enabled boolean not null default false,
  enterprise_enabled boolean not null default false,
  fleet_premium_limit integer not null default 0,
  source text not null default 'business_tier',
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_service_entitlements_location_limit_check
    check (location_limit is null or location_limit > 0),
  constraint business_service_entitlements_fleet_premium_limit_check
    check (fleet_premium_limit >= 0),
  constraint business_service_entitlements_plan_shape_check
    check (
      (plan='standard' and location_limit=1 and enterprise_enabled=false)
      or (plan in ('growth','fleet') and location_limit=5 and enterprise_enabled=false)
      or (plan='enterprise' and location_limit is null and enterprise_enabled=true)
    ),
  constraint business_service_entitlements_fleet_shape_check
    check (
      (fleet_enabled and fleet_premium_limit > 0)
      or (not fleet_enabled and fleet_premium_limit = 0)
    )
);

alter table public.business_service_entitlements enable row level security;

revoke all on table public.business_service_entitlements from public,anon,authenticated;
grant select,insert,update,delete on table public.business_service_entitlements to service_role;

drop policy if exists business_service_entitlements_deny_anon on public.business_service_entitlements;
drop policy if exists business_service_entitlements_deny_authenticated on public.business_service_entitlements;

create policy business_service_entitlements_deny_anon
  on public.business_service_entitlements
  as restrictive for all to anon
  using (false) with check (false);

create policy business_service_entitlements_deny_authenticated
  on public.business_service_entitlements
  as restrictive for all to authenticated
  using (false) with check (false);

insert into public.business_service_entitlements(
  business_id,plan,location_limit,fleet_enabled,enterprise_enabled,fleet_premium_limit,source,metadata
)
select
  b.id,
  b.business_tier,
  case
    when b.business_tier='standard' then 1
    when b.business_tier in ('growth','fleet') then 5
    else null
  end,
  (
    b.business_tier='fleet'
    or (
      b.business_tier='enterprise'
      and (
        exists(select 1 from public.fleet_vehicles v where v.business_id=b.id)
        or exists(select 1 from public.fleet_drivers d where d.business_id=b.id)
        or exists(select 1 from public.fleet_routes r where r.business_id=b.id)
        or exists(select 1 from public.fleet_premium_memberships m where m.business_id=b.id)
      )
    )
  ),
  b.business_tier='enterprise',
  case
    when b.business_tier='fleet'
      or (
        b.business_tier='enterprise'
        and (
          exists(select 1 from public.fleet_vehicles v where v.business_id=b.id)
          or exists(select 1 from public.fleet_drivers d where d.business_id=b.id)
          or exists(select 1 from public.fleet_routes r where r.business_id=b.id)
          or exists(select 1 from public.fleet_premium_memberships m where m.business_id=b.id)
        )
      )
    then 75 else 0
  end,
  'migration_business_tier',
  jsonb_build_object('migrated_at',now(),'preserved_existing_fleet_configuration',true)
from public.businesses b
on conflict(business_id) do update set
  plan=excluded.plan,
  location_limit=excluded.location_limit,
  fleet_enabled=excluded.fleet_enabled,
  enterprise_enabled=excluded.enterprise_enabled,
  fleet_premium_limit=excluded.fleet_premium_limit,
  source=excluded.source,
  metadata=public.business_service_entitlements.metadata||excluded.metadata,
  updated_at=now();

create or replace function public.sync_business_service_entitlement(p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tier public.business_tier;
  v_existing_fleet boolean;
  v_business_id uuid;
begin
  select b.business_tier into v_tier
  from public.businesses b
  where b.id=p_business_id;

  if v_tier is null then raise exception 'Business not found'; end if;

  select e.fleet_enabled into v_existing_fleet
  from public.business_service_entitlements e
  where e.business_id=p_business_id;

  v_existing_fleet:=coalesce(v_existing_fleet,false);

  insert into public.business_service_entitlements(
    business_id,plan,location_limit,fleet_enabled,enterprise_enabled,
    fleet_premium_limit,source,updated_by
  )
  values(
    p_business_id,
    v_tier,
    case when v_tier='standard' then 1 when v_tier in ('growth','fleet') then 5 else null end,
    case
      when v_tier='fleet' then true
      when v_tier in ('growth','enterprise') then v_existing_fleet
      else false
    end,
    v_tier='enterprise',
    case
      when v_tier='fleet' then 75
      when v_tier in ('growth','enterprise') and v_existing_fleet then 75
      else 0
    end,
    'business_tier_sync',
    auth.uid()
  )
  on conflict(business_id) do update set
    plan=excluded.plan,
    location_limit=excluded.location_limit,
    fleet_enabled=excluded.fleet_enabled,
    enterprise_enabled=excluded.enterprise_enabled,
    fleet_premium_limit=excluded.fleet_premium_limit,
    source=excluded.source,
    updated_by=excluded.updated_by,
    updated_at=now()
  returning business_id into v_business_id;

  return v_business_id;
end;
$$;

revoke all on function public.sync_business_service_entitlement(uuid) from public,anon,authenticated;
grant execute on function public.sync_business_service_entitlement(uuid) to service_role;

create or replace function public.sync_business_service_entitlement_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.sync_business_service_entitlement(new.id);
  return new;
end;
$$;

revoke all on function public.sync_business_service_entitlement_trigger() from public,anon,authenticated;
grant execute on function public.sync_business_service_entitlement_trigger() to service_role;

drop trigger if exists trg_business_sync_service_entitlement on public.businesses;
create trigger trg_business_sync_service_entitlement
after insert or update of business_tier on public.businesses
for each row execute function public.sync_business_service_entitlement_trigger();

create or replace function public.get_business_service_entitlement(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and coalesce(auth.jwt()->>'role','') <> 'service_role'
     and not public.is_platform_owner_session()
     and not exists(
       select 1 from public.business_members bm
       where bm.business_id=p_business_id and bm.user_id=auth.uid()
     ) then
    raise exception 'Business membership required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'business_id',b.id,
    'business_tier',b.business_tier::text,
    'service_tier',case when coalesce(e.enterprise_enabled,b.business_tier='enterprise') then 'enterprise' else 'business' end,
    'location_limit',coalesce(
      e.location_limit,
      case when b.business_tier='standard' then 1 when b.business_tier in ('growth','fleet') then 5 else null end
    ),
    'enterprise_enabled',coalesce(e.enterprise_enabled,b.business_tier='enterprise'),
    'fleet_enabled',coalesce(e.fleet_enabled,b.business_tier='fleet'),
    'enterprise_fleet_enabled',
      coalesce(e.enterprise_enabled,b.business_tier='enterprise')
      and coalesce(e.fleet_enabled,b.business_tier='fleet'),
    'fleet_premium_limit',case
      when coalesce(e.fleet_enabled,b.business_tier='fleet') then coalesce(nullif(e.fleet_premium_limit,0),75)
      else 0
    end,
    'source',coalesce(e.source,'business_tier')
  )
  into v_result
  from public.businesses b
  left join public.business_service_entitlements e on e.business_id=b.id
  where b.id=p_business_id;

  if v_result is null then raise exception 'Business not found'; end if;
  return v_result;
end;
$$;

revoke all on function public.get_business_service_entitlement(uuid) from public,anon;
grant execute on function public.get_business_service_entitlement(uuid) to authenticated,service_role;

create or replace function public.get_business_location_cap(p_business_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_cap integer;
begin
  if session_user <> 'postgres'
     and coalesce(auth.jwt()->>'role','') <> 'service_role'
     and not public.is_platform_owner_session()
     and not exists(
       select 1 from public.business_members bm
       where bm.business_id=p_business_id and bm.user_id=auth.uid()
     ) then
    raise exception 'Business membership required' using errcode='42501';
  end if;

  select coalesce(
    e.location_limit,
    case when b.business_tier='standard' then 1 when b.business_tier in ('growth','fleet') then 5 else null end
  )
  into v_cap
  from public.businesses b
  left join public.business_service_entitlements e on e.business_id=b.id
  where b.id=p_business_id;

  if not found then raise exception 'Business not found'; end if;
  return v_cap;
end;
$$;

revoke all on function public.get_business_location_cap(uuid) from public,anon;
grant execute on function public.get_business_location_cap(uuid) to authenticated,service_role;

create or replace function public.enforce_growth_location_cap()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_cap integer;
  v_count integer;
  v_new_business uuid:=coalesce(new.claimed_business_id,new.business_id);
  v_old_business uuid;
  v_needs_check boolean;
begin
  if not coalesce(new.is_active,true) or v_new_business is null then
    return new;
  end if;

  if tg_op='UPDATE' then
    v_old_business:=coalesce(old.claimed_business_id,old.business_id);
  end if;

  v_needs_check :=
    tg_op='INSERT'
    or (tg_op='UPDATE' and not coalesce(old.is_active,true))
    or (tg_op='UPDATE' and v_new_business is distinct from v_old_business);

  if not v_needs_check then return new; end if;

  v_cap:=public.get_business_location_cap(v_new_business);
  if v_cap is null then return new; end if;

  select count(*)::integer into v_count
  from public.locations l
  where coalesce(l.claimed_business_id,l.business_id)=v_new_business
    and coalesce(l.is_active,true)
    and (tg_op='INSERT' or l.id<>new.id);

  if v_count>=v_cap then
    if v_cap=1 then
      raise exception 'Business Standard is limited to 1 active location; Growth supports up to 5 and Enterprise is required beyond 5';
    else
      raise exception 'This business is limited to % active locations; Enterprise is required beyond the current limit',v_cap;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_growth_location_cap() from public,anon,authenticated;
grant execute on function public.enforce_growth_location_cap() to service_role;

create or replace function public.business_create_location_canonical(
  p_business_id uuid,
  p_name text,
  p_address text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_latitude numeric,
  p_longitude numeric,
  p_phone text default null,
  p_website text default null
)
returns public.locations
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.locations;
  v_name text:=nullif(trim(coalesce(p_name,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;
  if v_name is null then raise exception 'Location name is required'; end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be supplied together';
  end if;
  if p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then
    raise exception 'Valid coordinates are required';
  end if;

  insert into public.locations(
    business_id,name,address,city,state,postal_code,latitude,longitude,phone,website,is_active,created_by
  )
  values(
    p_business_id,v_name,nullif(trim(coalesce(p_address,'')),''),
    nullif(trim(coalesce(p_city,'')),''),
    nullif(trim(coalesce(p_state,'')),''),
    nullif(trim(coalesce(p_postal_code,'')),''),
    p_latitude,p_longitude,
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(trim(coalesce(p_website,'')),''),
    true,auth.uid()
  )
  returning * into v;

  return v;
end;
$$;

revoke all on function public.business_create_location_canonical(uuid,text,text,text,text,text,numeric,numeric,text,text) from public,anon;
grant execute on function public.business_create_location_canonical(uuid,text,text,text,text,text,numeric,numeric,text,text) to authenticated,service_role;

create or replace function public.business_create_location(p_business_id uuid,p_name text)
returns uuid
language sql
security definer
set search_path=''
as $$
  select (public.business_create_location_canonical(
    p_business_id,p_name,null,null,null,null,null,null,null,null
  )).id;
$$;

create or replace function public.business_create_location(
  p_business_id uuid,p_name text,p_address text default null,p_city text default null,p_state text default null,
  p_lat numeric default null,p_lng numeric default null
)
returns uuid
language sql
security definer
set search_path=''
as $$
  select (public.business_create_location_canonical(
    p_business_id,p_name,p_address,p_city,p_state,null,p_lat,p_lng,null,null
  )).id;
$$;

create or replace function public.business_create_location(
  p_business_id uuid,p_name text,p_address text,p_city text,p_state text,p_postal_code text,
  p_latitude numeric,p_longitude numeric,p_phone text default null,p_website text default null
)
returns public.locations
language sql
security definer
set search_path=''
as $$
  select public.business_create_location_canonical(
    p_business_id,p_name,p_address,p_city,p_state,p_postal_code,p_latitude,p_longitude,p_phone,p_website
  );
$$;

create or replace function public.create_business_location(
  p_business_id uuid,p_name text,p_address text default null,p_city text default null,p_state text default null
)
returns uuid
language sql
security definer
set search_path=''
as $$
  select (public.business_create_location_canonical(
    p_business_id,p_name,p_address,p_city,p_state,null,null,null,null,null
  )).id;
$$;

revoke all on function public.business_create_location(uuid,text) from public,anon;
revoke all on function public.business_create_location(uuid,text,text,text,text,numeric,numeric) from public,anon;
revoke all on function public.business_create_location(uuid,text,text,text,text,text,numeric,numeric,text,text) from public,anon;
revoke all on function public.create_business_location(uuid,text,text,text,text) from public,anon;
grant execute on function public.business_create_location(uuid,text) to authenticated,service_role;
grant execute on function public.business_create_location(uuid,text,text,text,text,numeric,numeric) to authenticated,service_role;
grant execute on function public.business_create_location(uuid,text,text,text,text,text,numeric,numeric,text,text) to authenticated,service_role;
grant execute on function public.create_business_location(uuid,text,text,text,text) to authenticated,service_role;

create or replace function public.fleet_product_enabled(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(e.fleet_enabled,b.business_tier='fleet')
  from public.businesses b
  left join public.business_service_entitlements e on e.business_id=b.id
  where b.id=p_business_id;
$$;

revoke all on function public.fleet_product_enabled(uuid) from public,anon,authenticated;
grant execute on function public.fleet_product_enabled(uuid) to service_role;

create or replace function public.business_fleet_premium_limit(p_business_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_enabled boolean;
  v_limit integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_user_has_workspace_access(p_business_id)
     and not public.fleet_actor_is_manager(p_business_id)
     and not public.is_platform_owner_session() then
    raise exception 'Fleet workspace access required';
  end if;

  select coalesce(e.fleet_enabled,b.business_tier='fleet'),
         coalesce(nullif(e.fleet_premium_limit,0),75)
    into v_enabled,v_limit
  from public.businesses b
  left join public.business_service_entitlements e on e.business_id=b.id
  where b.id=p_business_id;

  if not coalesce(v_enabled,false) then return 0; end if;
  return v_limit;
end;
$$;

revoke all on function public.business_fleet_premium_limit(uuid) from public,anon;
grant execute on function public.business_fleet_premium_limit(uuid) to authenticated,service_role;

create or replace function public.admin_get_business_access(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v jsonb;
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and is_platform_owner=true
  ) then
    raise exception 'platform owner authorization required';
  end if;

  v:=public.get_business_service_entitlement(p_business_id);
  return v;
end;
$$;

create or replace function public.admin_set_business_access(
  p_business_id uuid,
  p_tier public.business_tier,
  p_fleet_enabled boolean default false,
  p_enterprise_enabled boolean default false,
  p_reason text default 'Owner business access change'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  caller uuid:=auth.uid();
  v_fleet boolean;
  v_result jsonb;
  v_previous jsonb;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles
    where id=caller and is_platform_owner=true
  ) then
    raise exception 'Platform owner authorization required';
  end if;
  if not exists(select 1 from public.businesses where id=p_business_id) then
    raise exception 'Business not found';
  end if;

  if coalesce(p_enterprise_enabled,false) and p_tier<>'enterprise' then
    raise exception 'Enterprise capability requires Enterprise plan';
  end if;
  if coalesce(p_fleet_enabled,false) and p_tier='standard' then
    raise exception 'Fleet requires Fleet, Growth, or Enterprise plan';
  end if;

  v_previous:=public.get_business_service_entitlement(p_business_id);
  v_fleet:=p_tier='fleet' or coalesce(p_fleet_enabled,false);

  update public.businesses
     set business_tier=p_tier,updated_at=now()
   where id=p_business_id;

  insert into public.business_service_entitlements(
    business_id,plan,location_limit,fleet_enabled,enterprise_enabled,
    fleet_premium_limit,source,updated_by
  )
  values(
    p_business_id,p_tier,
    case when p_tier='standard' then 1 when p_tier in ('growth','fleet') then 5 else null end,
    v_fleet,
    p_tier='enterprise',
    case when v_fleet then 75 else 0 end,
    'platform_owner',
    caller
  )
  on conflict(business_id) do update set
    plan=excluded.plan,
    location_limit=excluded.location_limit,
    fleet_enabled=excluded.fleet_enabled,
    enterprise_enabled=excluded.enterprise_enabled,
    fleet_premium_limit=excluded.fleet_premium_limit,
    source=excluded.source,
    updated_by=excluded.updated_by,
    updated_at=now();

  v_result:=public.get_business_service_entitlement(p_business_id);

  insert into public.admin_capability_audit(
    admin_user_id,target_user_id,previous_state,new_state,reason
  )
  values(
    caller,null,
    v_previous,
    v_result,
    coalesce(nullif(trim(coalesce(p_reason,'')),''),'Owner business access change')
  );

  return v_result;
end;
$$;

revoke all on function public.admin_get_business_access(uuid) from public,anon;
revoke all on function public.admin_set_business_access(uuid,public.business_tier,boolean,boolean,text) from public,anon;
grant execute on function public.admin_get_business_access(uuid) to authenticated,service_role;
grant execute on function public.admin_set_business_access(uuid,public.business_tier,boolean,boolean,text) to authenticated,service_role;

update public.pricing_catalog
set max_users=75,
    price_note='$75/account/month; includes 75 Premium users and Business Growth tools',
    features='["business_growth_tools","up_to_75_premium_users","fleet_management","fleet_dashboard","fleet_analytics","route_planning","dispatch","service_verification"]'::jsonb,
    updated_at=now()
where code='fleet';

update public.subscription_plans
set max_family_members=75,
    features=jsonb_set(
      jsonb_set(coalesce(features,'{}'::jsonb),'{max_users}','75'::jsonb,true),
      '{premium_users}','true'::jsonb,true
    )
where code='fleet';
