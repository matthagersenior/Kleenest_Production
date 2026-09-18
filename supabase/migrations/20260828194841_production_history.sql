create or replace function public.kleenest_map_check_in(p_location_id uuid, p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare
  uid uuid:=auth.uid();
  cid uuid;
  result jsonb;
  loc record;
  distance_m double precision;
  radius_m double precision;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'LOCATION_REQUIRED'; end if;
  select id,latitude,longitude,coalesce(geofence_radius_m,150)::double precision radius_m
    into loc from public.locations where id=p_location_id and is_active=true;
  if not found then raise exception 'LOCATION_NOT_FOUND'; end if;
  if loc.latitude is null or loc.longitude is null then raise exception 'LOCATION_COORDINATES_UNAVAILABLE'; end if;
  radius_m:=greatest(25,least(coalesce(loc.radius_m,150),5000));
  distance_m:=6371000.0*2*asin(sqrt(power(sin(radians(p_lat-loc.latitude)/2),2)+cos(radians(loc.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-loc.longitude)/2),2)));
  if distance_m>radius_m then raise exception 'OUTSIDE_GEOFENCE: distance=% radius=%',round(distance_m),round(radius_m); end if;
  select id into cid from public.check_ins where user_id=uid and location_id=p_location_id and checked_in_at>now()-interval '10 minutes' order by checked_in_at desc limit 1;
  if cid is not null then
    select jsonb_build_object('success',true,'already_checked_in',true,'check_in_id',cid,'points_awarded',0,'distance_meters',distance_m,'geofence_radius_meters',radius_m) into result;
    return result;
  end if;
  insert into public.check_ins(user_id,location_id,latitude,longitude,distance_meters,verification_method,points_awarded,metadata)
    values(uid,p_location_id,p_lat,p_lng,distance_m,'gps',10,jsonb_build_object('source','home_geofence','radius_meters',radius_m))
    returning id into cid;
  -- Progression is intentionally owned by the canonical check_ins trigger chain.
  -- Do not award points or emit progression metrics here; doing so duplicates
  -- gamification/quest/reputation side effects for the same check-in.
  return jsonb_build_object('success',true,'check_in_id',cid,'points_awarded',10,'distance_meters',distance_m,'geofence_radius_meters',radius_m);
end;
$function$;
