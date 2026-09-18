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
   select r.id,r.driver_id,r.vehicle_id,r.status,r.dispatched_at,r.actual_completed_at,r.started_at,r.estimated_minutes
   from public.fleet_routes r where r.business_id=p_business_id and coalesce(r.dispatched_at,r.updated_at,r.created_at)>=v_since
 ), stop_stats as (
   select r.driver_id,r.vehicle_id,
     count(*) filter(where s.actual_arrived_at is not null and s.planned_arrival_at is not null)::int observed_arrivals,
     count(*) filter(where s.actual_arrived_at is not null and s.planned_arrival_at is not null and s.actual_arrived_at>s.planned_arrival_at+interval '10 minutes')::int late_arrivals,
     count(*) filter(where s.status='skipped')::int skipped_stops,
     count(*) filter(where s.actual_service_started_at is not null and coalesce(s.actual_departed_at,s.actual_completed_at) is not null and s.planned_dwell_minutes is not null and extract(epoch from(coalesce(s.actual_departed_at,s.actual_completed_at)-s.actual_service_started_at))/60.0>s.planned_dwell_minutes+10)::int dwell_overruns
   from route_base r join public.fleet_route_stops s on s.route_id=r.id group by r.driver_id,r.vehicle_id
 ), driver_rollup as (
   select d.id,d.name,d.status,
     count(r.id)::int routes,
     count(r.id) filter(where r.status='completed')::int completed_routes,
     count(r.id) filter(where r.status='failed')::int failed_routes,
     count(r.id) filter(where r.status='cancelled')::int cancelled_routes,
     round((100.0*count(r.id) filter(where r.status='completed')/nullif(count(r.id) filter(where r.status in('completed','failed','cancelled')),0))::numeric,1) completion_rate_pct,
     coalesce(sum(ss.observed_arrivals),0)::int observed_arrivals,
     coalesce(sum(ss.late_arrivals),0)::int late_arrivals,
     round((100.0*coalesce(sum(ss.late_arrivals),0)/nullif(coalesce(sum(ss.observed_arrivals),0),0))::numeric,1) late_arrival_rate_pct,
     coalesce(sum(ss.skipped_stops),0)::int skipped_stops,
     coalesce(sum(ss.dwell_overruns),0)::int dwell_overruns
   from public.fleet_drivers d left join route_base r on r.driver_id=d.id left join stop_stats ss on ss.driver_id=d.id and (ss.vehicle_id=r.vehicle_id or ss.vehicle_id is null or r.vehicle_id is null)
   where d.business_id=p_business_id group by d.id,d.name,d.status
 ), vehicle_alerts as (
   select vehicle_id,count(*) filter(where status='open')::int open_alerts,count(*) filter(where status='open' and severity='critical')::int critical_alerts from public.fleet_alerts where business_id=p_business_id and created_at>=v_since group by vehicle_id
 ), vehicle_rollup as (
   select v.id,v.name,v.unit_code,v.status,
     count(r.id)::int routes,
     count(r.id) filter(where r.status='completed')::int completed_routes,
     count(r.id) filter(where r.status='failed')::int failed_routes,
     round((100.0*count(r.id) filter(where r.status='completed')/nullif(count(r.id) filter(where r.status in('completed','failed','cancelled')),0))::numeric,1) completion_rate_pct,
     coalesce(sum(ss.observed_arrivals),0)::int observed_arrivals,
     coalesce(sum(ss.late_arrivals),0)::int late_arrivals,
     round((100.0*coalesce(sum(ss.late_arrivals),0)/nullif(coalesce(sum(ss.observed_arrivals),0),0))::numeric,1) late_arrival_rate_pct,
     coalesce(sum(ss.skipped_stops),0)::int skipped_stops,
     coalesce(sum(ss.dwell_overruns),0)::int dwell_overruns,
     coalesce(max(va.open_alerts),0)::int open_alerts,coalesce(max(va.critical_alerts),0)::int critical_alerts
   from public.fleet_vehicles v left join route_base r on r.vehicle_id=v.id left join stop_stats ss on ss.vehicle_id=v.id and (ss.driver_id=r.driver_id or ss.driver_id is null or r.driver_id is null) left join vehicle_alerts va on va.vehicle_id=v.id
   where v.business_id=p_business_id group by v.id,v.name,v.unit_code,v.status
 )
 select coalesce(jsonb_agg(to_jsonb(x) order by x.failed_routes desc,x.late_arrivals desc,x.name),'[]'::jsonb) into v_drivers from driver_rollup x;
 with route_base as (
   select r.id,r.driver_id,r.vehicle_id,r.status from public.fleet_routes r where r.business_id=p_business_id and coalesce(r.dispatched_at,r.updated_at,r.created_at)>=v_since
 ), stop_stats as (
   select r.vehicle_id,count(*) filter(where s.actual_arrived_at is not null and s.planned_arrival_at is not null)::int observed_arrivals,count(*) filter(where s.actual_arrived_at is not null and s.planned_arrival_at is not null and s.actual_arrived_at>s.planned_arrival_at+interval '10 minutes')::int late_arrivals,count(*) filter(where s.status='skipped')::int skipped_stops,count(*) filter(where s.actual_service_started_at is not null and coalesce(s.actual_departed_at,s.actual_completed_at) is not null and s.planned_dwell_minutes is not null and extract(epoch from(coalesce(s.actual_departed_at,s.actual_completed_at)-s.actual_service_started_at))/60.0>s.planned_dwell_minutes+10)::int dwell_overruns from route_base r join public.fleet_route_stops s on s.route_id=r.id group by r.vehicle_id
 ), vehicle_alerts as (select vehicle_id,count(*) filter(where status='open')::int open_alerts,count(*) filter(where status='open' and severity='critical')::int critical_alerts from public.fleet_alerts where business_id=p_business_id and created_at>=v_since group by vehicle_id), vehicle_rollup as (
   select v.id,v.name,v.unit_code,v.status,count(r.id)::int routes,count(r.id) filter(where r.status='completed')::int completed_routes,count(r.id) filter(where r.status='failed')::int failed_routes,round((100.0*count(r.id) filter(where r.status='completed')/nullif(count(r.id) filter(where r.status in('completed','failed','cancelled')),0))::numeric,1) completion_rate_pct,coalesce(max(ss.observed_arrivals),0)::int observed_arrivals,coalesce(max(ss.late_arrivals),0)::int late_arrivals,round((100.0*coalesce(max(ss.late_arrivals),0)/nullif(coalesce(max(ss.observed_arrivals),0),0))::numeric,1) late_arrival_rate_pct,coalesce(max(ss.skipped_stops),0)::int skipped_stops,coalesce(max(ss.dwell_overruns),0)::int dwell_overruns,coalesce(max(va.open_alerts),0)::int open_alerts,coalesce(max(va.critical_alerts),0)::int critical_alerts from public.fleet_vehicles v left join route_base r on r.vehicle_id=v.id left join stop_stats ss on ss.vehicle_id=v.id left join vehicle_alerts va on va.vehicle_id=v.id where v.business_id=p_business_id group by v.id,v.name,v.unit_code,v.status
 ) select coalesce(jsonb_agg(to_jsonb(x) order by x.failed_routes desc,x.open_alerts desc,x.late_arrivals desc,x.name),'[]'::jsonb) into v_vehicles from vehicle_rollup x;
 return jsonb_build_object('business_id',p_business_id,'window_days',v_days,'drivers',v_drivers,'vehicles',v_vehicles,'generated_at',now());
end $$;
revoke all on function public.fleet_asset_exception_scorecards(uuid,integer) from public,anon;
grant execute on function public.fleet_asset_exception_scorecards(uuid,integer) to authenticated;
