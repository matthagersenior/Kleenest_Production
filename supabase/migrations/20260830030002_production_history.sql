create or replace function public.fleet_asset_exception_scorecards(p_business_id uuid,p_window_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare v_days integer:=least(greatest(coalesce(p_window_days,30),1),180); v_since timestamptz; v_drivers jsonb; v_vehicles jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 v_since:=now()-(v_days||' days')::interval;
 with route_base as (
   select r.id,r.driver_id,r.vehicle_id,r.status from public.fleet_routes r where r.business_id=p_business_id and coalesce(r.dispatched_at,r.updated_at,r.created_at)>=v_since
 ), stop_by_driver as (
   select r.driver_id,count(*) filter(where s.actual_arrived_at is not null and s.planned_arrival_at is not null)::int observed_arrivals,count(*) filter(where s.actual_arrived_at is not null and s.planned_arrival_at is not null and s.actual_arrived_at>s.planned_arrival_at+interval '10 minutes')::int late_arrivals,count(*) filter(where s.status='skipped')::int skipped_stops,count(*) filter(where s.actual_service_started_at is not null and coalesce(s.actual_departed_at,s.actual_completed_at) is not null and s.planned_dwell_minutes is not null and extract(epoch from(coalesce(s.actual_departed_at,s.actual_completed_at)-s.actual_service_started_at))/60.0>s.planned_dwell_minutes+10)::int dwell_overruns from route_base r join public.fleet_route_stops s on s.route_id=r.id where r.driver_id is not null group by r.driver_id
 ), driver_routes as (
   select driver_id,count(*)::int routes,count(*) filter(where status='completed')::int completed_routes,count(*) filter(where status='failed')::int failed_routes,count(*) filter(where status='cancelled')::int cancelled_routes,round((100.0*count(*) filter(where status='completed')/nullif(count(*) filter(where status in('completed','failed','cancelled')),0))::numeric,1) completion_rate_pct from route_base where driver_id is not null group by driver_id
 ), driver_rollup as (
   select d.id,d.name,d.status,coalesce(dr.routes,0)::int routes,coalesce(dr.completed_routes,0)::int completed_routes,coalesce(dr.failed_routes,0)::int failed_routes,coalesce(dr.cancelled_routes,0)::int cancelled_routes,dr.completion_rate_pct,coalesce(sd.observed_arrivals,0)::int observed_arrivals,coalesce(sd.late_arrivals,0)::int late_arrivals,round((100.0*coalesce(sd.late_arrivals,0)/nullif(coalesce(sd.observed_arrivals,0),0))::numeric,1) late_arrival_rate_pct,coalesce(sd.skipped_stops,0)::int skipped_stops,coalesce(sd.dwell_overruns,0)::int dwell_overruns from public.fleet_drivers d left join driver_routes dr on dr.driver_id=d.id left join stop_by_driver sd on sd.driver_id=d.id where d.business_id=p_business_id
 ) select coalesce(jsonb_agg(to_jsonb(x) order by x.failed_routes desc,x.late_arrivals desc,x.name),'[]'::jsonb) into v_drivers from driver_rollup x;
 with route_base as (
   select r.id,r.vehicle_id,r.status from public.fleet_routes r where r.business_id=p_business_id and coalesce(r.dispatched_at,r.updated_at,r.created_at)>=v_since
 ), stop_by_vehicle as (
   select r.vehicle_id,count(*) filter(where s.actual_arrived_at is not null and s.planned_arrival_at is not null)::int observed_arrivals,count(*) filter(where s.actual_arrived_at is not null and s.planned_arrival_at is not null and s.actual_arrived_at>s.planned_arrival_at+interval '10 minutes')::int late_arrivals,count(*) filter(where s.status='skipped')::int skipped_stops,count(*) filter(where s.actual_service_started_at is not null and coalesce(s.actual_departed_at,s.actual_completed_at) is not null and s.planned_dwell_minutes is not null and extract(epoch from(coalesce(s.actual_departed_at,s.actual_completed_at)-s.actual_service_started_at))/60.0>s.planned_dwell_minutes+10)::int dwell_overruns from route_base r join public.fleet_route_stops s on s.route_id=r.id where r.vehicle_id is not null group by r.vehicle_id
 ), vehicle_routes as (
   select vehicle_id,count(*)::int routes,count(*) filter(where status='completed')::int completed_routes,count(*) filter(where status='failed')::int failed_routes,round((100.0*count(*) filter(where status='completed')/nullif(count(*) filter(where status in('completed','failed','cancelled')),0))::numeric,1) completion_rate_pct from route_base where vehicle_id is not null group by vehicle_id
 ), vehicle_alerts as (
   select vehicle_id,count(*) filter(where status='open')::int open_alerts,count(*) filter(where status='open' and severity='critical')::int critical_alerts from public.fleet_alerts where business_id=p_business_id and created_at>=v_since and vehicle_id is not null group by vehicle_id
 ), vehicle_rollup as (
   select v.id,v.name,v.unit_code,v.status,coalesce(vr.routes,0)::int routes,coalesce(vr.completed_routes,0)::int completed_routes,coalesce(vr.failed_routes,0)::int failed_routes,vr.completion_rate_pct,coalesce(sv.observed_arrivals,0)::int observed_arrivals,coalesce(sv.late_arrivals,0)::int late_arrivals,round((100.0*coalesce(sv.late_arrivals,0)/nullif(coalesce(sv.observed_arrivals,0),0))::numeric,1) late_arrival_rate_pct,coalesce(sv.skipped_stops,0)::int skipped_stops,coalesce(sv.dwell_overruns,0)::int dwell_overruns,coalesce(va.open_alerts,0)::int open_alerts,coalesce(va.critical_alerts,0)::int critical_alerts from public.fleet_vehicles v left join vehicle_routes vr on vr.vehicle_id=v.id left join stop_by_vehicle sv on sv.vehicle_id=v.id left join vehicle_alerts va on va.vehicle_id=v.id where v.business_id=p_business_id
 ) select coalesce(jsonb_agg(to_jsonb(x) order by x.failed_routes desc,x.open_alerts desc,x.late_arrivals desc,x.name),'[]'::jsonb) into v_vehicles from vehicle_rollup x;
 return jsonb_build_object('business_id',p_business_id,'window_days',v_days,'drivers',v_drivers,'vehicles',v_vehicles,'generated_at',now());
end $$;
revoke all on function public.fleet_asset_exception_scorecards(uuid,integer) from public,anon;
grant execute on function public.fleet_asset_exception_scorecards(uuid,integer) to authenticated;
