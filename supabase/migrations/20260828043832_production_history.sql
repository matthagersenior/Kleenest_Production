create or replace function public.fleet_dashboard_summary_v2(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
  with veh as (select count(*) total,count(*) filter(where status='active') active,coalesce(sum(odometer_miles),0) odometer,coalesce(jsonb_agg(to_jsonb(fv) order by fv.name),'[]'::jsonb) records from public.fleet_vehicles fv where business_id=p_business_id),
  drv as (select count(*) total,count(*) filter(where status='active') active,coalesce(jsonb_agg(to_jsonb(fd) order by fd.name),'[]'::jsonb) records from public.fleet_drivers fd where business_id=p_business_id),
  rte as (select count(*) total,count(*) filter(where status='active') active,count(*) filter(where status in('completed','complete')) completed,coalesce(sum(distance_miles),0) miles,coalesce(sum(estimated_minutes),0) minutes,coalesce(jsonb_agg(to_jsonb(fr) order by fr.name),'[]'::jsonb) records from public.fleet_routes fr where business_id=p_business_id),
  alt as (select count(*) filter(where status='open') open,count(*) total,coalesce(jsonb_agg(to_jsonb(fa) order by fa.created_at desc),'[]'::jsonb) records from public.fleet_alerts fa where business_id=p_business_id),
  ops as (select count(*) events,count(*) filter(where lower(event_type) in('hard_brake','hard_braking','harsh_braking','hard_acceleration','harsh_acceleration','speeding','collision','seatbelt')) safety_events,coalesce(sum(event_value) filter(where unit ilike '%mile%'),0) miles,coalesce(sum(event_value) filter(where unit ilike '%minute%'),0) minutes from public.fleet_operational_events where business_id=p_business_id),
  maint as (select count(*) filter(where status in('scheduled','due','overdue')) due,coalesce(sum(cost) filter(where completed_at is not null),0) maintenance_spend,coalesce(jsonb_agg(to_jsonb(fm) order by coalesce(fm.scheduled_at,fm.created_at)),'[]'::jsonb) records from public.fleet_maintenance_records fm where business_id=p_business_id),
  loc as (select count(*) total,count(*) filter(where bathroom_verification_status in('verified','user_verified','business_verified')) verified,count(*) filter(where accessible=true) accessible,count(*) filter(where changing_table=true) changing_tables from public.locations where is_active=true and business_id=p_business_id),
  opp as (select count(*) opportunities,count(*) filter(where needs_fresh_observation=1) stale_opportunities from public.fleet_service_opportunities where business_id=p_business_id)
  select jsonb_build_object('vehicles',veh.total,'vehicles_active',veh.active,'odometer_miles',veh.odometer,'drivers',drv.total,'drivers_active',drv.active,'routes',rte.total,'routes_active',rte.active,'routes_completed',rte.completed,'route_miles',rte.miles,'route_minutes',rte.minutes,'open_alerts',alt.open,'alerts_total',alt.total,'operational_events',ops.events,'safety_events',ops.safety_events,'telemetry_miles',ops.miles,'telemetry_minutes',ops.minutes,'maintenance_due',maint.due,'maintenance_spend',maint.maintenance_spend,'location_total',loc.total,'location_verified',loc.verified,'location_accessible',loc.accessible,'location_changing_tables',loc.changing_tables,'service_opportunities',opp.opportunities,'stale_service_opportunities',opp.stale_opportunities,'vehicle_records',veh.records,'driver_records',drv.records,'route_records',rte.records,'alert_records',alt.records,'maintenance_records',maint.records) into v from veh cross join drv cross join rte cross join alt cross join ops cross join maint cross join loc cross join opp;
  return v;
end;
$$;

create or replace function public.fleet_service_opportunities_for_business(p_business_id uuid)
returns table(location_id uuid,name text,latitude double precision,longitude double precision,business_id uuid,bathroom_verification_status text,rating numeric,accessible boolean,changing_table boolean,amenity_count bigint,quality_observation_count bigint,verified_bathroom integer,needs_fresh_observation integer)
language sql stable security definer set search_path to 'public','auth','extensions','pg_catalog'
as $$ select v.location_id,v.name,v.latitude,v.longitude,v.business_id,v.bathroom_verification_status,v.rating,v.accessible,v.changing_table,v.amenity_count,v.quality_observation_count,v.verified_bathroom,v.needs_fresh_observation from public.fleet_service_opportunities v where v.business_id=p_business_id and public.fleet_observe_access(p_business_id) order by v.name; $$;
