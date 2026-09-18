-- Resolve authority conflict #5: one writer for location bathroom verification projections.
-- INSERT into location_bathroom_verifications is the event authority.
-- process_bathroom_verification() owns location aggregate/state mutation.
-- gamification_activity_trigger() owns user reward points.

create or replace function public.record_bathroom_verification(
  p_location_id uuid,
  p_has_public_bathroom boolean,
  p_lat double precision,
  p_lng double precision,
  p_distance_meters double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.locations%rowtype;
  dist double precision;
  already boolean;
  status text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_has_public_bathroom is null then raise exception 'Verification answer required'; end if;

  select * into l from public.locations where id=p_location_id;
  if not found then raise exception 'Location not found'; end if;

  if lower(coalesce((select account_level::text from public.profiles where id=uid),'standard')) not in ('premium','pro','growth','enterprise')
     and not exists (
       select 1 from public.business_memberships bm
       where bm.user_id=uid and bm.business_id=l.business_id
         and lower(bm.role::text) in ('owner','admin','manager')
     ) then
    raise exception 'Trusted verification requires an eligible account or business role';
  end if;

  if coalesce(l.bathroom_verification_status,'unverified') <> 'unverified' then
    return jsonb_build_object('status',l.bathroom_verification_status,'already_verified',true,'points_awarded',0);
  end if;

  select exists(
    select 1 from public.location_bathroom_verifications
    where location_id=p_location_id and user_id=uid
  ) into already;
  if already then
    return jsonb_build_object('status','unverified','already_answered',true,'points_awarded',0);
  end if;

  if p_lat is null or p_lng is null then raise exception 'GPS location required'; end if;
  dist := coalesce(p_distance_meters,
    2*6371000*asin(sqrt(
      power(sin(radians(p_lat-coalesce(l.latitude,0))/2),2)+
      cos(radians(coalesce(l.latitude,0)))*cos(radians(p_lat))*
      power(sin(radians(p_lng-coalesce(l.longitude,0))/2),2)
    ))
  );
  if dist > coalesce(l.geofence_radius_m,150) then
    raise exception 'You must be within the location geofence to verify it';
  end if;

  insert into public.location_bathroom_verifications(
    location_id,user_id,has_public_bathroom,verification_method,latitude,longitude,distance_meters
  ) values (p_location_id,uid,p_has_public_bathroom,'gps_trusted',p_lat,p_lng,dist);

  select bathroom_verification_status into status
  from public.locations where id=p_location_id;

  return jsonb_build_object(
    'status',status,
    'verified',p_has_public_bathroom,
    'verification_once',true,
    'distance_meters',dist,
    'mode','trusted',
    'points_authority','gamification_activity_trigger'
  );
end;
$$;

create or replace function public.record_location_verification(
  p_location_id uuid,
  p_has_public_bathroom boolean,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_method text default 'community'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_distance double precision;
  v_positive integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if p_latitude is not null and p_longitude is not null then
    select st_distance(l.geom,st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography)
      into v_distance
    from public.locations l where l.id=p_location_id;
    if v_distance is not null and v_distance>1000 then
      raise exception 'Verification must be within 1 km of the location';
    end if;
  end if;

  insert into public.location_bathroom_verifications(
    location_id,user_id,has_public_bathroom,verification_method,latitude,longitude,distance_meters
  ) values (
    p_location_id,v_user,p_has_public_bathroom,coalesce(p_method,'community'),p_latitude,p_longitude,v_distance
  ) returning id into v_id;

  select bathroom_positive_count into v_positive
  from public.locations where id=p_location_id;

  return jsonb_build_object(
    'verification_id',v_id,
    'location_id',p_location_id,
    'distance_meters',v_distance,
    'positive_verifications',v_positive,
    'projection_authority','process_bathroom_verification'
  );
end;
$$;

create or replace function public.submit_location_verification(
  p_location_id uuid,
  p_is_open boolean,
  p_has_bathroom boolean default true,
  p_note text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_verification_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  v_status := case when p_is_open then 'open' else 'closed' end;

  insert into public.restroom_observations(
    location_id,user_id,observation_type,note,source,confidence
  ) values (
    p_location_id,v_user,v_status,p_note,'community_verification',1.0
  );

  insert into public.location_bathroom_verifications(
    location_id,user_id,has_public_bathroom,verification_method
  ) values (
    p_location_id,v_user,p_has_bathroom,'community_verification'
  ) returning id into v_verification_id;

  return jsonb_build_object(
    'location_id',p_location_id,
    'open',p_is_open,
    'has_bathroom',p_has_bathroom,
    'verification_id',v_verification_id,
    'projection_authority','process_bathroom_verification',
    'reward_authority','gamification_activity_trigger'
  );
end;
$$;
