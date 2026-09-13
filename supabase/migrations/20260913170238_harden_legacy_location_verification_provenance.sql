
create unique index if not exists location_bathroom_verifications_user_location_uidx
  on public.location_bathroom_verifications(location_id,user_id);

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
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_location public.locations%rowtype;
  v_id uuid;
  v_existing uuid;
  v_distance double precision;
  v_check_in uuid;
  v_method text;
  v_positive integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_has_public_bathroom is null then raise exception 'Verification answer required'; end if;

  select * into v_location
  from public.locations
  where id=p_location_id and coalesce(is_active,true);

  if not found then raise exception 'Location not found or inactive'; end if;

  select id into v_existing
  from public.location_bathroom_verifications
  where location_id=p_location_id and user_id=v_user
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'verification_id',v_existing,
      'location_id',p_location_id,
      'duplicate',true,
      'projection_authority','process_bathroom_verification'
    );
  end if;

  if p_latitude is not null or p_longitude is not null then
    if p_latitude is null or p_longitude is null
       or p_latitude not between -90 and 90
       or p_longitude not between -180 and 180 then
      raise exception 'Valid latitude and longitude are required together';
    end if;
    if v_location.latitude is null or v_location.longitude is null then
      raise exception 'Location coordinates unavailable';
    end if;

    v_distance:=2*6371000*asin(
      sqrt(
        power(sin(radians(p_latitude-v_location.latitude)/2),2)
        + cos(radians(v_location.latitude))*cos(radians(p_latitude))
        * power(sin(radians(p_longitude-v_location.longitude)/2),2)
      )
    );

    if v_distance>coalesce(v_location.geofence_radius_m,150) then
      raise exception 'Verification must be within the location geofence';
    end if;
    v_method:='community_gps';
  else
    select c.id
      into v_check_in
    from public.check_ins c
    where c.user_id=v_user
      and c.location_id=p_location_id
      and c.checked_in_at>=now()-interval '2 hours'
      and lower(coalesce(c.verification_method,''))='gps'
    order by c.checked_in_at desc
    limit 1;

    if v_check_in is null then
      raise exception 'Nearby GPS or a recent GPS-verified check-in is required';
    end if;
    v_method:='verified_checkin';
  end if;

  insert into public.location_bathroom_verifications(
    location_id,user_id,has_public_bathroom,verification_method,
    latitude,longitude,distance_meters,check_in_id
  )
  values(
    p_location_id,v_user,p_has_public_bathroom,v_method,
    p_latitude,p_longitude,v_distance,v_check_in
  )
  returning id into v_id;

  select bathroom_positive_count into v_positive
  from public.locations
  where id=p_location_id;

  return jsonb_build_object(
    'verification_id',v_id,
    'location_id',p_location_id,
    'distance_meters',v_distance,
    'positive_verifications',v_positive,
    'verification_method',v_method,
    'projection_authority','process_bathroom_verification'
  );
end;
$$;

revoke all on function public.record_location_verification(uuid,boolean,double precision,double precision,text) from public,anon;
grant execute on function public.record_location_verification(uuid,boolean,double precision,double precision,text) to authenticated,service_role;
