create table if not exists public.fleet_route_stops (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  route_id uuid not null references public.fleet_routes(id) on delete cascade,
  location_id uuid null references public.locations(id) on delete set null,
  source_route_stop_id uuid null references public.route_stops(id) on delete set null,
  stop_order integer not null,
  status text not null default 'planned' check (status in ('planned','en_route','arrived','servicing','completed','skipped','cancelled')),
  planned_arrival_at timestamptz null,
  planned_ttl_minutes integer null check (planned_ttl_minutes is null or planned_ttl_minutes >= 0),
  planned_dwell_minutes integer null check (planned_dwell_minutes is null or planned_dwell_minutes >= 0),
  actual_arrived_at timestamptz null,
  actual_service_started_at timestamptz null,
  actual_completed_at timestamptz null,
  actual_departed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(route_id, stop_order)
);
create index if not exists fleet_route_stops_route_idx on public.fleet_route_stops(route_id, stop_order);
create index if not exists fleet_route_stops_business_idx on public.fleet_route_stops(business_id, status);
alter table public.fleet_routes add column if not exists dispatched_at timestamptz null;
alter table public.fleet_routes add column if not exists started_at timestamptz null;
alter table public.fleet_routes add column if not exists actual_completed_at timestamptz null;
alter table public.fleet_routes add column if not exists dispatch_locked boolean not null default false;
alter table public.fleet_route_stops enable row level security;
revoke all on public.fleet_route_stops from anon, authenticated;
drop policy if exists fleet_route_stops_observe on public.fleet_route_stops;
create policy fleet_route_stops_observe on public.fleet_route_stops for select to authenticated using (public.fleet_observe_access(business_id));

create or replace function public.fleet_set_route_stops(p_business_id uuid, p_route_id uuid, p_stops jsonb)
returns setof public.fleet_route_stops language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare v_route public.fleet_routes; v_stop jsonb; v_order integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager access required'; end if;
 select * into v_route from public.fleet_routes where id=p_route_id and business_id=p_business_id for update;
 if not found then raise exception 'Route not found'; end if;
 if v_route.dispatch_locked then raise exception 'Dispatched route stop order is locked'; end if;
 if jsonb_typeof(coalesce(p_stops,'[]'::jsonb)) <> 'array' then raise exception 'Stops must be an array'; end if;
 delete from public.fleet_route_stops where route_id=p_route_id;
 v_order := 0;
 for v_stop in select value from jsonb_array_elements(coalesce(p_stops,'[]'::jsonb)) loop
  v_order := v_order + 1;
  if nullif(v_stop->>'location_id','') is not null and not exists(select 1 from public.locations where id=(v_stop->>'location_id')::uuid) then raise exception 'Unknown location in stop %',v_order; end if;
  insert into public.fleet_route_stops(business_id,route_id,location_id,source_route_stop_id,stop_order,status,planned_arrival_at,planned_ttl_minutes,planned_dwell_minutes,metadata)
  values(p_business_id,p_route_id,nullif(v_stop->>'location_id','')::uuid,nullif(v_stop->>'source_route_stop_id','')::uuid,v_order,'planned',nullif(v_stop->>'planned_arrival_at','')::timestamptz,nullif(v_stop->>'planned_ttl_minutes','')::integer,nullif(v_stop->>'planned_dwell_minutes','')::integer,coalesce(v_stop->'metadata','{}'::jsonb));
 end loop;
 update public.fleet_routes set stops_count=v_order,updated_at=now() where id=p_route_id;
 return query select * from public.fleet_route_stops where route_id=p_route_id order by stop_order;
end $$;

create or replace function public.fleet_dispatch_route(p_business_id uuid, p_route_id uuid)
returns public.fleet_routes language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare r public.fleet_routes;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager access required'; end if;
 select * into r from public.fleet_routes where id=p_route_id and business_id=p_business_id for update;
 if not found then raise exception 'Route not found'; end if;
 if r.vehicle_id is null then raise exception 'Assign a vehicle before dispatch'; end if;
 if r.driver_id is null then raise exception 'Assign a driver before dispatch'; end if;
 if r.status not in ('planned','paused') then raise exception 'Only planned or paused routes can be dispatched'; end if;
 update public.fleet_routes set status='active',dispatched_at=coalesce(dispatched_at,now()),started_at=coalesce(started_at,now()),dispatch_locked=true,updated_at=now() where id=p_route_id returning * into r;
 insert into public.fleet_operational_events(business_id,vehicle_id,driver_id,route_id,event_type,occurred_at,metadata)
 values(p_business_id,r.vehicle_id,r.driver_id,r.id,'route_dispatched',now(),jsonb_build_object('scheduled_for',r.scheduled_for,'dispatched_at',r.dispatched_at));
 return r;
