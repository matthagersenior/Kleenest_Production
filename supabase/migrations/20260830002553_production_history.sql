create or replace function public.fleet_record_route_stop_timing(p_business_id uuid,p_route_id uuid,p_route_stop_id uuid,p_event_type text,p_occurred_at timestamptz default now())
returns public.fleet_route_stops language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare s public.fleet_route_stops; r public.fleet_routes; v_now timestamptz := coalesce(p_occurred_at,now()); v_assigned_driver boolean := false; v_remaining integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.fleet_routes where id=p_route_id and business_id=p_business_id;
 if not found then raise exception 'Route not found'; end if;
 if r.driver_id is not null then select exists(select 1 from public.fleet_drivers d where d.id=r.driver_id and d.business_id=p_business_id and d.user_id=auth.uid()) into v_assigned_driver; end if;
 if not public.fleet_actor_is_manager(p_business_id) and not v_assigned_driver then raise exception 'Fleet manager or assigned driver access required'; end if;
 select * into s from public.fleet_route_stops where id=p_route_stop_id and route_id=p_route_id and business_id=p_business_id for update;
 if not found then raise exception 'Fleet route stop not found'; end if;
 if p_event_type='arrived' then update public.fleet_route_stops set status='arrived',actual_arrived_at=coalesce(actual_arrived_at,v_now),updated_at=now() where id=s.id;
 elsif p_event_type='service_started' then update public.fleet_route_stops set status='servicing',actual_arrived_at=coalesce(actual_arrived_at,v_now),actual_service_started_at=coalesce(actual_service_started_at,v_now),updated_at=now() where id=s.id;
 elsif p_event_type='completed' then update public.fleet_route_stops set status='completed',actual_arrived_at=coalesce(actual_arrived_at,v_now),actual_service_started_at=coalesce(actual_service_started_at,v_now),actual_completed_at=coalesce(actual_completed_at,v_now),actual_departed_at=coalesce(actual_departed_at,v_now),updated_at=now() where id=s.id;
 elsif p_event_type='departed' then update public.fleet_route_stops set status=case when actual_completed_at is null then status else 'completed' end,actual_departed_at=coalesce(actual_departed_at,v_now),updated_at=now() where id=s.id;
 elsif p_event_type='skipped' then update public.fleet_route_stops set status='skipped',actual_departed_at=coalesce(actual_departed_at,v_now),updated_at=now() where id=s.id;
 else raise exception 'Unsupported stop timing event'; end if;
 select * into s from public.fleet_route_stops where id=s.id;
 insert into public.fleet_operational_events(business_id,vehicle_id,driver_id,route_id,event_type,occurred_at,metadata)
 values(p_business_id,r.vehicle_id,r.driver_id,p_route_id,'route_stop_'||p_event_type,v_now,jsonb_build_object('route_stop_id',s.id,'stop_order',s.stop_order,'location_id',s.location_id,'actor_user_id',auth.uid()));
 if p_event_type in ('completed','skipped') then
   select count(*) into v_remaining from public.fleet_route_stops where route_id=p_route_id and status not in ('completed','skipped','cancelled');
   if v_remaining=0 then
     update public.fleet_routes set status='completed',actual_completed_at=coalesce(actual_completed_at,v_now),dispatch_locked=true,updated_at=now() where id=p_route_id and business_id=p_business_id and status<>'cancelled';
     insert into public.fleet_operational_events(business_id,vehicle_id,driver_id,route_id,event_type,occurred_at,metadata)
     values(p_business_id,r.vehicle_id,r.driver_id,p_route_id,'route_completed',v_now,jsonb_build_object('completion_source','all_stops_terminal','actor_user_id',auth.uid()));
   end if;
 end if;
 return s;
end $$;

