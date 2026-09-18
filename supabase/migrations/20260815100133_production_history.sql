create or replace function public.record_bathroom_verification(p_location_id uuid, p_has_public_bathroom boolean, p_lat double precision, p_lng double precision, p_distance_meters double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.locations%rowtype;
  premium boolean := false;
  owner boolean := false;
  pos integer := 0;
  total integer := 0;
  status text;
  awarded integer := 0;
  reason text;
  voter record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into l from public.locations where id=p_location_id;
  if not found then raise exception 'Location not found'; end if;

  -- Bathroom verification is a one-time positive verification. A negative vote is not a verification event.
  if coalesce(l.bathroom_verification_status,'unverified') = 'verified' then
    raise exception 'This location has already been verified';
  end if;
  if p_has_public_bathroom is not true then
    raise exception 'Verification only confirms that a public bathroom exists';
  end if;

  if p_lat is null or p_lng is null then raise exception 'GPS location required'; end if;
  if p_distance_meters is null then
    p_distance_meters := 2*6371000*asin(sqrt(power(sin(radians(p_lat-l.latitude)/2),2)+cos(radians(l.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-l.longitude)/2),2)));
  end if;
  if p_distance_meters > coalesce(l.geofence_radius_m,100) then raise exception 'You must be at this location to verify it'; end if;

  select exists(select 1 from public.profiles p where p.id=uid and lower(p.subscription_tier::text) in ('premium','pro','growth','enterprise')) into premium;
  select exists(select 1 from public.business_members bm where bm.business_id=l.business_id and bm.user_id=uid and lower(bm.role::text) in ('owner','admin','manager'))
      or exists(select 1 from public.app_business_memberships abm where abm.business_id=l.business_id and abm.user_id=uid and lower(abm.role::text) in ('owner','admin','manager'))
      or exists(select 1 from public.profiles p where p.id=uid and p.is_admin=true)
    into owner;

  if exists(select 1 from public.location_bathroom_verifications v where v.location_id=p_location_id and v.user_id=uid) then
    raise exception 'You already verified this location';
  end if;

  if owner then
    status := 'verified';
    awarded := 0;
    reason := 'business_owner_bathroom_verification';
  elsif premium then
    status := 'verified';
    awarded := 15;
    reason := 'premium_bathroom_verification';
  else
    insert into public.location_bathroom_verifications(location_id,user_id,has_public_bathroom,verification_method,latitude,longitude,distance_meters)
    values(p_location_id,uid,true,'gps_community',p_lat,p_lng,p_distance_meters);
    select count(*) into pos from public.location_bathroom_verifications where location_id=p_location_id and has_public_bathroom=true;
    total := pos;
    if pos < 3 then
      status := 'pending';
      awarded := 0;
      reason := 'community_bathroom_verification_pending';
    else
      status := 'verified';
      -- Award the finalizing verifier and the two earlier free verifiers; each location can only produce this award once.
      awarded := 10;
      reason := 'community_bathroom_verification_completed';
      for voter in select user_id from public.location_bathroom_verifications where location_id=p_location_id and has_public_bathroom=true order by created_at asc limit 3 loop
        if not exists(select 1 from public.location_verification_points vp where vp.location_id=p_location_id and vp.user_id=voter.user_id and vp.reason='community_bathroom_verification_completed') then
          insert into public.location_verification_points(user_id,location_id,points,reason) values(voter.user_id,p_location_id,10,reason);
          update public.profiles set points=coalesce(points,0)+10 where id=voter.user_id;
        end if;
      end loop;
    end if;
  end if;

  if owner or premium then
    insert into public.location_bathroom_verifications(location_id,user_id,has_public_bathroom,verification_method,latitude,longitude,distance_meters)
    values(p_location_id,uid,true,case when owner then 'business_owner_or_admin' else 'gps_premium' end,p_lat,p_lng,p_distance_meters);
    total := (select count(*) from public.location_bathroom_verifications where location_id=p_location_id and has_public_bathroom=true);
    pos := total;
    if awarded > 0 then
      insert into public.location_verification_points(user_id,location_id,points,reason) values(uid,p_location_id,awarded,reason);
      update public.profiles set points=coalesce(points,0)+awarded where id=uid;
    end if;
  end if;

  update public.locations set bathroom_verification_count=total,bathroom_positive_count=pos,bathroom_negative_count=0,bathroom_verification_status=status,bathroom_verified_at=case when status='verified' then coalesce(bathroom_verified_at,now()) else bathroom_verified_at end where id=p_location_id;
  return jsonb_build_object('status',status,'verified',status='verified','positive',pos,'total',total,'points_awarded',awarded,'verification_once',true);
end;
$$;
