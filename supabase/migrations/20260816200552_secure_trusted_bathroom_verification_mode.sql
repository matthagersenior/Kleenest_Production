create or replace function public.record_bathroom_verification(p_location_id uuid, p_has_public_bathroom boolean, p_lat double precision, p_lng double precision, p_distance_meters double precision default null::double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  l public.locations%rowtype;
  dist double precision;
  already boolean;
  status text;
  awarded integer := 0;
  reason text;
  eligible_direct boolean := false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_has_public_bathroom is null then raise exception 'Verification answer required'; end if;
  select * into l from public.locations where id=p_location_id for update;
  if not found then raise exception 'Location not found'; end if;
  eligible_direct := lower(coalesce((select account_level::text from public.profiles where id=uid),'standard')) in ('premium','pro','growth','enterprise')
    or exists (select 1 from public.business_memberships bm where bm.user_id=uid and bm.business_id=l.business_id and lower(bm.role::text) in ('owner','admin','manager'));
  if not eligible_direct then raise exception 'Trusted verification requires an eligible account or business role'; end if;
  if coalesce(l.bathroom_verification_status,'unverified') <> 'unverified' then return jsonb_build_object('status',l.bathroom_verification_status,'already_verified',true,'points_awarded',0); end if;
  select exists(select 1 from public.location_bathroom_verifications where location_id=p_location_id and user_id=uid) into already;
  if already then return jsonb_build_object('status','unverified','already_answered',true,'points_awarded',0); end if;
  if p_lat is null or p_lng is null then raise exception 'GPS location required'; end if;
  dist := coalesce(p_distance_meters,2*6371000*asin(sqrt(power(sin(radians(p_lat-coalesce(l.latitude,0))/2),2)+cos(radians(coalesce(l.latitude,0)))*cos(radians(p_lat))*power(sin(radians(p_lng-coalesce(l.longitude,0))/2),2))));
  if dist > coalesce(l.geofence_radius_m,150) then raise exception 'You must be within the location geofence to verify it'; end if;
  insert into public.location_bathroom_verifications(location_id,user_id,has_public_bathroom,verification_method,latitude,longitude,distance_meters)
    values(p_location_id,uid,p_has_public_bathroom,'gps_trusted',p_lat,p_lng,dist);
  if p_has_public_bathroom then
    status:='verified'; awarded:=10; reason:='bathroom_verification';
    update public.locations set bathroom_verification_count=coalesce(bathroom_verification_count,0)+1,bathroom_positive_count=coalesce(bathroom_positive_count,0)+1,bathroom_verification_status='verified',bathroom_verified_at=now(),bathroom_verified_by=uid,bathroom_verification_source='trusted' where id=p_location_id;
    insert into public.location_verification_points(user_id,location_id,points,reason) values(uid,p_location_id,10,reason);
    update public.profiles set points=coalesce(points,0)+10 where id=uid;
  else
    status:='no_bathroom';
    update public.locations set bathroom_verification_count=coalesce(bathroom_verification_count,0)+1,bathroom_negative_count=coalesce(bathroom_negative_count,0)+1,bathroom_verification_status='no_bathroom',bathroom_verified_at=now(),bathroom_verified_by=uid,bathroom_verification_source='trusted' where id=p_location_id;
  end if;
  return jsonb_build_object('status',status,'verified',p_has_public_bathroom,'points_awarded',awarded,'verification_once',true,'distance_meters',dist,'mode','trusted');
end;
$function$;
