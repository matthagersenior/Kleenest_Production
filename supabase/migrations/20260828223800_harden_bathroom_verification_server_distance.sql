create or replace function public.record_bathroom_verification(p_location_id uuid, p_has_public_bathroom boolean, p_lat double precision, p_lng double precision, p_distance_meters double precision default null) returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare uid uuid := auth.uid(); l public.locations%rowtype; dist double precision; already boolean; status text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_has_public_bathroom is null then raise exception 'Verification answer required'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Valid GPS location required'; end if;
  select * into l from public.locations where id=p_location_id;
  if not found then raise exception 'Location not found'; end if;
  if l.latitude is null or l.longitude is null then raise exception 'Location coordinates unavailable for trusted verification'; end if;
  if lower(coalesce((select account_level::text from public.profiles where id=uid),'standard')) not in ('premium','pro','growth','enterprise') and not exists (select 1 from public.business_memberships bm where bm.user_id=uid and bm.business_id=l.business_id and lower(bm.role::text) in ('owner','admin','manager')) then raise exception 'Trusted verification requires an eligible account or business role'; end if;
  if coalesce(l.bathroom_verification_status,'unverified') <> 'unverified' then return jsonb_build_object('status',l.bathroom_verification_status,'already_verified',true,'points_awarded',0); end if;
  select exists(select 1 from public.location_bathroom_verifications where location_id=p_location_id and user_id=uid) into already;
  if already then return jsonb_build_object('status','unverified','already_answered',true,'points_awarded',0); end if;
  dist := 2*6371000*asin(sqrt(power(sin(radians(p_lat-l.latitude)/2),2)+cos(radians(l.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-l.longitude)/2),2)));
  if dist > coalesce(l.geofence_radius_m,150) then raise exception 'You must be within the location geofence to verify it'; end if;
  insert into public.location_bathroom_verifications(location_id,user_id,has_public_bathroom,verification_method,latitude,longitude,distance_meters) values(p_location_id,uid,p_has_public_bathroom,'gps_trusted',p_lat,p_lng,dist);
  select bathroom_verification_status into status from public.locations where id=p_location_id;
  return jsonb_build_object('status',status,'verified',p_has_public_bathroom,'verification_once',true,'distance_meters',dist,'mode','trusted','points_authority','gamification_activity_trigger');
end;
$function$;
