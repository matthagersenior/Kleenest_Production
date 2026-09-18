alter table public.route_stops
  add column if not exists arrived_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists evidence_id uuid;

alter table public.route_events drop constraint if exists route_events_event_type_check;
alter table public.route_events add constraint route_events_event_type_check
  check (event_type = any (array['started','stop_arrived','stop_completed','route_completed','route_shared']));

drop function if exists public.create_route_plan(text,double precision,double precision,double precision,double precision,numeric,integer);

create or replace function public.create_route_plan(
  p_name text,
  p_start_lat double precision,
  p_start_lng double precision,
  p_end_lat double precision,
  p_end_lng double precision,
  p_distance_miles numeric,
  p_estimated_minutes integer,
  p_stop_location_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare rid uuid; v_location uuid; v_order integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_start_lat is null or p_start_lng is null or p_end_lat is null or p_end_lng is null then raise exception 'route coordinates are required'; end if;
  if p_start_lat not between -90 and 90 or p_end_lat not between -90 and 90 or p_start_lng not between -180 and 180 or p_end_lng not between -180 and 180 then raise exception 'route coordinates are invalid'; end if;
  if p_distance_miles is null or p_distance_miles < 0 or p_estimated_minutes is null or p_estimated_minutes < 0 then raise exception 'route metrics are invalid'; end if;
  foreach v_location in array coalesce(p_stop_location_ids,'{}'::uuid[]) loop
    if not exists(select 1 from public.locations where id=v_location and is_active=true) then raise exception 'route stop location % is not an active canonical location', v_location; end if;
    v_order := v_order + 1;
  end loop;
  insert into public.route_plans(user_id,name,start_lat,start_lng,end_lat,end_lng,distance_miles,estimated_minutes,stops_count)
  values(auth.uid(),coalesce(nullif(trim(p_name),''),'My route'),p_start_lat,p_start_lng,p_end_lat,p_end_lng,p_distance_miles,p_estimated_minutes,v_order)
  returning id into rid;
  v_order := 0;
  foreach v_location in array coalesce(p_stop_location_ids,'{}'::uuid[]) loop
    v_order := v_order + 1;
    insert into public.route_stops(route_id,location_id,stop_order,points_value) values(rid,v_location,v_order,15);
  end loop;
  insert into public.route_events(route_id,user_id,event_type,points_awarded,metadata)
  values(rid,auth.uid(),'started',0,jsonb_build_object('source','create_route_plan','stop_count',v_order));
  return rid;
end $function$;

grant execute on function public.create_route_plan(text,double precision,double precision,double precision,double precision,numeric,integer,uuid[]) to authenticated;
revoke execute on function public.create_route_plan(text,double precision,double precision,double precision,double precision,numeric,integer,uuid[]) from anon;

create or replace function public.arrive_route_stop(p_route_id uuid,p_route_stop_id uuid,p_check_in_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare r public.route_plans; s public.route_stops; c public.check_ins; v_arrived timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into r from public.route_plans where id=p_route_id and user_id=auth.uid() for update;
  if not found then raise exception 'route not found'; end if;
  if r.status <> 'active' then raise exception 'route is not active'; end if;
  select * into s from public.route_stops where id=p_route_stop_id and route_id=r.id for update;
  if not found then raise exception 'route stop not found'; end if;
  select * into c from public.check_ins where id=p_check_in_id and user_id=auth.uid() for share;
  if not found or c.location_id<>s.location_id then raise exception 'verified check-in does not match route stop'; end if;
  if coalesce(c.verification_method,'') not in ('gps','qr','place') then raise exception 'check-in is not verified'; end if;
  if c.distance_meters is not null and c.distance_meters > 250 then raise exception 'check-in is not within qualifying arrival distance'; end if;
  if s.checked_in_at is not null then return jsonb_build_object('route_id',r.id,'route_stop_id',s.id,'location_id',s.location_id,'already_arrived',true,'completed',s.completed_at is not null); end if;
  v_arrived := coalesce(c.checked_in_at,now());
  update public.route_stops set arrived_at=v_arrived,checked_in_at=v_arrived where id=s.id;
  insert into public.route_events(route_id,user_id,event_type,route_stop_id,points_awarded,metadata)
  values(r.id,auth.uid(),'stop_arrived',s.id,0,jsonb_build_object('check_in_id',c.id,'location_id',s.location_id,'server_authoritative',true));
  return jsonb_build_object('route_id',r.id,'route_stop_id',s.id,'location_id',s.location_id,'check_in_id',c.id,'arrived_at',v_arrived,'completed',false);
end $function$;

grant execute on function public.arrive_route_stop(uuid,uuid,uuid) to authenticated;
revoke execute on function public.arrive_route_stop(uuid,uuid,uuid) from anon;

create or replace function public.arrive_active_route_stop(p_location_id uuid,p_check_in_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare r record;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select rp.id as route_id, rs.id as route_stop_id into r
  from public.route_plans rp join public.route_stops rs on rs.route_id=rp.id
  where rp.user_id=auth.uid() and rp.status='active' and rs.location_id=p_location_id and rs.completed_at is null
  order by rp.updated_at desc nulls last, rp.created_at desc limit 1;
  if not found then return jsonb_build_object('matched',false,'location_id',p_location_id,'check_in_id',p_check_in_id); end if;
  return jsonb_build_object('matched',true,'result',public.arrive_route_stop(r.route_id,r.route_stop_id,p_check_in_id));
end $function$;

grant execute on function public.arrive_active_route_stop(uuid,uuid) to authenticated;
revoke execute on function public.arrive_active_route_stop(uuid,uuid) from anon;

create or replace function public.complete_active_route_stop_after_evidence(p_location_id uuid,p_check_in_id uuid,p_evidence_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare r record; c public.check_ins; v_completed timestamptz := now(); v_points integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_location_id is null or p_check_in_id is null or p_evidence_id is null then raise exception 'location, check-in, and evidence are required'; end if;
  select * into c from public.check_ins where id=p_check_in_id and user_id=auth.uid();
  if not found or c.location_id<>p_location_id then raise exception 'check-in does not belong to this user and location'; end if;
  if coalesce(c.verification_method,'') not in ('gps','qr','place') then raise exception 'check-in is not verified'; end if;
  if not exists(select 1 from public.data_feature_events e where e.actor_user_id=auth.uid() and e.location_id=p_location_id and e.source_id=p_evidence_id and e.occurred_at>=coalesce(c.checked_in_at,now()-interval '1 hour') and e.occurred_at<=now()+interval '5 minutes' and e.event_validity='valid') then
    raise exception 'evidence is not an authoritative contribution for this verified visit';
  end if;
  select rp.id as route_id, rs.id as route_stop_id, rs.points_value into r
  from public.route_plans rp join public.route_stops rs on rs.route_id=rp.id
  where rp.user_id=auth.uid() and rp.status='active' and rs.location_id=p_location_id and rs.completed_at is null and rs.arrived_at is not null
  order by rp.updated_at desc nulls last, rp.created_at desc limit 1;
  if not found then return jsonb_build_object('matched',false,'location_id',p_location_id,'evidence_id',p_evidence_id); end if;
  v_points:=greatest(0,coalesce(r.points_value,15));
  update public.route_stops set completed_at=v_completed,evidence_id=p_evidence_id where id=r.route_stop_id;
  insert into public.route_events(route_id,user_id,event_type,route_stop_id,points_awarded,metadata)
  values(r.route_id,auth.uid(),'stop_completed',r.route_stop_id,v_points,jsonb_build_object('check_in_id',p_check_in_id,'evidence_id',p_evidence_id,'location_id',p_location_id,'server_authoritative',true));
  return jsonb_build_object('matched',true,'route_id',r.route_id,'route_stop_id',r.route_stop_id,'location_id',p_location_id,'check_in_id',p_check_in_id,'evidence_id',p_evidence_id,'completed_at',v_completed,'points',v_points);
end $function$;

grant execute on function public.complete_active_route_stop_after_evidence(uuid,uuid,uuid) to authenticated;
revoke execute on function public.complete_active_route_stop_after_evidence(uuid,uuid,uuid) from anon;

create or replace function public.complete_route(p_route_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare r public.route_plans; pts integer; v_stop_count integer; v_completed_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into r from public.route_plans where id=p_route_id and user_id=auth.uid() for update;
  if not found then raise exception 'route not found'; end if;
  if r.status='completed' then return jsonb_build_object('route_id',r.id,'points',r.points_earned,'already_completed',true); end if;
  if r.status <> 'active' then raise exception 'route is not completable from its current state'; end if;
  select count(*),count(*) filter(where completed_at is not null) into v_stop_count,v_completed_count from public.route_stops where route_id=r.id;
  if v_stop_count>0 and v_completed_count<>v_stop_count then raise exception 'route has incomplete restroom stops: % of % completed',v_completed_count,v_stop_count; end if;
  pts:=greatest(10,least(250,round(coalesce(r.distance_miles,0)*10)::integer + coalesce(r.stops_count,0)*15));
  update public.route_plans set status='completed',points_earned=pts,completed_at=now(),updated_at=now() where id=r.id;
  insert into public.route_events(route_id,user_id,event_type,points_awarded,metadata)
  values(r.id,auth.uid(),'route_completed',pts,jsonb_build_object('distance_miles',r.distance_miles,'stops_count',v_stop_count,'completed_stops_count',v_completed_count,'server_authoritative',true));
  return jsonb_build_object('route_id',r.id,'points',pts,'already_completed',false,'stops_count',v_stop_count,'completed_stops_count',v_completed_count);
end $function$;

grant execute on function public.complete_route(uuid) to authenticated;
revoke execute on function public.complete_route(uuid) from anon;
