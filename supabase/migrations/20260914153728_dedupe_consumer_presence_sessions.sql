with ranked as (
  select id,
         row_number() over(
           partition by user_id,location_id
           order by last_seen_at desc nulls last, occurred_at desc, id desc
         ) as rn
  from public.location_visits
  where departed_at is null
)
update public.location_visits v
set departed_at=coalesce(v.last_seen_at,v.occurred_at,now())
from ranked r
where v.id=r.id and r.rn>1;

create unique index if not exists ux_location_visits_one_open_per_user_location
  on public.location_visits(user_id,location_id)
  where departed_at is null;

CREATE OR REPLACE FUNCTION public.consumer_presence_heartbeat(p_lat double precision, p_lng double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  v_location record;
  v_visit public.location_visits%rowtype;
  v_open public.location_visits%rowtype;
  v_open_loc record;
  v_open_distance double precision;
  v_window interval := interval '60 minutes';
begin
  if uid is null then
    return jsonb_build_object('signed_in',false,'inside_geofence',false,'check_in_available',false);
  end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED';
  end if;

  select
    l.id,
    l.name,
    l.latitude,
    l.longitude,
    greatest(25,least(coalesce(l.geofence_radius_m,150),5000))::double precision as radius_m,
    6371000.0 * 2 * asin(
      sqrt(
        power(sin(radians(p_lat-l.latitude)/2),2)
        + cos(radians(l.latitude))*cos(radians(p_lat))
          * power(sin(radians(p_lng-l.longitude)/2),2)
      )
    ) as distance_m
  into v_location
  from public.locations l
  where l.is_active=true
    and l.verification_status in ('pending'::public.verification_status,'verified'::public.verification_status)
    and l.latitude is not null
    and l.longitude is not null
    and 6371000.0 * 2 * asin(
      sqrt(
        power(sin(radians(p_lat-l.latitude)/2),2)
        + cos(radians(l.latitude))*cos(radians(p_lat))
          * power(sin(radians(p_lng-l.longitude)/2),2)
      )
    ) <= greatest(25,least(coalesce(l.geofence_radius_m,150),5000))
  order by distance_m asc
  limit 1;

  perform pg_advisory_xact_lock(
    hashtextextended(uid::text || ':' || coalesce(v_location.id::text,'none'),0)
  );

  select *
  into v_open
  from public.location_visits
  where user_id=uid
    and departed_at is null
    and last_seen_at is not null
  order by last_seen_at desc
  limit 1;

  if v_open.id is not null and (v_location.id is null or v_open.location_id is distinct from v_location.id) then
    select
      l.latitude,
      l.longitude,
      greatest(25,least(coalesce(l.geofence_radius_m,150),5000))::double precision as radius_m
    into v_open_loc
    from public.locations l
    where l.id=v_open.location_id;

    if v_open_loc.latitude is not null and v_open_loc.longitude is not null then
      v_open_distance := 6371000.0 * 2 * asin(
        sqrt(
          power(sin(radians(p_lat-v_open_loc.latitude)/2),2)
          + cos(radians(v_open_loc.latitude))*cos(radians(p_lat))
            * power(sin(radians(p_lng-v_open_loc.longitude)/2),2)
        )
      );

      if v_open_distance > v_open_loc.radius_m then
        update public.location_visits
        set departed_at=coalesce(departed_at,now())
        where id=v_open.id;

        if not exists(
          select 1
          from public.location_departures d
          where d.user_id=uid
            and d.location_id=v_open.location_id
            and d.left_at>=coalesce(v_open.last_seen_at,v_open.occurred_at)
        ) then
          insert into public.location_departures(user_id,location_id,left_at,latitude,longitude,distance_meters)
          values(uid,v_open.location_id,now(),p_lat,p_lng,v_open_distance);
        end if;
      end if;
    end if;
  end if;

  if v_location.id is null then
    select *
    into v_visit
    from public.location_visits
    where user_id=uid
      and verification_expires_at>=now()
    order by last_seen_at desc nulls last, occurred_at desc
    limit 1;

    return jsonb_build_object(
      'signed_in',true,
      'inside_geofence',false,
      'check_in_available',v_visit.id is not null,
      'visit_id',v_visit.id,
      'location_id',v_visit.location_id,
      'entered_at',v_visit.occurred_at,
      'last_seen_at',v_visit.last_seen_at,
      'departed_at',v_visit.departed_at,
      'verification_expires_at',v_visit.verification_expires_at,
      'verification_window_minutes',60
    );
  end if;

  select *
  into v_visit
  from public.location_visits
  where user_id=uid
    and location_id=v_location.id
    and departed_at is null
  order by occurred_at desc
  limit 1;

  if v_visit.id is null then
    insert into public.location_visits(
      user_id,location_id,occurred_at,context,
      last_seen_at,verification_expires_at,
      entry_latitude,entry_longitude,entry_distance_meters,
      last_latitude,last_longitude,last_distance_meters
    )
    values(
      uid,v_location.id,now(),
      jsonb_build_object(
        'source','consumer_presence_heartbeat',
        'presence_verified',true,
        'auto_check_in',false,
        'server_authoritative',true,
        'verification_window_minutes',60
      ),
      now(),now()+v_window,
      p_lat,p_lng,v_location.distance_m,
      p_lat,p_lng,v_location.distance_m
    )
    on conflict (user_id,location_id) where departed_at is null
    do update set
      last_seen_at=excluded.last_seen_at,
      verification_expires_at=excluded.verification_expires_at,
      last_latitude=excluded.last_latitude,
      last_longitude=excluded.last_longitude,
      last_distance_meters=excluded.last_distance_meters,
      context=coalesce(public.location_visits.context,'{}'::jsonb)||excluded.context
    returning * into v_visit;
  else
    update public.location_visits
    set last_seen_at=now(),
        verification_expires_at=now()+v_window,
        last_latitude=p_lat,
        last_longitude=p_lng,
        last_distance_meters=v_location.distance_m,
        context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
          'presence_verified',true,
          'auto_check_in',false,
          'server_authoritative',true,
          'verification_window_minutes',60
        )
    where id=v_visit.id
    returning * into v_visit;
  end if;

  return jsonb_build_object(
    'signed_in',true,
    'inside_geofence',true,
    'check_in_available',true,
    'visit_id',v_visit.id,
    'location_id',v_visit.location_id,
    'location_name',v_location.name,
    'entered_at',v_visit.occurred_at,
    'last_seen_at',v_visit.last_seen_at,
    'departed_at',v_visit.departed_at,
    'verification_expires_at',v_visit.verification_expires_at,
    'verification_window_minutes',60,
    'distance_meters',v_location.distance_m,
    'geofence_radius_meters',v_location.radius_m
  );
end;
$function$
