-- Production hot-path recovery: replace the full active-location Haversine scan
-- with the existing GiST-backed locations.geom spatial path. This file contains
-- the exact live DDL so fresh environments can rebuild Production deterministically.

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
  v_point extensions.geography;
begin
  if uid is null then
    return jsonb_build_object('signed_in',false,'inside_geofence',false,'check_in_available',false);
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'LOCATION_REQUIRED'; end if;
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography;

  select l.id,l.name,l.latitude,l.longitude,
    greatest(25,least(coalesce(l.geofence_radius_m,150),5000))::double precision as radius_m,
    extensions.st_distance(l.geom,v_point) as distance_m
  into v_location
  from public.locations l
  where l.is_active=true
    and l.verification_status in ('pending'::public.verification_status,'verified'::public.verification_status)
    and l.geom is not null
    and extensions.st_dwithin(l.geom,v_point,5000)
    and extensions.st_distance(l.geom,v_point) <= greatest(25,least(coalesce(l.geofence_radius_m,150),5000))
  order by extensions.st_distance(l.geom,v_point)
  limit 1;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || coalesce(v_location.id::text,'none'),0));
  select * into v_open from public.location_visits where user_id=uid and departed_at is null and last_seen_at is not null order by last_seen_at desc limit 1;
  if v_open.id is not null and (v_location.id is null or v_open.location_id is distinct from v_location.id) then
    select l.latitude,l.longitude,greatest(25,least(coalesce(l.geofence_radius_m,150),5000))::double precision as radius_m,
      case when l.geom is not null then extensions.st_distance(l.geom,v_point) else null end as distance_m
    into v_open_loc from public.locations l where l.id=v_open.location_id;
    if v_open_loc.latitude is not null and v_open_loc.longitude is not null then
      v_open_distance := coalesce(v_open_loc.distance_m, 6371000.0*2*asin(sqrt(power(sin(radians(p_lat-v_open_loc.latitude)/2),2)+cos(radians(v_open_loc.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-v_open_loc.longitude)/2),2))));
      if v_open_distance > v_open_loc.radius_m then
        update public.location_visits set departed_at=coalesce(departed_at,now()) where id=v_open.id;
        if not exists(select 1 from public.location_departures d where d.user_id=uid and d.location_id=v_open.location_id and d.left_at>=coalesce(v_open.last_seen_at,v_open.occurred_at)) then
          insert into public.location_departures(user_id,location_id,left_at,latitude,longitude,distance_meters) values(uid,v_open.location_id,now(),p_lat,p_lng,v_open_distance);
        end if;
      end if;
    end if;
  end if;
  if v_location.id is null then
    select * into v_visit from public.location_visits where user_id=uid and verification_expires_at>=now() order by last_seen_at desc nulls last, occurred_at desc limit 1;
    return jsonb_build_object('signed_in',true,'inside_geofence',false,'check_in_available',v_visit.id is not null,'visit_id',v_visit.id,'location_id',v_visit.location_id,'entered_at',v_visit.occurred_at,'last_seen_at',v_visit.last_seen_at,'departed_at',v_visit.departed_at,'verification_expires_at',v_visit.verification_expires_at,'verification_window_minutes',60);
  end if;
  select * into v_visit from public.location_visits where user_id=uid and location_id=v_location.id and departed_at is null order by occurred_at desc limit 1;
  if v_visit.id is null then
    insert into public.location_visits(user_id,location_id,occurred_at,context,last_seen_at,verification_expires_at,entry_latitude,entry_longitude,entry_distance_meters,last_latitude,last_longitude,last_distance_meters)
    values(uid,v_location.id,now(),jsonb_build_object('source','consumer_presence_heartbeat','presence_verified',true,'auto_check_in',false,'server_authoritative',true,'verification_window_minutes',60),now(),now()+v_window,p_lat,p_lng,v_location.distance_m,p_lat,p_lng,v_location.distance_m)
    on conflict (user_id,location_id) where departed_at is null do update set last_seen_at=excluded.last_seen_at,verification_expires_at=excluded.verification_expires_at,last_latitude=excluded.last_latitude,last_longitude=excluded.last_longitude,last_distance_meters=excluded.last_distance_meters,context=coalesce(public.location_visits.context,'{}'::jsonb)||excluded.context returning * into v_visit;
  else
    update public.location_visits set last_seen_at=now(),verification_expires_at=now()+v_window,last_latitude=p_lat,last_longitude=p_lng,last_distance_meters=v_location.distance_m,context=coalesce(context,'{}'::jsonb)||jsonb_build_object('presence_verified',true,'auto_check_in',false,'server_authoritative',true,'verification_window_minutes',60) where id=v_visit.id returning * into v_visit;
  end if;
  return jsonb_build_object('signed_in',true,'inside_geofence',true,'check_in_available',true,'visit_id',v_visit.id,'location_id',v_visit.location_id,'location_name',v_location.name,'entered_at',v_visit.occurred_at,'last_seen_at',v_visit.last_seen_at,'departed_at',v_visit.departed_at,'verification_expires_at',v_visit.verification_expires_at,'verification_window_minutes',60,'distance_meters',v_location.distance_m,'geofence_radius_meters',v_location.radius_m);
end;
$function$;

-- Read-only, service-role-only ledger projection used by the OIDC readiness gate.
-- It makes convergence bidirectional: source-only and Production-only versions both fail.
CREATE OR REPLACE FUNCTION public.production_migration_versions(p_floor text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(array_agg(m.version order by m.version), array[]::text[])
  from supabase_migrations.schema_migrations m
  where m.version >= p_floor;
$function$;

REVOKE ALL ON FUNCTION public.production_migration_versions(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.production_migration_versions(text) TO service_role;
