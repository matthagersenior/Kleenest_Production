-- Fleet route stops may be canonical Kleenest locations or ad-hoc geocoded places.
-- Every stop owns its operational geofence/notification configuration so routing,
-- dispatch, metrics and intelligence can treat both stop kinds consistently.

alter table public.fleet_route_stops
  add column if not exists stop_kind text not null default 'canonical',
  add column if not exists stop_name text,
  add column if not exists stop_address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geofence_radius_m integer not null default 150,
  add column if not exists notify_arrival boolean not null default true,
  add column if not exists notify_departure boolean not null default true,
  add column if not exists notify_dwell boolean not null default false;

alter table public.business_geofences
  add column if not exists route_stop_id uuid references public.fleet_route_stops(id) on delete cascade,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists label text;

create index if not exists business_geofences_route_stop_idx
  on public.business_geofences(route_stop_id)
  where route_stop_id is not null;

update public.fleet_route_stops s
set stop_kind='canonical',
    stop_name=coalesce(s.stop_name,l.name),
    stop_address=coalesce(s.stop_address,l.address),
    latitude=coalesce(s.latitude,l.latitude),
    longitude=coalesce(s.longitude,l.longitude),
    geofence_radius_m=greatest(25,least(coalesce(s.geofence_radius_m,l.geofence_radius_m,150),5000))
from public.locations l
where s.location_id=l.id;

create or replace function public.fleet_set_route_stops(
  p_business_id uuid,
  p_route_id uuid,
  p_stops jsonb
)
returns setof public.fleet_route_stops
language plpgsql
security definer
set search_path=''
as $$
declare
  v_route public.fleet_routes;
  v_stop jsonb;
  v_order integer;
  v_location public.locations;
  v_location_id uuid;
  v_kind text;
  v_lat double precision;
  v_lng double precision;
  v_name text;
  v_address text;
  v_radius integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager access required'; end if;

  select * into v_route
  from public.fleet_routes
  where id=p_route_id and business_id=p_business_id
  for update;
  if not found then raise exception 'Route not found'; end if;
  if v_route.dispatch_locked then raise exception 'Dispatched route stop order is locked'; end if;
  if jsonb_typeof(coalesce(p_stops,'[]'::jsonb)) <> 'array' then raise exception 'Stops must be an array'; end if;

  delete from public.fleet_route_stops where route_id=p_route_id;
  v_order:=0;

  for v_stop in select value from jsonb_array_elements(coalesce(p_stops,'[]'::jsonb))
  loop
    v_order:=v_order+1;
    v_location_id:=nullif(v_stop->>'location_id','')::uuid;
    v_kind:=lower(coalesce(nullif(v_stop->>'source_kind',''),nullif(v_stop->>'stop_kind',''),case when v_location_id is null then 'adhoc' else 'canonical' end));
    if v_kind not in ('canonical','adhoc') then raise exception 'Unsupported stop kind at stop %',v_order; end if;

    if v_location_id is not null then
      select * into v_location from public.locations where id=v_location_id;
      if not found then raise exception 'Unknown location in stop %',v_order; end if;
      v_kind:='canonical';
      v_lat:=coalesce(nullif(v_stop->>'latitude','')::double precision,v_location.latitude);
      v_lng:=coalesce(nullif(v_stop->>'longitude','')::double precision,v_location.longitude);
      v_name:=coalesce(nullif(trim(v_stop->>'stop_name'),''),v_location.name);
      v_address:=coalesce(nullif(trim(v_stop->>'stop_address'),''),v_location.address);
    else
      v_kind:='adhoc';
      v_lat:=nullif(v_stop->>'latitude','')::double precision;
      v_lng:=nullif(v_stop->>'longitude','')::double precision;
      v_name:=nullif(trim(v_stop->>'stop_name'),'');
      v_address:=nullif(trim(v_stop->>'stop_address'),'');
      if v_lat is null or v_lng is null then raise exception 'Ad-hoc stop % requires coordinates',v_order; end if;
      if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then raise exception 'Invalid coordinates at stop %',v_order; end if;
      if v_name is null then raise exception 'Ad-hoc stop % requires a name',v_order; end if;
    end if;

    v_radius:=greatest(25,least(coalesce(nullif(v_stop->>'geofence_radius_m','')::integer,150),5000));

    insert into public.fleet_route_stops(
      business_id,route_id,location_id,source_route_stop_id,stop_order,status,
      planned_arrival_at,planned_ttl_minutes,planned_dwell_minutes,
      stop_kind,stop_name,stop_address,latitude,longitude,geofence_radius_m,
      notify_arrival,notify_departure,notify_dwell,metadata
    )
    values(
      p_business_id,p_route_id,v_location_id,nullif(v_stop->>'source_route_stop_id','')::uuid,v_order,'planned',
      nullif(v_stop->>'planned_arrival_at','')::timestamptz,
      nullif(v_stop->>'planned_ttl_minutes','')::integer,
      nullif(v_stop->>'planned_dwell_minutes','')::integer,
      v_kind,v_name,v_address,v_lat,v_lng,v_radius,
      coalesce((v_stop->>'notify_arrival')::boolean,true),
      coalesce((v_stop->>'notify_departure')::boolean,true),
      coalesce((v_stop->>'notify_dwell')::boolean,false),
      coalesce(v_stop->'metadata','{}'::jsonb)||jsonb_build_object('source_kind',v_kind)
    );
  end loop;

  update public.fleet_routes
  set stops_count=v_order,updated_at=now()
  where id=p_route_id;

  return query
  select *
  from public.fleet_route_stops
  where route_id=p_route_id
  order by stop_order;
