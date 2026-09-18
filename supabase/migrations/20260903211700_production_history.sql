create or replace function public.record_geofence_event(
  p_geofence_id uuid,
  p_user_id uuid,
  p_location_id uuid,
  p_business_id uuid,
  p_event_type text,
  p_dwell_seconds integer default null,
  p_metadata jsonb default '{}'::jsonb,
  p_notification_id uuid default null,
  p_qr_code_id uuid default null,
  p_check_in_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_user_id is distinct from auth.uid() then raise exception 'user identity mismatch'; end if;
  if p_geofence_id is null or p_location_id is null then raise exception 'geofence and location required'; end if;
  if not exists(
    select 1 from public.business_geofences g
    where g.id=p_geofence_id
      and g.location_id=p_location_id
      and (p_business_id is null or g.business_id=p_business_id)
      and coalesce(g.active,true)
  ) then raise exception 'geofence scope mismatch'; end if;
  insert into public.geofence_events(geofence_id,user_id,location_id,business_id,event_type,dwell_seconds,metadata,notification_id,qr_code_id,check_in_id)
  values(p_geofence_id,auth.uid(),p_location_id,p_business_id,p_event_type,p_dwell_seconds,coalesce(p_metadata,'{}'::jsonb),p_notification_id,p_qr_code_id,p_check_in_id)
  returning id into v_id;
  return v_id;
end;
$function$;

grant execute on function public.record_geofence_event(uuid,uuid,uuid,uuid,text,integer,jsonb,uuid,uuid,uuid) to authenticated, service_role;

create or replace function public.fleet_route_geofence_manifest(p_business_id uuid,p_route_id uuid)
returns table(
  route_stop_id uuid,
  location_id uuid,
  geofence_id uuid,
  stop_order integer,
  latitude double precision,
  longitude double precision,
  radius_meters integer,
  location_name text
)
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare rec record; gid uuid; radius integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
  if not exists(select 1 from public.fleet_routes r where r.id=p_route_id and r.business_id=p_business_id) then raise exception 'Route not found'; end if;

  for rec in
    select s.id route_stop_id,s.location_id,s.stop_order,l.latitude,l.longitude,l.name,l.geofence_radius_m
    from public.fleet_route_stops s
    join public.locations l on l.id=s.location_id
    where s.route_id=p_route_id and s.business_id=p_business_id and s.location_id is not null
    order by s.stop_order
  loop
    if rec.latitude is null or rec.longitude is null then continue; end if;
    radius:=greatest(25,least(coalesce(rec.geofence_radius_m,150),5000));
    select g.id into gid from public.business_geofences g
      where g.business_id=p_business_id and g.location_id=rec.location_id and coalesce(g.active,true)
      order by g.created_at desc limit 1;
    if gid is null then
      insert into public.business_geofences(business_id,location_id,radius_meters,notification_enabled,notification_payload,active)
      values(p_business_id,rec.location_id,radius,true,jsonb_build_object('source','fleet_route','route_id',p_route_id),true)
      returning id into gid;
    else
      update public.business_geofences set radius_meters=radius,notification_enabled=true,active=true where id=gid;
    end if;
    route_stop_id:=rec.route_stop_id;
    location_id:=rec.location_id;
    geofence_id:=gid;
    stop_order:=rec.stop_order;
    latitude:=rec.latitude;
    longitude:=rec.longitude;
    radius_meters:=radius;
    location_name:=rec.name;
    return next;
  end loop;
end;
$function$;

grant execute on function public.fleet_route_geofence_manifest(uuid,uuid) to authenticated, service_role;
