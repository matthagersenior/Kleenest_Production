create or replace function public.verify_checkin(p_qr_code text, p_lat double precision default null, p_lng double precision default null)
returns public.check_ins
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
declare
  v_qr public.qr_codes%rowtype;
  v_loc public.locations%rowtype;
  v_place_id uuid;
  v_result jsonb;
  v_check public.check_ins%rowtype;
  v_distance double precision;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED';
  end if;
  select * into v_qr from public.qr_codes where code=trim(p_qr_code) and active=true limit 1;
  if not found then raise exception 'Invalid or inactive QR code'; end if;
  select * into v_loc from public.locations where id=v_qr.location_id and is_active=true and verification_status='verified';
  if not found then raise exception 'Location is not currently available for check-in'; end if;
  if v_loc.latitude is null or v_loc.longitude is null then raise exception 'LOCATION_COORDINATES_UNAVAILABLE'; end if;
  v_distance:=6371000.0*2*asin(sqrt(power(sin(radians(p_lat-v_loc.latitude)/2),2)+cos(radians(v_loc.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-v_loc.longitude)/2),2)));
  if v_distance>greatest(25,least(coalesce(v_loc.geofence_radius_m,150),5000)) then
    raise exception 'OUTSIDE_GEOFENCE: distance=% radius=%',round(v_distance),round(greatest(25,least(coalesce(v_loc.geofence_radius_m,150),5000)));
  end if;
  select id into v_place_id from public.places where location_id=v_loc.id and is_active=true order by created_at asc nulls last limit 1;
  if v_place_id is null then raise exception 'No active place is configured for this location'; end if;
  v_result:=public.create_check_in(v_place_id,trim(p_qr_code));
  select * into v_check from public.check_ins where id=(v_result->>'check_in_id')::uuid;
  return v_check;
end
$function$;

revoke execute on function public.create_check_in(uuid,text) from authenticated;
revoke execute on function public.create_check_in(uuid,text) from anon;
