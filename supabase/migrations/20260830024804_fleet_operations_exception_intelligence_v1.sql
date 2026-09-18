create or replace function public.fleet_operations_exception_intelligence(p_business_id uuid,p_window_hours integer default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare
 v_hours integer:=least(greatest(coalesce(p_window_hours,24),1),168);
 v_since timestamptz:=now()-(least(greatest(coalesce(p_window_hours,24),1),168)||' hours')::interval;
 v_routes jsonb; v_stops jsonb; v_geofence jsonb; v_delivery jsonb; v_exceptions jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 select jsonb_build_object(
  'completed',count(*) filter(where status='completed')::int,
  'failed',count(*) filter(where status='failed')::int,
  'cancelled',count(*) filter(where status='cancelled')::int,
  'late_completed',count(*) filter(where status='completed' and scheduled_for is not null and actual_completed_at>scheduled_for+(coalesce(estimated_minutes,0)||' minutes')::interval)::int,
  'avg_duration_variance_minutes',round(avg((extract(epoch from(actual_completed_at-started_at))/60.0)-estimated_minutes) filter(where status='completed' and started_at is not null and actual_completed_at is not null and estimated_minutes is not null)::numeric,1)
 ) into v_routes from public.fleet_routes where business_id=p_business_id and coalesce(dispatched_at,updated_at,created_at)>=v_since;
 select jsonb_build_object(
  'terminal',count(*) filter(where status in('completed','skipped'))::int,
  'skipped',count(*) filter(where status='skipped')::int,
  'late_arrivals',count(*) filter(where actual_arrived_at is not null and planned_arrival_at is not null and actual_arrived_at>planned_arrival_at+interval '10 minutes')::int,
  'dwell_overruns',count(*) filter(where actual_service_started_at is not null and coalesce(actual_departed_at,actual_completed_at) is not null and planned_dwell_minutes is not null and extract(epoch from(coalesce(actual_departed_at,actual_completed_at)-actual_service_started_at))/60.0>planned_dwell_minutes+10)::int
 ) into v_stops from public.fleet_route_stops where business_id=p_business_id and updated_at>=v_since;
 select jsonb_build_object(
  'dwells',count(*) filter(where lower(event_type) like '%dwell%')::int,
  'long_dwells',count(*) filter(where dwell_seconds>=1800)::int,
  'max_dwell_seconds',max(dwell_seconds),
  'avg_dwell_seconds',round(avg(dwell_seconds) filter(where dwell_seconds is not null)::numeric,1)
 ) into v_geofence from public.geofence_events where business_id=p_business_id and occurred_at>=v_since;
 select jsonb_build_object(
  'push_failed',count(*) filter(where d.channel='push' and d.status='failed')::int,
  'push_pending',count(*) filter(where d.channel='push' and d.status in('pending','queued','retrying'))::int,
  'push_sent',count(*) filter(where d.channel='push' and d.status='sent')::int,
  'max_attempts',max(d.attempts)
 ) into v_delivery
 from public.notification_deliveries d join public.notifications n on n.id=d.notification_id
 where d.created_at>=v_since and (n.data->>'business_id')=p_business_id::text and coalesce(n.data->>'surface','fleet')='fleet';
 select coalesce(jsonb_agg(x order by x->>'occurred_at' desc),'[]'::jsonb) into v_exceptions from (
  select jsonb_build_object('kind','route_failure','severity','critical','route_id',r.id,'label',r.name,'occurred_at',coalesce(r.actual_completed_at,r.updated_at),'detail','Route failed') x from public.fleet_routes r where r.business_id=p_business_id and r.status='failed' and r.updated_at>=v_since
  union all
  select jsonb_build_object('kind','late_stop','severity','warning','route_id',s.route_id,'stop_id',s.id,'occurred_at',s.actual_arrived_at,'detail',concat('Arrival ',round(extract(epoch from(s.actual_arrived_at-s.planned_arrival_at))/60.0),' min late')) from public.fleet_route_stops s where s.business_id=p_business_id and s.actual_arrived_at is not null and s.planned_arrival_at is not null and s.actual_arrived_at>s.planned_arrival_at+interval '10 minutes' and s.updated_at>=v_since
  union all
  select jsonb_build_object('kind','dwell_anomaly','severity','warning','occurred_at',g.occurred_at,'detail',concat('Geofence dwell ',round(g.dwell_seconds/60.0),' min')) from public.geofence_events g where g.business_id=p_business_id and g.dwell_seconds>=1800 and g.occurred_at>=v_since
 ) q;
 return jsonb_build_object('business_id',p_business_id,'window_hours',v_hours,'routes',coalesce(v_routes,'{}'::jsonb),'stops',coalesce(v_stops,'{}'::jsonb),'geofence',coalesce(v_geofence,'{}'::jsonb),'delivery',coalesce(v_delivery,'{}'::jsonb),'exceptions',v_exceptions,'generated_at',now());
end $$;
revoke all on function public.fleet_operations_exception_intelligence(uuid,integer) from public,anon;
grant execute on function public.fleet_operations_exception_intelligence(uuid,integer) to authenticated;
