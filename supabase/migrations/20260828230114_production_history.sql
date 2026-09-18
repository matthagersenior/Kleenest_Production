create or replace function public.create_route_plan(p_name text, p_start_lat double precision, p_start_lng double precision, p_end_lat double precision, p_end_lng double precision, p_distance_miles numeric, p_estimated_minutes integer, p_stop_location_ids uuid[] default '{}'::uuid[]) returns uuid language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare rid uuid; ids uuid[]; invalid_count integer; duplicate_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_start_lat is null or p_start_lng is null or p_end_lat is null or p_end_lng is null then raise exception 'route coordinates are required'; end if;
  if p_start_lat not between -90 and 90 or p_end_lat not between -90 and 90 or p_start_lng not between -180 and 180 or p_end_lng not between -180 and 180 then raise exception 'route coordinates are invalid'; end if;
  if p_distance_miles is null or p_distance_miles < 0 or p_estimated_minutes is null or p_estimated_minutes < 0 then raise exception 'route metrics are invalid'; end if;
  ids := coalesce(p_stop_location_ids,'{}'::uuid[]);
  select count(*) into duplicate_count from (select unnest(ids) x group by 1 having count(*)>1) d;
  if duplicate_count > 0 then raise exception 'route stops contain duplicate locations'; end if;
  select count(*) into invalid_count from unnest(ids) x where not exists (select 1 from public.locations l where l.id=x and l.latitude is not null and l.longitude is not null and l.latitude between -90 and 90 and l.longitude between -180 and 180);
  if invalid_count > 0 then raise exception 'route contains an invalid canonical location'; end if;
  insert into public.route_plans(user_id,name,start_lat,start_lng,end_lat,end_lng,distance_miles,estimated_minutes,stops_count)
    values(auth.uid(),coalesce(nullif(trim(p_name),''),'My route'),p_start_lat,p_start_lng,p_end_lat,p_end_lng,p_distance_miles,p_estimated_minutes,cardinality(ids)) returning id into rid;
  insert into public.route_stops(route_id,location_id,stop_order,points_value) select rid,x,row_number() over (),15 from unnest(ids) x;
  insert into public.route_events(route_id,user_id,event_type,points_awarded,metadata) values(rid,auth.uid(),'started',0,jsonb_build_object('source','create_route_plan','stop_count',cardinality(ids)));
  return rid;
end $function$;

create unique index if not exists route_stops_route_location_unique on public.route_stops(route_id,location_id);
create unique index if not exists route_stops_route_order_unique on public.route_stops(route_id,stop_order);