end;
$$;

revoke all on function public.fleet_set_route_stops(uuid,uuid,jsonb) from public,anon;
grant execute on function public.fleet_set_route_stops(uuid,uuid,jsonb) to authenticated,service_role;

create or replace function public.fleet_route_geofence_manifest(
  p_business_id uuid,
  p_route_id uuid
)
returns table(
  route_stop_id uuid,
  location_id uuid,
  geofence_id uuid,
  stop_order integer,
  latitude double precision,
  longitude double precision,
  radius_meters integer,
  location_name text
)
language plpgsql
security definer
set search_path=''
as $$
declare
  rec record;
  gid uuid;
  radius integer;
  v_enabled boolean;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
  if not exists(select 1 from public.fleet_routes r where r.id=p_route_id and r.business_id=p_business_id) then raise exception 'Route not found'; end if;

  for rec in
    select
      s.id route_stop_id,
      s.location_id,
      s.stop_order,
      coalesce(s.latitude,l.latitude) latitude,
      coalesce(s.longitude,l.longitude) longitude,
      coalesce(s.stop_name,l.name,'Route stop') name,
      greatest(25,least(coalesce(s.geofence_radius_m,l.geofence_radius_m,150),5000)) geofence_radius_m,
      s.notify_arrival,s.notify_departure,s.notify_dwell,
      s.stop_kind
    from public.fleet_route_stops s
    left join public.locations l on l.id=s.location_id
    where s.route_id=p_route_id and s.business_id=p_business_id
    order by s.stop_order
  loop
    if rec.latitude is null or rec.longitude is null then continue; end if;
    radius:=rec.geofence_radius_m;
    v_enabled:=coalesce(rec.notify_arrival,false) or coalesce(rec.notify_departure,false) or coalesce(rec.notify_dwell,false);
    v_payload:=jsonb_build_object(
      'source','fleet_route_stop',
      'route_id',p_route_id,
      'route_stop_id',rec.route_stop_id,
      'source_kind',rec.stop_kind,
      'notify_arrival',rec.notify_arrival,
      'notify_departure',rec.notify_departure,
      'notify_dwell',rec.notify_dwell
    );

    select g.id into gid
    from public.business_geofences g
    where g.business_id=p_business_id
      and g.route_stop_id=rec.route_stop_id
      and coalesce(g.active,true)
    order by g.created_at desc
    limit 1;

    if gid is null then
      insert into public.business_geofences(
        business_id,location_id,route_stop_id,latitude,longitude,label,
        radius_meters,notification_enabled,notification_payload,active
      )
      values(
        p_business_id,rec.location_id,rec.route_stop_id,rec.latitude,rec.longitude,rec.name,
        radius,v_enabled,v_payload,true
      )
      returning id into gid;
    else
      update public.business_geofences
      set location_id=rec.location_id,
          latitude=rec.latitude,
          longitude=rec.longitude,
          label=rec.name,
          radius_meters=radius,
          notification_enabled=v_enabled,
          notification_payload=v_payload,
          active=true
      where id=gid;
    end if;

    route_stop_id:=rec.route_stop_id;
    location_id:=rec.location_id;
    geofence_id:=gid;
    stop_order:=rec.stop_order;
    latitude:=rec.latitude;
    longitude:=rec.longitude;
    radius_meters:=radius;
    location_name:=rec.name;
    return next;
  end loop;
