alter table public.location_visits
  add column if not exists last_seen_at timestamptz,
  add column if not exists verification_expires_at timestamptz,
  add column if not exists departed_at timestamptz,
  add column if not exists entry_latitude double precision,
  add column if not exists entry_longitude double precision,
  add column if not exists entry_distance_meters double precision,
  add column if not exists last_latitude double precision,
  add column if not exists last_longitude double precision,
  add column if not exists last_distance_meters double precision;

update public.location_visits
set last_seen_at = coalesce(last_seen_at, occurred_at),
    verification_expires_at = coalesce(verification_expires_at, occurred_at + interval '60 minutes')
where last_seen_at is null or verification_expires_at is null;

create index if not exists idx_location_visits_user_location_presence
  on public.location_visits(user_id, location_id, occurred_at desc);

create index if not exists idx_location_visits_user_verification_window
  on public.location_visits(user_id, verification_expires_at desc)
  where verification_expires_at is not null;

create or replace function public.consumer_presence_heartbeat(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions', 'pg_temp'
as $function$
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
$function$;

create or replace function public.consumer_location_presence(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  v_visit public.location_visits%rowtype;
begin
  if uid is null then
    return jsonb_build_object('signed_in',false,'check_in_available',false);
  end if;

  select *
  into v_visit
  from public.location_visits
  where user_id=uid
    and location_id=p_location_id
    and verification_expires_at>=now()
  order by last_seen_at desc nulls last, occurred_at desc
  limit 1;

  if v_visit.id is null then
    return jsonb_build_object(
      'signed_in',true,
      'location_id',p_location_id,
      'check_in_available',false
    );
  end if;

  return jsonb_build_object(
    'signed_in',true,
    'location_id',p_location_id,
    'visit_id',v_visit.id,
    'inside_geofence',v_visit.departed_at is null,
    'check_in_available',true,
    'entered_at',v_visit.occurred_at,
    'last_seen_at',v_visit.last_seen_at,
    'departed_at',v_visit.departed_at,
    'verification_expires_at',v_visit.verification_expires_at,
    'verification_window_minutes',60,
    'entry_distance_meters',v_visit.entry_distance_meters,
    'last_distance_meters',v_visit.last_distance_meters
  );
end;
$function$;

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
  proof_lat double precision;
  proof_lng double precision;
  proof_distance double precision;
  v_presence public.location_visits%rowtype;
  v_last_check record;
  v_today integer;
  v_presence_payload jsonb;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED';
  end if;

  select
    id,latitude,longitude,
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

  if distance_m<=radius_m then
    v_presence_payload:=public.consumer_presence_heartbeat(p_lat,p_lng);
  end if;

  select *
  into v_presence
  from public.location_visits
  where user_id=uid
    and location_id=p_location_id
    and verification_expires_at>=now()
  order by last_seen_at desc nulls last, occurred_at desc
  limit 1;

  if distance_m>radius_m and v_presence.id is null then
    raise exception 'OUTSIDE_GEOFENCE';
  end if;

  if v_presence.id is not null then
    select c.id,c.checked_in_at,c.metadata
    into v_last_check
    from public.check_ins c
    where c.user_id=uid
      and c.location_id=p_location_id
      and (
        c.metadata->>'presence_visit_id'=v_presence.id::text
        or (
          c.checked_in_at>=v_presence.occurred_at-interval '15 minutes'
          and not exists(
            select 1 from public.location_departures d
            where d.user_id=uid and d.location_id=p_location_id and d.left_at>c.checked_in_at
          )
        )
      )
    order by c.checked_in_at desc
    limit 1;

    if v_last_check.id is not null then
      return jsonb_build_object(
        'success',true,
        'already_checked_in',true,
        'active_visit',v_presence.departed_at is null,
        'check_in_available',true,
        'check_in_id',v_last_check.id,
        'checked_in_at',v_last_check.checked_in_at,
        'presence_visit_id',v_presence.id,
        'verification_expires_at',v_presence.verification_expires_at,
        'verification_window_minutes',60,
        'points_awarded',0,
        'progression_eligible',coalesce(v_last_check.metadata->>'progression_eligible','false')='true',
        'distance_meters',coalesce(v_presence.last_distance_meters,distance_m),
        'geofence_radius_meters',radius_m
      );
    end if;
  end if;

  select count(*)::integer
  into v_today
  from public.point_transactions
  where user_id=uid
    and reason in ('check_in','review')
    and created_at>=date_trunc('day',now())
    and created_at<date_trunc('day',now())+interval '1 day';

  if v_today>=5 then raise exception 'DAILY_PROGRESSION_CAP_REACHED'; end if;

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
    'gps',10,
    jsonb_build_object(
      'source',case when distance_m<=radius_m then 'live_geofence' else 'recent_presence_window' end,
      'presence_visit_id',v_presence.id,
      'verification_expires_at',v_presence.verification_expires_at,
      'verification_window_minutes',60,
      'current_distance_meters',distance_m,
      'radius_meters',radius_m,
      'progression_eligible',true,
      'server_authoritative',true
    )
  )
  returning id into cid;

  return jsonb_build_object(
    'success',true,
    'already_checked_in',false,
    'active_visit',v_presence.departed_at is null,
    'check_in_available',true,
    'check_in_id',cid,
    'checked_in_at',now(),
    'presence_visit_id',v_presence.id,
    'verification_expires_at',v_presence.verification_expires_at,
    'verification_window_minutes',60,
    'verified_from',case when distance_m<=radius_m then 'live_geofence' else 'recent_presence_window' end,
    'points_awarded',10,
    'progression_eligible',true,
    'distance_meters',proof_distance,
    'geofence_radius_meters',radius_m
  );
end;
$function$;

create or replace function public.record_location_visit(p_location_id uuid,p_context jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_pref record;
  v_id uuid;
  uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_location_id is null or not exists(select 1 from public.locations where id=p_location_id and is_active=true) then
    raise exception 'location not found';
  end if;
  if p_context is null then p_context:='{}'::jsonb; end if;

  select pla.partner_program_id
  into v_pref
  from public.preferred_location_activations pla
  where pla.user_id=uid and pla.location_id=p_location_id and pla.deactivated_at is null
  limit 1;

  select id
  into v_id
  from public.location_visits
  where user_id=uid
    and location_id=p_location_id
    and occurred_at>now()-interval '10 minutes'
  order by occurred_at desc
  limit 1;

  if v_id is not null then
    return jsonb_build_object('ok',true,'visit_id',v_id,'already_recorded',true,'is_preferred',v_pref.partner_program_id is not null);
  end if;

  insert into public.location_visits(user_id,location_id,context,is_preferred,partner_program_id,last_seen_at,verification_expires_at)
  values(uid,p_location_id,p_context,v_pref.partner_program_id is not null,v_pref.partner_program_id,now(),now()+interval '60 minutes')
  returning id into v_id;

  if v_pref.partner_program_id is not null then
    update public.preferred_location_activations
    set last_used_at=now(),use_count=use_count+1
    where user_id=uid and location_id=p_location_id and deactivated_at is null;
  end if;

  return jsonb_build_object('ok',true,'visit_id',v_id,'is_preferred',v_pref.partner_program_id is not null,'already_recorded',false);
end;
$function$;

revoke all on function public.consumer_presence_heartbeat(double precision,double precision) from public,anon;
revoke all on function public.consumer_location_presence(uuid) from public,anon;
revoke all on function public.kleenest_map_check_in(uuid,double precision,double precision) from public,anon;
grant execute on function public.consumer_presence_heartbeat(double precision,double precision) to authenticated,service_role;
grant execute on function public.consumer_location_presence(uuid) to authenticated,service_role;
grant execute on function public.kleenest_map_check_in(uuid,double precision,double precision) to authenticated,service_role;