end $$;

create or replace function public.fleet_record_route_stop_timing(p_business_id uuid,p_route_id uuid,p_route_stop_id uuid,p_event_type text,p_occurred_at timestamptz default now())
returns public.fleet_route_stops language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare s public.fleet_route_stops; r public.fleet_routes; v_now timestamptz := coalesce(p_occurred_at,now());
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 select * into r from public.fleet_routes where id=p_route_id and business_id=p_business_id;
 if not found then raise exception 'Route not found'; end if;
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
 values(p_business_id,r.vehicle_id,r.driver_id,p_route_id,'route_stop_'||p_event_type,v_now,jsonb_build_object('route_stop_id',s.id,'stop_order',s.stop_order,'location_id',s.location_id));
 return s;
end $$;

create or replace function public.fleet_route_performance(p_business_id uuid,p_route_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare r public.fleet_routes; v_stops jsonb; v_completed integer; v_total integer; v_eta_variance numeric; v_dwell numeric; v_actual_duration numeric;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 select * into r from public.fleet_routes where id=p_route_id and business_id=p_business_id;
 if not found then raise exception 'Route not found'; end if;
 select count(*),count(*) filter(where status='completed'),avg(extract(epoch from (actual_arrived_at-planned_arrival_at))/60.0) filter(where actual_arrived_at is not null and planned_arrival_at is not null),avg(extract(epoch from (coalesce(actual_departed_at,actual_completed_at)-actual_arrived_at))/60.0) filter(where actual_arrived_at is not null and coalesce(actual_departed_at,actual_completed_at) is not null),jsonb_agg(jsonb_build_object('id',id,'stop_order',stop_order,'location_id',location_id,'status',status,'planned_arrival_at',planned_arrival_at,'planned_ttl_minutes',planned_ttl_minutes,'planned_dwell_minutes',planned_dwell_minutes,'actual_arrived_at',actual_arrived_at,'actual_service_started_at',actual_service_started_at,'actual_completed_at',actual_completed_at,'actual_departed_at',actual_departed_at,'eta_variance_minutes',case when actual_arrived_at is not null and planned_arrival_at is not null then round((extract(epoch from (actual_arrived_at-planned_arrival_at))/60.0)::numeric,2) end,'actual_dwell_minutes',case when actual_arrived_at is not null and coalesce(actual_departed_at,actual_completed_at) is not null then round((extract(epoch from (coalesce(actual_departed_at,actual_completed_at)-actual_arrived_at))/60.0)::numeric,2) end) order by stop_order)
 into v_total,v_completed,v_eta_variance,v_dwell,v_stops from public.fleet_route_stops where route_id=p_route_id;
 if r.started_at is not null then v_actual_duration := extract(epoch from (coalesce(r.actual_completed_at,now())-r.started_at))/60.0; end if;
 return jsonb_build_object('route_id',r.id,'status',r.status,'driver_id',r.driver_id,'vehicle_id',r.vehicle_id,'scheduled_for',r.scheduled_for,'dispatched_at',r.dispatched_at,'started_at',r.started_at,'estimated_minutes',r.estimated_minutes,'actual_duration_minutes',case when v_actual_duration is null then null else round(v_actual_duration,2) end,'duration_variance_minutes',case when v_actual_duration is null or r.estimated_minutes is null then null else round((v_actual_duration-r.estimated_minutes)::numeric,2) end,'total_stops',coalesce(v_total,0),'completed_stops',coalesce(v_completed,0),'avg_eta_variance_minutes',case when v_eta_variance is null then null else round(v_eta_variance,2) end,'avg_actual_dwell_minutes',case when v_dwell is null then null else round(v_dwell,2) end,'stops',coalesce(v_stops,'[]'::jsonb));
end $$;

grant execute on function public.fleet_set_route_stops(uuid,uuid,jsonb) to authenticated;
grant execute on function public.fleet_dispatch_route(uuid,uuid) to authenticated;
grant execute on function public.fleet_record_route_stop_timing(uuid,uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.fleet_route_performance(uuid,uuid) to authenticated;
