create or replace function public.arrive_route_stop(p_route_id uuid,p_route_stop_id uuid,p_check_in_id uuid) returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare s public.route_stops; r public.route_plans; c public.check_ins;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select * into r from public.route_plans where id=p_route_id and user_id=auth.uid() for update;
 if not found then raise exception 'route not found'; end if;
 if r.status <> 'active' then raise exception 'route is not active'; end if;
 select * into s from public.route_stops where id=p_route_stop_id and route_id=r.id for update;
 if not found then raise exception 'route stop does not belong to route'; end if;
 select * into c from public.check_ins where id=p_check_in_id and user_id=auth.uid() for share;
 if not found then raise exception 'qualifying check-in not found'; end if;
 if c.location_id <> s.location_id then raise exception 'check-in location does not match route stop'; end if;
 if c.distance_meters is null or c.distance_meters > 250 then raise exception 'check-in is not within qualifying arrival distance'; end if;
 if s.checked_in_at is not null then return jsonb_build_object('route_id',r.id,'route_stop_id',s.id,'location_id',s.location_id,'already_arrived',true); end if;
 update public.route_stops set checked_in_at=c.checked_in_at where id=s.id;
 insert into public.route_events(route_id,user_id,event_type,route_stop_id,points_awarded,metadata) values(r.id,auth.uid(),'stop_arrived',coalesce(s.points_value,0),jsonb_build_object('check_in_id',c.id,'location_id',s.location_id));
 return jsonb_build_object('route_id',r.id,'route_stop_id',s.id,'location_id',s.location_id,'already_arrived',false,'points',coalesce(s.points_value,0));
end $function$;
