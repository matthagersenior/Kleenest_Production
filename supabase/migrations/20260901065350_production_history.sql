create table if not exists public.fleet_monitored_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,location_id)
);

alter table public.fleet_monitored_locations enable row level security;

create policy fleet_monitored_locations_observe on public.fleet_monitored_locations
for select to authenticated
using (public.fleet_observe_access(business_id) or public.is_platform_owner(auth.uid()));

create or replace function public.fleet_list_monitored_locations(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_observe_access(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet access required';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'business_id',m.business_id,'location_id',m.location_id,'enabled',m.enabled,
      'location_name',l.name,'address',l.address,'city',l.city,'state',l.state,
      'created_at',m.created_at,'updated_at',m.updated_at
    ) order by l.name),'[]'::jsonb)
    from public.fleet_monitored_locations m
    join public.locations l on l.id=m.location_id
    where m.business_id=p_business_id and m.enabled
  );
end $$;

create or replace function public.fleet_set_monitored_location(p_business_id uuid,p_location_id uuid,p_enabled boolean default true)
returns public.fleet_monitored_locations
language plpgsql
security definer
set search_path=''
as $$
declare r public.fleet_monitored_locations; active_count integer; enterprise_ok boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet manager access required';
  end if;
  if not public.business_fleet_authorized(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet access is not enabled for this business';
  end if;
  if not exists(select 1 from public.locations l where l.id=p_location_id and l.business_id=p_business_id) then
    raise exception 'Location does not belong to business';
  end if;

  enterprise_ok := public.business_enterprise_authorized(p_business_id) or public.is_platform_owner(auth.uid());
  if coalesce(p_enabled,true) and not enterprise_ok then
    select count(*)::int into active_count
    from public.fleet_monitored_locations
    where business_id=p_business_id and enabled and location_id<>p_location_id;
    if active_count >= 1 then
      raise exception 'Enterprise is required to monitor more than one Fleet location';
    end if;
  end if;

  insert into public.fleet_monitored_locations(business_id,location_id,enabled,created_by)
  values(p_business_id,p_location_id,coalesce(p_enabled,true),auth.uid())
  on conflict(business_id,location_id) do update set enabled=excluded.enabled,updated_at=now()
  returning * into r;
  return r;
end $$;

create or replace function public.fleet_remove_monitored_location(p_business_id uuid,p_location_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet manager access required';
  end if;
  delete from public.fleet_monitored_locations where business_id=p_business_id and location_id=p_location_id;
  return found;
end $$;

revoke all on function public.fleet_list_monitored_locations(uuid) from public,anon;
revoke all on function public.fleet_set_monitored_location(uuid,uuid,boolean) from public,anon;
revoke all on function public.fleet_remove_monitored_location(uuid,uuid) from public,anon;
grant execute on function public.fleet_list_monitored_locations(uuid) to authenticated,service_role;
grant execute on function public.fleet_set_monitored_location(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.fleet_remove_monitored_location(uuid,uuid) to authenticated,service_role;