create or replace function public.fleet_route_performance(p_business_id uuid,p_route_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare r public.fleet_routes; v_stops jsonb; v_completed integer; v_total integer; v_eta_variance numeric; v_ttl_variance numeric; v_dwell numeric; v_dwell_variance numeric; v_arrived_by_plan integer; v_planned_arrivals integer; v_actual_duration numeric;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 select * into r from public.fleet_routes where id=p_route_id and business_id=p_business_id;
 if not found then raise exception 'Route not found'; end if;
 with ordered as (
   select s.*, lag(s.actual_departed_at) over(order by s.stop_order) prev_departed_at
   from public.fleet_route_stops s where s.route_id=p_route_id
 ), metrics as (
   select o.*,
     case when o.actual_arrived_at is not null and o.planned_arrival_at is not null then extract(epoch from (o.actual_arrived_at-o.planned_arrival_at))/60.0 end eta_variance_minutes,
     case when o.actual_arrived_at is not null and coalesce(o.prev_departed_at,r.started_at) is not null then extract(epoch from (o.actual_arrived_at-coalesce(o.prev_departed_at,r.started_at)))/60.0 end actual_ttl_minutes,
     case when o.actual_arrived_at is not null and coalesce(o.prev_departed_at,r.started_at) is not null and o.planned_ttl_minutes is not null then extract(epoch from (o.actual_arrived_at-coalesce(o.prev_departed_at,r.started_at)))/60.0-o.planned_ttl_minutes end ttl_variance_minutes,
     case when o.actual_arrived_at is not null and coalesce(o.actual_departed_at,o.actual_completed_at) is not null then extract(epoch from (coalesce(o.actual_departed_at,o.actual_completed_at)-o.actual_arrived_at))/60.0 end actual_dwell_minutes,
     case when o.actual_arrived_at is not null and coalesce(o.actual_departed_at,o.actual_completed_at) is not null and o.planned_dwell_minutes is not null then extract(epoch from (coalesce(o.actual_departed_at,o.actual_completed_at)-o.actual_arrived_at))/60.0-o.planned_dwell_minutes end dwell_variance_minutes
   from ordered o
 )
 select count(*),count(*) filter(where status='completed'),avg(eta_variance_minutes) filter(where eta_variance_minutes is not null),avg(ttl_variance_minutes) filter(where ttl_variance_minutes is not null),avg(actual_dwell_minutes) filter(where actual_dwell_minutes is not null),avg(dwell_variance_minutes) filter(where dwell_variance_minutes is not null),count(*) filter(where actual_arrived_at is not null and planned_arrival_at is not null and actual_arrived_at<=planned_arrival_at),count(*) filter(where actual_arrived_at is not null and planned_arrival_at is not null),jsonb_agg(jsonb_build_object('id',id,'stop_order',stop_order,'location_id',location_id,'status',status,'planned_arrival_at',planned_arrival_at,'planned_ttl_minutes',planned_ttl_minutes,'planned_dwell_minutes',planned_dwell_minutes,'actual_arrived_at',actual_arrived_at,'actual_service_started_at',actual_service_started_at,'actual_completed_at',actual_completed_at,'actual_departed_at',actual_departed_at,'metadata',metadata,'eta_variance_minutes',case when eta_variance_minutes is null then null else round(eta_variance_minutes::numeric,2) end,'actual_ttl_minutes',case when actual_ttl_minutes is null then null else round(actual_ttl_minutes::numeric,2) end,'ttl_variance_minutes',case when ttl_variance_minutes is null then null else round(ttl_variance_minutes::numeric,2) end,'actual_dwell_minutes',case when actual_dwell_minutes is null then null else round(actual_dwell_minutes::numeric,2) end,'dwell_variance_minutes',case when dwell_variance_minutes is null then null else round(dwell_variance_minutes::numeric,2) end) order by stop_order)
 into v_total,v_completed,v_eta_variance,v_ttl_variance,v_dwell,v_dwell_variance,v_arrived_by_plan,v_planned_arrivals,v_stops from metrics;
 if r.started_at is not null then v_actual_duration := extract(epoch from (coalesce(r.actual_completed_at,now())-r.started_at))/60.0; end if;
 return jsonb_build_object('route_id',r.id,'status',r.status,'driver_id',r.driver_id,'vehicle_id',r.vehicle_id,'scheduled_for',r.scheduled_for,'dispatched_at',r.dispatched_at,'started_at',r.started_at,'actual_completed_at',r.actual_completed_at,'dispatch_locked',r.dispatch_locked,'estimated_minutes',r.estimated_minutes,'actual_duration_minutes',case when v_actual_duration is null then null else round(v_actual_duration,2) end,'duration_variance_minutes',case when v_actual_duration is null or r.estimated_minutes is null then null else round((v_actual_duration-r.estimated_minutes)::numeric,2) end,'total_stops',coalesce(v_total,0),'completed_stops',coalesce(v_completed,0),'avg_eta_variance_minutes',case when v_eta_variance is null then null else round(v_eta_variance,2) end,'avg_ttl_variance_minutes',case when v_ttl_variance is null then null else round(v_ttl_variance,2) end,'avg_actual_dwell_minutes',case when v_dwell is null then null else round(v_dwell,2) end,'avg_dwell_variance_minutes',case when v_dwell_variance is null then null else round(v_dwell_variance,2) end,'arrived_by_plan_count',coalesce(v_arrived_by_plan,0),'planned_arrival_observations',coalesce(v_planned_arrivals,0),'arrived_by_plan_pct',case when coalesce(v_planned_arrivals,0)=0 then null else round((100.0*v_arrived_by_plan/v_planned_arrivals)::numeric,2) end,'stops',coalesce(v_stops,'[]'::jsonb));
end $$;
