do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fleet_alerts') then alter publication supabase_realtime add table public.fleet_alerts; end if;
end $$;

create or replace function public.fleet_route_exception_drilldown(p_business_id uuid,p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare v_route jsonb; v_stops jsonb; v_events jsonb; v_alerts jsonb; v_vehicle jsonb; v_driver jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 if not exists(select 1 from public.fleet_routes where id=p_route_id and business_id=p_business_id) then raise exception 'Route not found'; end if;
 select to_jsonb(r) into v_route from public.fleet_routes r where r.id=p_route_id and r.business_id=p_business_id;
 select to_jsonb(v) into v_vehicle from public.fleet_vehicles v where v.id=(select vehicle_id from public.fleet_routes where id=p_route_id);
 select jsonb_build_object('id',d.id,'name',d.name,'status',d.status,'user_id',d.user_id) into v_driver from public.fleet_drivers d where d.id=(select driver_id from public.fleet_routes where id=p_route_id);
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',s.id,'stop_order',s.stop_order,'status',s.status,'location_id',s.location_id,
   'planned_arrival_at',s.planned_arrival_at,'actual_arrived_at',s.actual_arrived_at,
   'arrival_variance_minutes',case when s.actual_arrived_at is not null and s.planned_arrival_at is not null then round((extract(epoch from(s.actual_arrived_at-s.planned_arrival_at))/60.0)::numeric,1) end,
   'planned_dwell_minutes',s.planned_dwell_minutes,
   'actual_dwell_minutes',case when s.actual_service_started_at is not null and coalesce(s.actual_departed_at,s.actual_completed_at) is not null then round((extract(epoch from(coalesce(s.actual_departed_at,s.actual_completed_at)-s.actual_service_started_at))/60.0)::numeric,1) end,
   'metadata',s.metadata
 ) order by s.stop_order),'[]'::jsonb) into v_stops from public.fleet_route_stops s where s.route_id=p_route_id and s.business_id=p_business_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'occurred_at',e.occurred_at,'vehicle_id',e.vehicle_id,'driver_id',e.driver_id,'metadata',e.metadata) order by e.occurred_at desc),'[]'::jsonb) into v_events from public.fleet_operational_events e where e.route_id=p_route_id and e.business_id=p_business_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'severity',a.severity,'alert_type',a.alert_type,'title',a.title,'details',a.details,'status',a.status,'source_kind',a.source_kind,'source_id',a.source_id,'created_at',a.created_at,'resolved_at',a.resolved_at) order by a.created_at desc),'[]'::jsonb) into v_alerts
 from public.fleet_alerts a where a.business_id=p_business_id and (
  (a.source_kind='operational_event' and exists(select 1 from public.fleet_operational_events e where e.id=a.source_id and e.route_id=p_route_id))
  or a.vehicle_id=(select vehicle_id from public.fleet_routes where id=p_route_id)
 );
 return jsonb_build_object('route',v_route,'vehicle',v_vehicle,'driver',v_driver,'stops',v_stops,'events',v_events,'alerts',v_alerts,'generated_at',now());
end $$;
revoke all on function public.fleet_route_exception_drilldown(uuid,uuid) from public,anon;
grant execute on function public.fleet_route_exception_drilldown(uuid,uuid) to authenticated;
