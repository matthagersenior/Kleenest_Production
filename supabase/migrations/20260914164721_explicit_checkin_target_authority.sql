create or replace function public.kleenest_map_check_in(
  p_location_id uuid,
  p_lat double precision default null::double precision,
  p_lng double precision default null::double precision
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  cid uuid;
  loc record;
  distance_m double precision;
  radius_m double precision;
  proof_lat double precision;
  proof_lng double precision;
  proof_distance double precision;
  v_presence public.location_visits%rowtype;
  v_other record;
  v_other_distance double precision;
  v_last_check record;
  v_review_used boolean := false;
  v_progression_eligible boolean := false;
  v_progression_cap_reached boolean := false;
  v_today integer := 0;
  v_points_awarded integer := 0;
  v_checked_in_at timestamptz;
  v_window interval := interval '60 minutes';
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_location_id is null then raise exception 'LOCATION_REQUIRED'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED';
  end if;

  select
    id,
    latitude,
    longitude,
    greatest(25,least(coalesce(geofence_radius_m,150),5000))::double precision as radius_m
  into loc
  from public.locations
  where id=p_location_id
    and is_active=true
    and verification_status in ('pending'::public.verification_status,'verified'::public.verification_status);

  if not found then raise exception 'LOCATION_NOT_VERIFIED'; end if;
  if loc.latitude is null or loc.longitude is null then raise exception 'LOCATION_COORDINATES_UNAVAILABLE'; end if;

  radius_m:=loc.radius_m;
  distance_m:=6371000.0*2*asin(sqrt(
    power(sin(radians(p_lat-loc.latitude)/2),2)
    +cos(radians(loc.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-loc.longitude)/2),2)
  ));

  perform pg_advisory_xact_lock(
    hashtextextended('kleenest:checkin:'||uid::text||':'||p_location_id::text,0)
  );

  if distance_m<=radius_m then
    select *
    into v_presence
    from public.location_visits
    where user_id=uid
      and location_id=p_location_id
      and departed_at is null
    order by last_seen_at desc nulls last, occurred_at desc
    limit 1;

    if v_presence.id is null then
      insert into public.location_visits(
        user_id,location_id,occurred_at,context,
        last_seen_at,verification_expires_at,
        entry_latitude,entry_longitude,entry_distance_meters,
        last_latitude,last_longitude,last_distance_meters
      )
      values(
        uid,p_location_id,now(),
        jsonb_build_object(
          'source','explicit_check_in',
          'explicit_target',true,
          'presence_verified',true,
          'auto_check_in',false,
          'server_authoritative',true,
          'verification_window_minutes',60
        ),
        now(),now()+v_window,
        p_lat,p_lng,distance_m,
        p_lat,p_lng,distance_m
      )
      on conflict (user_id,location_id) where departed_at is null
      do update set
        last_seen_at=excluded.last_seen_at,
        verification_expires_at=excluded.verification_expires_at,
        last_latitude=excluded.last_latitude,
        last_longitude=excluded.last_longitude,
        last_distance_meters=excluded.last_distance_meters,
        context=coalesce(public.location_visits.context,'{}'::jsonb)||excluded.context
      returning * into v_presence;
    else
      update public.location_visits
      set last_seen_at=now(),
          verification_expires_at=now()+v_window,
          last_latitude=p_lat,
          last_longitude=p_lng,
          last_distance_meters=distance_m,
          context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
            'source','explicit_check_in',
            'explicit_target',true,
            'presence_verified',true,
            'auto_check_in',false,
            'server_authoritative',true,
            'verification_window_minutes',60
          )
      where id=v_presence.id
      returning * into v_presence;
    end if;

    for v_other in
      select
        v.id,
        v.location_id,
        v.last_seen_at,
        v.occurred_at,
        l.latitude,
        l.longitude,
        greatest(25,least(coalesce(l.geofence_radius_m,150),5000))::double precision as radius_m
      from public.location_visits v
      join public.locations l on l.id=v.location_id
      where v.user_id=uid
        and v.departed_at is null
        and v.location_id<>p_location_id
        and l.latitude is not null
        and l.longitude is not null
    loop
      v_other_distance:=6371000.0*2*asin(sqrt(
        power(sin(radians(p_lat-v_other.latitude)/2),2)
        +cos(radians(v_other.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-v_other.longitude)/2),2)
      ));

      if v_other_distance>v_other.radius_m then
        update public.location_visits
        set departed_at=coalesce(departed_at,now())
        where id=v_other.id;

        if not exists(
          select 1
          from public.location_departures d
          where d.user_id=uid
            and d.location_id=v_other.location_id
            and d.left_at>=coalesce(v_other.last_seen_at,v_other.occurred_at)
        ) then
          insert into public.location_departures(
            user_id,location_id,left_at,latitude,longitude,distance_meters
          )
          values(uid,v_other.location_id,now(),p_lat,p_lng,v_other_distance);
        end if;
      end if;
    end loop;
  else
    select *
    into v_presence
    from public.location_visits
    where user_id=uid
      and location_id=p_location_id
      and verification_expires_at>=now()
    order by last_seen_at desc nulls last, occurred_at desc
    limit 1;
  end if;

  if distance_m>radius_m and v_presence.id is null then
    raise exception 'OUTSIDE_GEOFENCE';
  end if;

  select c.id,c.checked_in_at,c.metadata
  into v_last_check
  from public.check_ins c
  where c.user_id=uid
    and c.location_id=p_location_id
    and (
      c.metadata->>'presence_visit_id'=v_presence.id::text
      or (
        c.checked_in_at>=v_presence.occurred_at-interval '15 minutes'
        and c.checked_in_at<=coalesce(v_presence.departed_at,now()+interval '1 minute')
        and not exists(
          select 1
          from public.location_departures d
          where d.user_id=uid
            and d.location_id=p_location_id
            and d.left_at>c.checked_in_at
            and d.left_at<=coalesce(v_presence.departed_at,now())
        )
      )
    )
  order by c.checked_in_at desc
  limit 1;

  if v_last_check.id is not null then
    if nullif(v_last_check.metadata->>'presence_visit_id','') is null then
      update public.check_ins
      set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'presence_visit_id',v_presence.id,
        'verification_expires_at',v_presence.verification_expires_at,
        'verification_window_minutes',60,
        'server_authoritative',true
      )
      where id=v_last_check.id;
    end if;

    select exists(
      select 1
      from public.reviews r
      where r.user_id=uid
        and r.location_id=p_location_id
        and r.check_in_id=v_last_check.id
    ) into v_review_used;

    return jsonb_build_object(
      'success',true,
      'already_checked_in',true,
      'active_visit',v_presence.departed_at is null,
      'inside_geofence',distance_m<=radius_m,
      'check_in_available',true,
      'check_in_id',v_last_check.id,
      'checked_in_at',v_last_check.checked_in_at,
      'presence_visit_id',v_presence.id,
      'entered_at',v_presence.occurred_at,
      'last_seen_at',v_presence.last_seen_at,
      'verification_expires_at',v_presence.verification_expires_at,
      'verification_window_minutes',60,
      'review_ready',not v_review_used,
      'points_awarded',0,
      'progression_eligible',coalesce(v_last_check.metadata->>'progression_eligible','false')='true',
      'distance_meters',coalesce(v_presence.last_distance_meters,distance_m),
      'geofence_radius_meters',radius_m
    );
  end if;

  select count(*)::integer
  into v_today
  from public.point_transactions
  where user_id=uid
    and reason in ('check_in','review')
    and created_at>=date_trunc('day',now())
    and created_at<date_trunc('day',now())+interval '1 day';

  v_progression_cap_reached:=v_today>=5;
  v_progression_eligible:=public.is_qualifying_return_visit(uid,p_location_id,now(),null);

  proof_lat:=case when distance_m<=radius_m then p_lat else v_presence.last_latitude end;
  proof_lng:=case when distance_m<=radius_m then p_lng else v_presence.last_longitude end;
  proof_distance:=case when distance_m<=radius_m then distance_m else v_presence.last_distance_meters end;

  if proof_lat is null or proof_lng is null or proof_distance is null then
    raise exception 'PRESENCE_PROOF_UNAVAILABLE';
  end if;

  insert into public.check_ins(
    user_id,location_id,latitude,longitude,distance_meters,
    verification_method,points_awarded,metadata
  )
  values(
    uid,p_location_id,proof_lat,proof_lng,proof_distance,
    'gps',case when v_progression_eligible then 10 else 0 end,
    jsonb_build_object(
      'source',case when distance_m<=radius_m then 'explicit_live_geofence' else 'recent_presence_window' end,
      'presence_visit_id',v_presence.id,
      'verification_expires_at',v_presence.verification_expires_at,
      'verification_window_minutes',60,
      'current_distance_meters',distance_m,
      'radius_meters',radius_m,
      'progression_eligible',v_progression_eligible,
      'progression_cap_reached',v_progression_cap_reached,
      'server_authoritative',true
    )
  )
  returning id,points_awarded,checked_in_at
  into cid,v_points_awarded,v_checked_in_at;

  return jsonb_build_object(
    'success',true,
    'already_checked_in',false,
    'active_visit',v_presence.departed_at is null,
    'inside_geofence',distance_m<=radius_m,
    'check_in_available',true,
    'check_in_id',cid,
    'checked_in_at',v_checked_in_at,
    'presence_visit_id',v_presence.id,
    'entered_at',v_presence.occurred_at,
    'last_seen_at',v_presence.last_seen_at,
    'verification_expires_at',v_presence.verification_expires_at,
    'verification_window_minutes',60,
    'verified_from',case when distance_m<=radius_m then 'explicit_live_geofence' else 'recent_presence_window' end,
    'review_ready',true,
    'points_awarded',v_points_awarded,
    'progression_eligible',v_points_awarded>0,
    'progression_cap_reached',v_progression_cap_reached,
    'distance_meters',proof_distance,
    'geofence_radius_meters',radius_m
  );
end;
$function$;

revoke all on function public.kleenest_map_check_in(uuid,double precision,double precision) from public,anon;
grant execute on function public.kleenest_map_check_in(uuid,double precision,double precision) to authenticated,service_role;
