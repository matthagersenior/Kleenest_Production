alter table public.route_plans add column if not exists route_geometry jsonb;

create or replace function public.populate_route_discovery_cache(p_session_id uuid,p_route_geometry jsonb default null)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_session public.route_discovery_sessions;
  v_geometry jsonb;
  v_inserted integer:=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.route_discovery_sessions where id=p_session_id and user_id=v_user for update;
  if not found then raise exception 'Route discovery session not found'; end if;
  v_geometry:=coalesce(p_route_geometry,v_session.route_geometry);
  if v_geometry is null then raise exception 'Route geometry is required to prepare corridor discovery'; end if;
  update public.route_discovery_sessions set route_geometry=v_geometry,status='discovering',updated_at=now() where id=p_session_id;
  insert into public.route_discovery_locations(session_id,location_id,trigger_radius_meters,source,discovered_at,geofence_enabled)
  select p_session_id,l.id,greatest(100,least(1000,coalesce(l.geofence_radius_m,300))),'supabase_cache',now(),true
  from public.locations l
  where l.is_active=true and l.geom is not null
    and ST_DWithin(l.geom,ST_SetSRID(ST_GeomFromGeoJSON(v_geometry::text),4326)::geography,v_session.corridor_meters)
  on conflict(session_id,location_id) do update set trigger_radius_meters=excluded.trigger_radius_meters,source='supabase_cache',discovered_at=now(),geofence_enabled=true;
  get diagnostics v_inserted=row_count;
  update public.route_discovery_sessions set status='ready',discovered_at=now(),updated_at=now() where id=p_session_id;
  return jsonb_build_object('session_id',p_session_id,'status','ready','locations_added',v_inserted);
end;
$$;
grant execute on function public.populate_route_discovery_cache(uuid,jsonb) to authenticated;

create or replace function public.prepare_route_discovery(p_route_id uuid,p_corridor_meters integer default 1000,p_expires_minutes integer default 180)
returns public.route_discovery_sessions
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_route public.route_plans;
  v_session public.route_discovery_sessions;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_route from public.route_plans where id=p_route_id and user_id=v_user;
  if not found then raise exception 'Route not found'; end if;
  insert into public.route_discovery_sessions(user_id,route_id,origin_lat,origin_lng,destination_lat,destination_lng,corridor_meters,route_geometry,status,expires_at)
  values(v_user,p_route_id,v_route.start_lat,v_route.start_lng,v_route.end_lat,v_route.end_lng,greatest(100,p_corridor_meters),v_route.route_geometry,'planned',now()+make_interval(mins=>greatest(15,p_expires_minutes)))
  returning * into v_session;
  if v_route.route_geometry is not null then
    perform public.populate_route_discovery_cache(v_session.id,v_route.route_geometry);
    select * into v_session from public.route_discovery_sessions where id=v_session.id;
  end if;
  return v_session;
end;
$$;
grant execute on function public.prepare_route_discovery(uuid,integer,integer) to authenticated;
