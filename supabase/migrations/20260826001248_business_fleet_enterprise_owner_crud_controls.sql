-- Role-scoped owner CRUD for Business, Fleet, and Enterprise workspaces.
-- Mutations terminate in SECURITY DEFINER RPCs with business/tier authorization.

create or replace function public.fleet_create_vehicle(
  p_business_id uuid, p_name text, p_unit_code text default null, p_vehicle_type text default 'vehicle',
  p_status text default 'active', p_driver_name text default null, p_current_lat double precision default null,
  p_current_lng double precision default null, p_odometer_miles numeric default null, p_metadata jsonb default '{}'::jsonb
) returns public.fleet_vehicles
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare v public.fleet_vehicles;
begin
  if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager access required'; end if;
  if not public.has_fleet_access(p_business_id) then raise exception 'Fleet access required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Vehicle name required'; end if;
  insert into public.fleet_vehicles(business_id,name,unit_code,vehicle_type,status,driver_name,current_lat,current_lng,odometer_miles,metadata)
  values(p_business_id,trim(p_name),nullif(trim(p_unit_code),''),coalesce(nullif(trim(p_vehicle_type),''),'vehicle'),coalesce(nullif(trim(p_status),''),'active'),nullif(trim(p_driver_name),''),p_current_lat,p_current_lng,p_odometer_miles,coalesce(p_metadata,'{}'::jsonb))
  returning * into v;
  return v;
end $$;

create or replace function public.fleet_update_vehicle(
  p_business_id uuid, p_vehicle_id uuid, p_name text, p_unit_code text, p_vehicle_type text,
  p_status text, p_driver_name text, p_current_lat double precision, p_current_lng double precision,
  p_odometer_miles numeric, p_metadata jsonb default '{}'::jsonb
) returns public.fleet_vehicles
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare v public.fleet_vehicles;
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  update public.fleet_vehicles set name=trim(p_name),unit_code=nullif(trim(p_unit_code),''),vehicle_type=nullif(trim(p_vehicle_type),''),status=nullif(trim(p_status),''),driver_name=nullif(trim(p_driver_name),''),current_lat=p_current_lat,current_lng=p_current_lng,odometer_miles=p_odometer_miles,metadata=coalesce(p_metadata,metadata),updated_at=now()
  where id=p_vehicle_id and business_id=p_business_id returning * into v;
  if v.id is null then raise exception 'Vehicle not found'; end if;
  return v;
end $$;

