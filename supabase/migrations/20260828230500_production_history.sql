create or replace function public.complete_route(p_route_id uuid) returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare r public.route_plans; pts integer; total_stops integer; completed_stops integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into r from public.route_plans where id=p_route_id and user_id=auth.uid() for update;
  if not found then raise exception 'route not found'; end if;
  if r.status='completed' then return jsonb_build_object('route_id',r.id,'points',r.points_earned,'already_completed',true); end if;
  if r.status <> 'active' then raise exception 'route is not completable from its current state'; end if;
  select count(*), count(*) filter (where checked_in_at is not null) into total_stops,completed_stops from public.route_stops where route_id=r.id;
  if total_stops <> coalesce(r.stops_count,0) then raise exception 'route stop state is inconsistent'; end if;
  if total_stops > 0 and completed_stops <> total_stops then raise exception 'all route stops require verified arrival before completion'; end if;
  if exists (select 1 from public.route_events e where e.route_id=r.id and e.event_type='route_completed' and e.user_id=auth.uid()) then raise exception 'route completion event already exists'; end if;
  pts:=greatest(10,least(250,round(coalesce(r.distance_miles,0)*10)::integer + coalesce(r.stops_count,0)*15));
  update public.route_plans set status='completed',points_earned=pts,completed_at=now(),updated_at=now() where id=r.id;
  insert into public.route_events(route_id,user_id,event_type,points_awarded,metadata) values(r.id,auth.uid(),'route_completed',pts,jsonb_build_object('distance_miles',r.distance_miles,'stops_count',r.stops_count,'verified_stops',completed_stops));
  return jsonb_build_object('route_id',r.id,'points',pts,'already_completed',false,'verified_stops',completed_stops);
end $function$;