end;
$$;

revoke all on function public.fleet_route_geofence_manifest(uuid,uuid) from public,anon;
grant execute on function public.fleet_route_geofence_manifest(uuid,uuid) to authenticated,service_role;

create or replace function public.record_geofence_event(
  p_geofence_id uuid,
  p_user_id uuid,
  p_location_id uuid,
  p_business_id uuid,
  p_event_type text,
  p_dwell_seconds integer default null,
  p_metadata jsonb default '{}'::jsonb,
  p_notification_id uuid default null,
  p_qr_code_id uuid default null,
  p_check_in_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  g public.business_geofences;
  s public.fleet_route_stops;
  r public.fleet_routes;
  v_event text:=lower(trim(coalesce(p_event_type,'')));
  v_notify boolean:=false;
  v_title text;
  v_body text;
  v_notification_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_user_id is distinct from auth.uid() then raise exception 'user identity mismatch'; end if;
  if p_geofence_id is null then raise exception 'geofence required'; end if;

  select * into g
  from public.business_geofences
  where id=p_geofence_id and coalesce(active,true);
  if not found then raise exception 'geofence scope mismatch'; end if;
  if p_business_id is not null and g.business_id is distinct from p_business_id then raise exception 'geofence scope mismatch'; end if;

  if g.route_stop_id is null then
    if p_location_id is null or g.location_id is distinct from p_location_id then raise exception 'geofence and location required'; end if;
  elsif p_location_id is not null and g.location_id is not null and g.location_id is distinct from p_location_id then
    raise exception 'geofence scope mismatch';
  end if;

  insert into public.geofence_events(
    geofence_id,user_id,location_id,business_id,event_type,dwell_seconds,metadata,
    notification_id,qr_code_id,check_in_id
  )
  values(
    p_geofence_id,auth.uid(),coalesce(p_location_id,g.location_id),coalesce(p_business_id,g.business_id),
    p_event_type,p_dwell_seconds,
    coalesce(p_metadata,'{}'::jsonb)||case when g.route_stop_id is null then '{}'::jsonb else jsonb_build_object('route_stop_id',g.route_stop_id) end,
    p_notification_id,p_qr_code_id,p_check_in_id
  )
  returning id into v_id;

  if g.route_stop_id is not null then
    select * into s from public.fleet_route_stops where id=g.route_stop_id;
    if found then
      select * into r from public.fleet_routes where id=s.route_id and business_id=s.business_id;

      insert into public.fleet_operational_events(
        business_id,vehicle_id,driver_id,route_id,event_type,latitude,longitude,occurred_at,metadata
      )
      values(
        s.business_id,r.vehicle_id,r.driver_id,s.route_id,'route_stop_geofence_'||v_event,
        coalesce(s.latitude,g.latitude),coalesce(s.longitude,g.longitude),now(),
        jsonb_build_object(
          'route_stop_id',s.id,'stop_order',s.stop_order,'location_id',s.location_id,
          'stop_kind',s.stop_kind,'stop_name',s.stop_name,'geofence_id',g.id,
          'dwell_seconds',p_dwell_seconds,'geofence_event_id',v_id
        )
      );

      if v_event in ('enter','entered','entry') and s.notify_arrival then
        v_notify:=true; v_title:='Approaching route stop'; v_body:=coalesce(s.stop_name,'Route stop')||' geofence entered.';
      elsif v_event in ('exit','exited') and s.notify_departure then
        v_notify:=true; v_title:='Departing route stop'; v_body:=coalesce(s.stop_name,'Route stop')||' geofence exited.';
      elsif v_event like '%dwell%' and s.notify_dwell then
        v_notify:=true; v_title:='Route stop dwell'; v_body:=coalesce(s.stop_name,'Route stop')||' dwell threshold reached.';
      end if;

      if v_notify and g.notification_enabled then
        select public.publish_fleet_route_notification(
          s.route_id,
          'route_stop_geofence_'||v_event,
          v_title,
          v_body,
          jsonb_build_object(
            'route_stop_id',s.id,'location_id',s.location_id,'stop_order',s.stop_order,
            'stop_kind',s.stop_kind,'geofence_id',g.id,'geofence_event_id',v_id,
            'dedupe_key','fleet:'||s.route_id::text||':geofence:'||v_id::text
          )
        ) into v_notification_id;
        if v_notification_id is not null then
          update public.geofence_events set notification_id=v_notification_id where id=v_id;
        end if;
      end if;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_geofence_event(uuid,uuid,uuid,uuid,text,integer,jsonb,uuid,uuid,uuid) from public,anon;
grant execute on function public.record_geofence_event(uuid,uuid,uuid,uuid,text,integer,jsonb,uuid,uuid,uuid) to authenticated,service_role;

create or replace function public.fleet_route_performance(p_business_id uuid,p_route_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.fleet_routes;
  v_stops jsonb;
  v_completed integer;
  v_total integer;
  v_eta_variance numeric;
  v_ttl_variance numeric;
  v_dwell numeric;
  v_dwell_variance numeric;
  v_arrived_by_plan integer;
  v_planned_arrivals integer;
  v_actual_duration numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
  select * into r from public.fleet_routes where id=p_route_id and business_id=p_business_id;
  if not found then raise exception 'Route not found'; end if;

  with ordered as (
    select s.*,lag(s.actual_departed_at) over(order by s.stop_order) prev_departed_at
    from public.fleet_route_stops s where s.route_id=p_route_id
  ),metrics as (
    select o.*,
      case when o.actual_arrived_at is not null and o.planned_arrival_at is not null then extract(epoch from(o.actual_arrived_at-o.planned_arrival_at))/60.0 end eta_variance_minutes,
      case when o.actual_arrived_at is not null and coalesce(o.prev_departed_at,r.started_at) is not null then extract(epoch from(o.actual_arrived_at-coalesce(o.prev_departed_at,r.started_at)))/60.0 end actual_ttl_minutes,
      case when o.actual_arrived_at is not null and coalesce(o.prev_departed_at,r.started_at) is not null and o.planned_ttl_minutes is not null then extract(epoch from(o.actual_arrived_at-coalesce(o.prev_departed_at,r.started_at)))/60.0-o.planned_ttl_minutes end ttl_variance_minutes,
      case when o.actual_arrived_at is not null and coalesce(o.actual_departed_at,o.actual_completed_at) is not null then extract(epoch from(coalesce(o.actual_departed_at,o.actual_completed_at)-o.actual_arrived_at))/60.0 end actual_dwell_minutes,
      case when o.actual_arrived_at is not null and coalesce(o.actual_departed_at,o.actual_completed_at) is not null and o.planned_dwell_minutes is not null then extract(epoch from(coalesce(o.actual_departed_at,o.actual_completed_at)-o.actual_arrived_at))/60.0-o.planned_dwell_minutes end dwell_variance_minutes
    from ordered o
  )
  select
    count(*),
    count(*) filter(where status='completed'),
    avg(eta_variance_minutes) filter(where eta_variance_minutes is not null),
    avg(ttl_variance_minutes) filter(where ttl_variance_minutes is not null),
    avg(actual_dwell_minutes) filter(where actual_dwell_minutes is not null),
    avg(dwell_variance_minutes) filter(where dwell_variance_minutes is not null),
    count(*) filter(where actual_arrived_at is not null and planned_arrival_at is not null and actual_arrived_at<=planned_arrival_at),
    count(*) filter(where actual_arrived_at is not null and planned_arrival_at is not null),
    jsonb_agg(jsonb_build_object(
      'id',id,'stop_order',stop_order,'location_id',location_id,'stop_kind',stop_kind,
      'stop_name',stop_name,'stop_address',stop_address,'latitude',latitude,'longitude',longitude,
      'geofence_radius_m',geofence_radius_m,'notify_arrival',notify_arrival,
      'notify_departure',notify_departure,'notify_dwell',notify_dwell,'status',status,
      'planned_arrival_at',planned_arrival_at,'planned_ttl_minutes',planned_ttl_minutes,
      'planned_dwell_minutes',planned_dwell_minutes,'actual_arrived_at',actual_arrived_at,
      'actual_service_started_at',actual_service_started_at,'actual_completed_at',actual_completed_at,
      'actual_departed_at',actual_departed_at,'metadata',metadata,
      'eta_variance_minutes',case when eta_variance_minutes is null then null else round(eta_variance_minutes::numeric,2) end,
      'actual_ttl_minutes',case when actual_ttl_minutes is null then null else round(actual_ttl_minutes::numeric,2) end,
      'ttl_variance_minutes',case when ttl_variance_minutes is null then null else round(ttl_variance_minutes::numeric,2) end,
      'actual_dwell_minutes',case when actual_dwell_minutes is null then null else round(actual_dwell_minutes::numeric,2) end,
      'dwell_variance_minutes',case when dwell_variance_minutes is null then null else round(dwell_variance_minutes::numeric,2) end
    ) order by stop_order)
  into v_total,v_completed,v_eta_variance,v_ttl_variance,v_dwell,v_dwell_variance,v_arrived_by_plan,v_planned_arrivals,v_stops
  from metrics;

  if r.started_at is not null then v_actual_duration:=extract(epoch from(coalesce(r.actual_completed_at,now())-r.started_at))/60.0; end if;

  return jsonb_build_object(
    'route_id',r.id,'status',r.status,'driver_id',r.driver_id,'vehicle_id',r.vehicle_id,
    'scheduled_for',r.scheduled_for,'dispatched_at',r.dispatched_at,'started_at',r.started_at,
    'actual_completed_at',r.actual_completed_at,'dispatch_locked',r.dispatch_locked,
    'estimated_minutes',r.estimated_minutes,
    'actual_duration_minutes',case when v_actual_duration is null then null else round(v_actual_duration,2) end,
    'duration_variance_minutes',case when v_actual_duration is null or r.estimated_minutes is null then null else round((v_actual_duration-r.estimated_minutes)::numeric,2) end,
    'total_stops',coalesce(v_total,0),'completed_stops',coalesce(v_completed,0),
    'avg_eta_variance_minutes',case when v_eta_variance is null then null else round(v_eta_variance,2) end,
    'avg_ttl_variance_minutes',case when v_ttl_variance is null then null else round(v_ttl_variance,2) end,
    'avg_actual_dwell_minutes',case when v_dwell is null then null else round(v_dwell,2) end,
    'avg_dwell_variance_minutes',case when v_dwell_variance is null then null else round(v_dwell_variance,2) end,
    'arrived_by_plan_count',coalesce(v_arrived_by_plan,0),
    'planned_arrival_observations',coalesce(v_planned_arrivals,0),
    'arrived_by_plan_pct',case when coalesce(v_planned_arrivals,0)=0 then null else round((100.0*v_arrived_by_plan/v_planned_arrivals)::numeric,2) end,
    'stops',coalesce(v_stops,'[]'::jsonb)
  );
end;
$$;

create or replace function public.fleet_dispatch_intelligence(
  p_business_id uuid,
  p_route_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_route public.fleet_routes;
  v_candidates jsonb;
  v_route_stops jsonb:='[]'::jsonb;
  v_drivers jsonb;
  v_vehicles jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
  v_policy jsonb;
  v_occ_enabled boolean;
  v_occ_fresh_minutes integer;
  v_high_util numeric;
  v_queue_threshold integer;
  v_high_weight integer;
  v_queue_weight integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
  if p_route_id is not null then
    select * into v_route from public.fleet_routes where id=p_route_id and business_id=p_business_id;
    if not found then raise exception 'Route not found'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'stop_order',s.stop_order,'location_id',s.location_id,
      'source_kind',s.stop_kind,'name',coalesce(s.stop_name,l.name),
      'address',coalesce(s.stop_address,l.address),
      'latitude',coalesce(s.latitude,l.latitude),'longitude',coalesce(s.longitude,l.longitude),
      'geofence_radius_m',s.geofence_radius_m,'notify_arrival',s.notify_arrival,
      'notify_departure',s.notify_departure,'notify_dwell',s.notify_dwell,'status',s.status
    ) order by s.stop_order),'[]'::jsonb)
    into v_route_stops
    from public.fleet_route_stops s
    left join public.locations l on l.id=s.location_id
    where s.route_id=p_route_id and s.business_id=p_business_id;
  end if;

  v_policy:=public.fleet_dispatch_signal_policy(p_business_id);
  v_occ_enabled:=coalesce((v_policy->>'occupancy_enabled')::boolean,true);
  v_occ_fresh_minutes:=coalesce((v_policy->>'occupancy_fresh_minutes')::integer,30);
  v_high_util:=coalesce((v_policy->>'high_utilization_pct')::numeric,80);
  v_queue_threshold:=coalesce((v_policy->>'queue_threshold')::integer,1);
  v_high_weight:=coalesce((v_policy->>'high_utilization_weight')::integer,15);
  v_queue_weight:=coalesce((v_policy->>'queue_weight')::integer,10);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score desc,x.name),'[]'::jsonb)
  into v_candidates
  from (
    select o.location_id,o.name,o.latitude,o.longitude,o.bathroom_verification_status,o.rating,o.accessible,o.changing_table,o.amenity_count,o.quality_observation_count,o.verified_bathroom,o.needs_fresh_observation,
      occ.summary as occupancy_summary,
      (case when coalesce(o.needs_fresh_observation,0)>0 then 50 else 0 end
       +case when coalesce(o.verified_bathroom,0)=0 then 30 else 0 end
       +case when o.rating is null then 10 when o.rating<3 then 20 else 0 end
       +case when coalesce(o.quality_observation_count,0)=0 then 15 else 0 end
       +case when v_occ_enabled and (occ.summary->>'freshest_observed_at') is not null and (occ.summary->>'freshest_observed_at')::timestamptz>=now()-make_interval(mins=>v_occ_fresh_minutes) and coalesce((occ.summary->>'utilization_pct')::numeric,0)>=v_high_util then v_high_weight else 0 end
       +case when v_occ_enabled and (occ.summary->>'freshest_observed_at') is not null and (occ.summary->>'freshest_observed_at')::timestamptz>=now()-make_interval(mins=>v_occ_fresh_minutes) and coalesce((occ.summary->>'queue_count')::numeric,0)>=v_queue_threshold then v_queue_weight else 0 end)::integer priority_score,
      array_remove(array[
        case when coalesce(o.needs_fresh_observation,0)>0 then 'needs fresh observation' end,
        case when coalesce(o.verified_bathroom,0)=0 then 'bathroom not verified' end,
        case when o.rating is null then 'rating missing' when o.rating<3 then 'low rating' end,
        case when coalesce(o.quality_observation_count,0)=0 then 'no quality observations' end,
        case when v_occ_enabled and (occ.summary->>'freshest_observed_at') is not null and (occ.summary->>'freshest_observed_at')::timestamptz>=now()-make_interval(mins=>v_occ_fresh_minutes) and coalesce((occ.summary->>'utilization_pct')::numeric,0)>=v_high_util then 'current utilization meets configured threshold' end,
        case when v_occ_enabled and (occ.summary->>'freshest_observed_at') is not null and (occ.summary->>'freshest_observed_at')::timestamptz>=now()-make_interval(mins=>v_occ_fresh_minutes) and coalesce((occ.summary->>'queue_count')::numeric,0)>=v_queue_threshold then 'current queue meets configured threshold' end
      ],null) reasons
    from public.fleet_service_opportunities_for_business(p_business_id) o
    left join lateral(select public.get_location_occupancy_summary(o.location_id) summary) occ on true
    where p_route_id is null or not exists(
      select 1 from public.fleet_route_stops s where s.route_id=p_route_id and s.location_id=o.location_id
    )
    order by priority_score desc,o.name
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'name',d.name,'status',d.status,'vehicle_id',d.vehicle_id,'user_id',d.user_id,'ready',d.status='active'
  ) order by(d.status='active') desc,d.name),'[]'::jsonb)
  into v_drivers
  from public.fleet_drivers d where d.business_id=p_business_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'name',v.name,'unit_code',v.unit_code,'status',v.status,'vehicle_type',v.vehicle_type,'driver_name',v.driver_name,'ready',v.status='active'
  ) order by(v.status='active') desc,v.name),'[]'::jsonb)
  into v_vehicles
  from public.fleet_vehicles v where v.business_id=p_business_id;

  return jsonb_build_object(
    'business_id',p_business_id,
    'route_id',p_route_id,
    'route',case when p_route_id is null then null else jsonb_build_object(
      'id',v_route.id,'name',v_route.name,'status',v_route.status,'driver_id',v_route.driver_id,
      'vehicle_id',v_route.vehicle_id,'scheduled_for',v_route.scheduled_for,
      'dispatch_locked',v_route.dispatch_locked,'stops_count',v_route.stops_count
    ) end,
    'route_stops',v_route_stops,
    'candidate_stops',v_candidates,
    'drivers',v_drivers,
    'vehicles',v_vehicles,
    'dispatch_signal_policy',v_policy,
    'generated_at',now(),
    'model','authoritative_dispatch_intelligence_v3'
  );