create or replace function public.fleet_delete_vehicle(p_business_id uuid,p_vehicle_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  delete from public.fleet_vehicles where id=p_vehicle_id and business_id=p_business_id;
  return found;
end $$;

create or replace function public.fleet_create_driver(
  p_business_id uuid,p_name text,p_email text default null,p_phone text default null,p_status text default 'active',p_vehicle_id uuid default null,p_metadata jsonb default '{}'::jsonb
) returns public.fleet_drivers
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare d public.fleet_drivers;
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Driver name required'; end if;
  if p_vehicle_id is not null and not exists(select 1 from public.fleet_vehicles where id=p_vehicle_id and business_id=p_business_id) then raise exception 'Vehicle not found'; end if;
  insert into public.fleet_drivers(business_id,name,email,phone,status,vehicle_id,metadata) values(p_business_id,trim(p_name),nullif(trim(p_email),''),nullif(trim(p_phone),''),coalesce(nullif(trim(p_status),''),'active'),p_vehicle_id,coalesce(p_metadata,'{}'::jsonb)) returning * into d;
  return d;
end $$;

create or replace function public.fleet_update_driver(
  p_business_id uuid,p_driver_id uuid,p_name text,p_email text,p_phone text,p_status text,p_vehicle_id uuid,p_metadata jsonb default '{}'::jsonb
) returns public.fleet_drivers
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare d public.fleet_drivers;
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  if p_vehicle_id is not null and not exists(select 1 from public.fleet_vehicles where id=p_vehicle_id and business_id=p_business_id) then raise exception 'Vehicle not found'; end if;
  update public.fleet_drivers set name=trim(p_name),email=nullif(trim(p_email),''),phone=nullif(trim(p_phone),''),status=nullif(trim(p_status),''),vehicle_id=p_vehicle_id,metadata=coalesce(p_metadata,metadata),updated_at=now() where id=p_driver_id and business_id=p_business_id returning * into d;
  if d.id is null then raise exception 'Driver not found'; end if;
  return d;
end $$;

create or replace function public.fleet_delete_driver(p_business_id uuid,p_driver_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  delete from public.fleet_drivers where id=p_driver_id and business_id=p_business_id;
  return found;
end $$;

create or replace function public.fleet_create_route(
  p_business_id uuid,p_name text,p_status text default 'planned',p_vehicle_id uuid default null,p_driver_id uuid default null,p_scheduled_for timestamptz default null,
  p_distance_miles numeric default null,p_estimated_minutes integer default null,p_stops_count integer default 0,p_metadata jsonb default '{}'::jsonb
) returns public.fleet_routes
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare r public.fleet_routes;
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Route name required'; end if;
  if p_vehicle_id is not null and not exists(select 1 from public.fleet_vehicles where id=p_vehicle_id and business_id=p_business_id) then raise exception 'Vehicle not found'; end if;
  if p_driver_id is not null and not exists(select 1 from public.fleet_drivers where id=p_driver_id and business_id=p_business_id) then raise exception 'Driver not found'; end if;
  insert into public.fleet_routes(business_id,name,status,vehicle_id,driver_id,scheduled_for,distance_miles,estimated_minutes,stops_count,metadata) values(p_business_id,trim(p_name),coalesce(nullif(trim(p_status),''),'planned'),p_vehicle_id,p_driver_id,p_scheduled_for,p_distance_miles,p_estimated_minutes,coalesce(p_stops_count,0),coalesce(p_metadata,'{}'::jsonb)) returning * into r;
  return r;
end $$;

create or replace function public.fleet_update_route(
  p_business_id uuid,p_route_id uuid,p_name text,p_status text,p_vehicle_id uuid,p_driver_id uuid,p_scheduled_for timestamptz,p_distance_miles numeric,p_estimated_minutes integer,p_stops_count integer,p_metadata jsonb default '{}'::jsonb
) returns public.fleet_routes
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare r public.fleet_routes;
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  if p_vehicle_id is not null and not exists(select 1 from public.fleet_vehicles where id=p_vehicle_id and business_id=p_business_id) then raise exception 'Vehicle not found'; end if;
  if p_driver_id is not null and not exists(select 1 from public.fleet_drivers where id=p_driver_id and business_id=p_business_id) then raise exception 'Driver not found'; end if;
  update public.fleet_routes set name=trim(p_name),status=nullif(trim(p_status),''),vehicle_id=p_vehicle_id,driver_id=p_driver_id,scheduled_for=p_scheduled_for,distance_miles=p_distance_miles,estimated_minutes=p_estimated_minutes,stops_count=coalesce(p_stops_count,0),metadata=coalesce(p_metadata,metadata),updated_at=now() where id=p_route_id and business_id=p_business_id returning * into r;
  if r.id is null then raise exception 'Route not found'; end if;
  return r;
end $$;

create or replace function public.fleet_delete_route(p_business_id uuid,p_route_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  delete from public.fleet_routes where id=p_route_id and business_id=p_business_id;
  return found;
end $$;

create or replace function public.fleet_create_maintenance(
  p_business_id uuid,p_vehicle_id uuid,p_maintenance_type text,p_status text default 'scheduled',p_scheduled_at timestamptz default null,p_odometer_miles numeric default null,p_cost numeric default null,p_vendor text default null,p_notes text default null,p_metadata jsonb default '{}'::jsonb
) returns public.fleet_maintenance_records
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare m public.fleet_maintenance_records;
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  if p_vehicle_id is null or not exists(select 1 from public.fleet_vehicles where id=p_vehicle_id and business_id=p_business_id) then raise exception 'Vehicle not found'; end if;
  insert into public.fleet_maintenance_records(business_id,vehicle_id,maintenance_type,status,scheduled_at,odometer_miles,cost,vendor,notes,metadata) values(p_business_id,p_vehicle_id,nullif(trim(p_maintenance_type),''),coalesce(nullif(trim(p_status),''),'scheduled'),p_scheduled_at,p_odometer_miles,p_cost,nullif(trim(p_vendor),''),p_notes,coalesce(p_metadata,'{}'::jsonb)) returning * into m;
  return m;
end $$;

create or replace function public.fleet_update_maintenance(
  p_business_id uuid,p_maintenance_id uuid,p_vehicle_id uuid,p_maintenance_type text,p_status text,p_scheduled_at timestamptz,p_completed_at timestamptz,p_odometer_miles numeric,p_cost numeric,p_vendor text,p_notes text,p_metadata jsonb default '{}'::jsonb
) returns public.fleet_maintenance_records
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare m public.fleet_maintenance_records;
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  if p_vehicle_id is null or not exists(select 1 from public.fleet_vehicles where id=p_vehicle_id and business_id=p_business_id) then raise exception 'Vehicle not found'; end if;
  update public.fleet_maintenance_records set vehicle_id=p_vehicle_id,maintenance_type=nullif(trim(p_maintenance_type),''),status=nullif(trim(p_status),''),scheduled_at=p_scheduled_at,completed_at=p_completed_at,odometer_miles=p_odometer_miles,cost=p_cost,vendor=nullif(trim(p_vendor),''),notes=p_notes,metadata=coalesce(p_metadata,metadata),updated_at=now() where id=p_maintenance_id and business_id=p_business_id returning * into m;
  if m.id is null then raise exception 'Maintenance record not found'; end if;
  return m;
end $$;

create or replace function public.fleet_delete_maintenance(p_business_id uuid,p_maintenance_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
begin
  if not public.fleet_actor_is_manager(p_business_id) or not public.has_fleet_access(p_business_id) then raise exception 'Fleet manager access required'; end if;
  delete from public.fleet_maintenance_records where id=p_maintenance_id and business_id=p_business_id;
  return found;
end $$;

-- Enterprise network/campaign CRUD is scoped to the owning business and only owner/admin.
create or replace function public.enterprise_list_owned_networks(p_business_id uuid) returns setof public.enterprise_partner_networks
language sql stable security definer set search_path=public,auth,extensions,pg_temp as $$
  select n.* from public.enterprise_partner_networks n where n.owner_business_id=p_business_id and exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'));
$$;

create or replace function public.enterprise_update_network(p_network_id uuid,p_name text,p_enabled boolean) returns public.enterprise_partner_networks
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare n public.enterprise_partner_networks; b uuid;
begin
  select owner_business_id into b from public.enterprise_partner_networks where id=p_network_id;
  if b is null then raise exception 'Network not found'; end if;
  if not exists(select 1 from public.business_members where business_id=b and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Enterprise partner admin access required'; end if;
  if not exists(select 1 from public.businesses where id=b and lower(business_tier::text) in ('fleet','enterprise')) then raise exception 'Fleet or Enterprise plan required'; end if;
  update public.enterprise_partner_networks set name=trim(p_name),enabled=p_enabled where id=p_network_id returning * into n;
  return n;
end $$;

create or replace function public.enterprise_list_network_campaigns(p_network_id uuid) returns setof public.enterprise_partner_campaigns
language sql stable security definer set search_path=public,auth,extensions,pg_temp as $$
  select c.* from public.enterprise_partner_campaigns c join public.enterprise_partner_networks n on n.id=c.network_id where c.network_id=p_network_id and exists(select 1 from public.business_members bm where bm.business_id=n.owner_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'));
$$;

create or replace function public.enterprise_update_campaign(p_campaign_id uuid,p_name text,p_campaign_type text,p_goal text,p_status text) returns public.enterprise_partner_campaigns
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare c public.enterprise_partner_campaigns; b uuid;
begin
  select n.owner_business_id into b from public.enterprise_partner_campaigns c0 join public.enterprise_partner_networks n on n.id=c0.network_id where c0.id=p_campaign_id;
  if b is null then raise exception 'Campaign not found'; end if;
  if not exists(select 1 from public.business_members where business_id=b and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Enterprise partner admin access required'; end if;
  update public.enterprise_partner_campaigns set name=trim(p_name),campaign_type=p_campaign_type,goal=p_goal,status=coalesce(nullif(trim(p_status),''),status) where id=p_campaign_id returning * into c;
  return c;
end $$;

create or replace function public.enterprise_delete_campaign(p_campaign_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare b uuid;
begin
  select n.owner_business_id into b from public.enterprise_partner_campaigns c join public.enterprise_partner_networks n on n.id=c.network_id where c.id=p_campaign_id;
  if b is null then raise exception 'Campaign not found'; end if;
  if not exists(select 1 from public.business_members where business_id=b and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Enterprise partner admin access required'; end if;
  update public.enterprise_partner_campaigns set status='cancelled',paused_at=coalesce(paused_at,now()) where id=p_campaign_id;
  return found;
end $$;

create or replace function public.enterprise_delete_network(p_network_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare b uuid;
begin
  select owner_business_id into b from public.enterprise_partner_networks where id=p_network_id;
  if b is null then raise exception 'Network not found'; end if;
  if not exists(select 1 from public.business_members where business_id=b and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Enterprise partner admin access required'; end if;
  update public.enterprise_partner_networks set enabled=false where id=p_network_id;
  return found;
end $$;

-- Explicit grants for authenticated callers; RPCs enforce the real authorization boundary.
grant execute on function public.fleet_create_vehicle(uuid,text,text,text,text,text,double precision,double precision,numeric,jsonb) to authenticated;
grant execute on function public.fleet_update_vehicle(uuid,uuid,text,text,text,text,text,double precision,double precision,numeric,jsonb) to authenticated;
grant execute on function public.fleet_delete_vehicle(uuid,uuid) to authenticated;
grant execute on function public.fleet_create_driver(uuid,text,text,text,text,uuid,jsonb) to authenticated;
grant execute on function public.fleet_update_driver(uuid,uuid,text,text,text,text,uuid,jsonb) to authenticated;
grant execute on function public.fleet_delete_driver(uuid,uuid) to authenticated;
grant execute on function public.fleet_create_route(uuid,text,text,uuid,uuid,timestamptz,numeric,integer,integer,jsonb) to authenticated;
grant execute on function public.fleet_update_route(uuid,uuid,text,text,uuid,uuid,timestamptz,numeric,integer,integer,jsonb) to authenticated;
grant execute on function public.fleet_delete_route(uuid,uuid) to authenticated;
grant execute on function public.fleet_create_maintenance(uuid,uuid,text,text,timestamptz,numeric,numeric,text,text,jsonb) to authenticated;
grant execute on function public.fleet_update_maintenance(uuid,uuid,uuid,text,text,timestamptz,timestamptz,numeric,numeric,text,text,jsonb) to authenticated;
grant execute on function public.fleet_delete_maintenance(uuid,uuid) to authenticated;
grant execute on function public.enterprise_list_owned_networks(uuid) to authenticated;
grant execute on function public.enterprise_update_network(uuid,text,boolean) to authenticated;
grant execute on function public.enterprise_list_network_campaigns(uuid) to authenticated;
grant execute on function public.enterprise_update_campaign(uuid,text,text,text,text) to authenticated;
grant execute on function public.enterprise_delete_campaign(uuid) to authenticated;
grant execute on function public.enterprise_delete_network(uuid) to authenticated;
