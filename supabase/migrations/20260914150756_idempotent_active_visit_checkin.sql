create or replace function public.kleenest_map_check_in(
  p_location_id uuid,
  p_lat double precision default null::double precision,
  p_lng double precision default null::double precision
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  cid uuid;
  loc record;
  distance_m double precision;
  radius_m double precision;
  v_last_check_id uuid;
  v_last_check timestamptz;
  v_last_check_metadata jsonb;
  v_last_departure timestamptz;
  v_today integer;
  v_review_used boolean := false;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_lat is null
     or p_lng is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED';
  end if;

  select
    id,
    latitude,
    longitude,
    coalesce(geofence_radius_m, 150)::double precision as radius_m
  into loc
  from public.locations
  where id = p_location_id
    and is_active = true
    and verification_status in ('pending'::public.verification_status, 'verified'::public.verification_status);

  if not found then
    raise exception 'LOCATION_NOT_VERIFIED';
  end if;

  if loc.latitude is null or loc.longitude is null then
    raise exception 'LOCATION_COORDINATES_UNAVAILABLE';
  end if;

  radius_m := greatest(25, least(coalesce(loc.radius_m, 150), 5000));

  distance_m := 6371000.0 * 2 * asin(
    sqrt(
      power(sin(radians(p_lat - loc.latitude) / 2), 2)
      + cos(radians(loc.latitude))
        * cos(radians(p_lat))
        * power(sin(radians(p_lng - loc.longitude) / 2), 2)
    )
  );

  if distance_m > radius_m then
    raise exception 'OUTSIDE_GEOFENCE: distance=% radius=%', round(distance_m), round(radius_m);
  end if;

  select c.id, c.checked_in_at, c.metadata
  into v_last_check_id, v_last_check, v_last_check_metadata
  from public.check_ins c
  where c.user_id = uid
    and c.location_id = p_location_id
  order by c.checked_in_at desc
  limit 1;

  if v_last_check is not null then
    select max(left_at)
    into v_last_departure
    from public.location_departures
    where user_id = uid
      and location_id = p_location_id
      and left_at > v_last_check;

    if v_last_departure is null then
      select exists(
        select 1
        from public.reviews r
        where r.user_id = uid
          and r.location_id = p_location_id
          and r.check_in_id = v_last_check_id
      ) into v_review_used;

      return jsonb_build_object(
        'success', true,
        'already_checked_in', true,
        'active_visit', true,
        'check_in_id', v_last_check_id,
        'checked_in_at', v_last_check,
        'review_ready', not v_review_used,
        'points_awarded', 0,
        'progression_eligible', coalesce(v_last_check_metadata->>'progression_eligible','false') = 'true',
        'distance_meters', distance_m,
        'geofence_radius_meters', radius_m
      );
    end if;
  end if;

  select count(*)::integer
  into v_today
  from public.point_transactions
  where user_id = uid
    and reason in ('check_in', 'review')
    and created_at >= date_trunc('day', now())
    and created_at < date_trunc('day', now()) + interval '1 day';

  if v_today >= 5 then
    raise exception 'DAILY_PROGRESSION_CAP_REACHED';
  end if;

  insert into public.check_ins(
    user_id,
    location_id,
    latitude,
    longitude,
    distance_meters,
    verification_method,
    points_awarded,
    metadata
  )
  values (
    uid,
    p_location_id,
    p_lat,
    p_lng,
    distance_m,
    'gps',
    10,
    jsonb_build_object(
      'source', 'home_geofence',
      'radius_meters', radius_m,
      'progression_eligible', true,
      'server_authoritative', true
    )
  )
  returning id into cid;

  return jsonb_build_object(
    'success', true,
    'already_checked_in', false,
    'active_visit', true,
    'check_in_id', cid,
    'checked_in_at', now(),
    'review_ready', true,
    'points_awarded', 10,
    'progression_eligible', true,
    'distance_meters', distance_m,
    'geofence_radius_meters', radius_m
  );
end;
$function$;

revoke all on function public.kleenest_map_check_in(uuid, double precision, double precision) from public, anon;
grant execute on function public.kleenest_map_check_in(uuid, double precision, double precision) to authenticated, service_role;