end;
$$;

create or replace function public.business_restroom_preventive_work_orders(
  p_business_id uuid,
  p_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  rec jsonb;
  rows jsonb;
  members jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;

  rec:=public.business_restroom_prevention_recommendations(p_business_id,p_days);

  insert into public.business_restroom_preventive_work_orders(
    business_id,location_id,amenity_id,recommendation_action,priority,source_snapshot,due_at
  )
  select
    p_business_id,
    (x->>'location_id')::uuid,
    (x->>'amenity_id')::uuid,
    x->>'recommended_action',
    case
      when coalesce(x->>'prevention_priority',x->>'priority','watch') in ('critical','high','watch')
        then coalesce(x->>'prevention_priority',x->>'priority','watch')
      else 'watch'
    end,
    x,
    now()+make_interval(hours=>coalesce((x->>'suggested_followup_hours')::int,72))
  from jsonb_array_elements(coalesce(rec->'recommendations','[]'::jsonb)) x
  where coalesce(x->>'recommended_action','monitor')<>'monitor'
  on conflict do nothing;

  select coalesce(jsonb_agg(
    to_jsonb(w)||jsonb_build_object(
      'location_name',l.name,'amenity_name',a.name,'assigned_name',coalesce(p.display_name,p.username),
      'fleet_route_stop_id',fs.id,'fleet_route_id',fs.route_id,'fleet_route_name',fs.route_name,'fleet_route_status',fs.route_status,
      'fleet_stop_status',fs.stop_status,'fleet_stop_order',fs.stop_order,'fleet_scheduled_for',fs.scheduled_for,'fleet_dispatch_locked',fs.dispatch_locked,
      'fleet_arrived_at',fs.actual_arrived_at,'fleet_service_started_at',fs.actual_service_started_at,'fleet_stop_completed_at',fs.actual_completed_at,'fleet_departed_at',fs.actual_departed_at,
      'fleet_signoff_required',(fs.actual_completed_at is not null and w.status in('planned','assigned','in_progress')),
      'fleet_signoff_age_minutes',case when fs.actual_completed_at is not null and w.status in('planned','assigned','in_progress') then floor(extract(epoch from(now()-fs.actual_completed_at))/60)::int else null end
    )
    order by
      case when fs.actual_completed_at is not null and w.status in('planned','assigned','in_progress') then 0 when w.status='in_progress' then 1 when w.status='assigned' then 2 when w.status='planned' then 3 else 4 end,
      w.due_at nulls last,w.created_at desc
  ),'[]'::jsonb)
  into rows
  from public.business_restroom_preventive_work_orders w
  join public.locations l on l.id=w.location_id
  join public.amenities a on a.id=w.amenity_id
  left join public.profiles p on p.id=w.assigned_to
  left join lateral(
    select s.id,s.route_id,r.name route_name,r.status route_status,s.status stop_status,s.stop_order,r.scheduled_for,r.dispatch_locked,s.actual_arrived_at,s.actual_service_started_at,s.actual_completed_at,s.actual_departed_at
    from public.fleet_route_stops s
    join public.fleet_routes r on r.id=s.route_id
    where s.business_id=p_business_id
      and s.metadata->>'preventive_work_order_id'=w.id::text
      and r.status not in('cancelled','failed')
    order by case r.status when 'active' then 0 when 'paused' then 1 when 'planned' then 2 when 'completed' then 3 else 4 end,s.created_at desc
    limit 1
  ) fs on true
  where w.business_id=p_business_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',bm.user_id,'role',bm.role,'display_name',coalesce(p.display_name,p.username)
  ) order by coalesce(p.display_name,p.username)),'[]'::jsonb)
  into members
  from public.business_members bm
  left join public.profiles p on p.id=bm.user_id
  where bm.business_id=p_business_id
    and lower(bm.role::text) in('owner','admin','manager','staff','employee');

  return jsonb_build_object(
    'business_id',p_business_id,
    'recommendations',coalesce(rec,'{}'::jsonb),
    'work_orders',coalesce(rows,'[]'::jsonb),
    'members',coalesce(members,'[]'::jsonb),
    'generated_at',now()
  );
end;
$$;

comment on function public.fleet_set_route_stops(uuid,uuid,jsonb) is
  'Sets canonical or ad-hoc Fleet route stops, including route-level geofence and notification controls.';
comment on function public.fleet_route_geofence_manifest(uuid,uuid) is
  'Returns operational geofences for all Fleet route stops, including ad-hoc geocoded stops.';
