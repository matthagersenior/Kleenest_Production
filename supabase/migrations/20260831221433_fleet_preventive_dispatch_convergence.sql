create or replace function public.fleet_preventive_dispatch_opportunities(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); v_work jsonb; v_routes jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not public.business_fleet_authorized(p_business_id) then raise exception 'Fleet access is not enabled for this business'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'work_order_id',w.id,'location_id',w.location_id,'location_name',l.name,'amenity_id',w.amenity_id,'amenity_name',a.name,
    'priority',w.priority,'status',w.status,'recommendation_action',w.recommendation_action,'due_at',w.due_at,
    'escalation_level',w.escalation_level,'escalated_at',w.escalated_at,
    'assigned_route_stop_id',fs.id,'assigned_route_id',fs.route_id
  ) order by case when coalesce(w.escalation_level,0)>=2 then 0 when coalesce(w.escalation_level,0)>=1 then 1 when w.due_at<=now()+interval '4 hours' then 2 else 3 end,
  case w.priority when 'critical' then 0 when 'high' then 1 else 2 end,w.due_at nulls last),'[]'::jsonb)
  into v_work
  from public.business_restroom_preventive_work_orders w
  join public.locations l on l.id=w.location_id
  join public.amenities a on a.id=w.amenity_id
  left join lateral (
    select s.id,s.route_id from public.fleet_route_stops s
    join public.fleet_routes r on r.id=s.route_id
    where s.business_id=p_business_id and s.metadata->>'preventive_work_order_id'=w.id::text and r.status not in('cancelled','failed','completed')
    order by s.created_at desc limit 1
  ) fs on true
  where w.business_id=p_business_id and w.status in('planned','assigned','in_progress');
  select coalesce(jsonb_agg(jsonb_build_object(
    'route_id',r.id,'name',r.name,'status',r.status,'scheduled_for',r.scheduled_for,'driver_id',r.driver_id,'vehicle_id',r.vehicle_id,
    'stops_count',r.stops_count,'dispatch_locked',r.dispatch_locked
  ) order by r.scheduled_for nulls last,r.updated_at desc),'[]'::jsonb)
  into v_routes
  from public.fleet_routes r
  where r.business_id=p_business_id and r.status='planned' and coalesce(r.dispatch_locked,false)=false;
  return jsonb_build_object('business_id',p_business_id,'work_orders',v_work,'routes',v_routes,'generated_at',now());
end $$;
revoke all on function public.fleet_preventive_dispatch_opportunities(uuid) from public,anon;
grant execute on function public.fleet_preventive_dispatch_opportunities(uuid) to authenticated,service_role;

create or replace function public.fleet_attach_preventive_work_to_route(p_business_id uuid,p_work_order_id uuid,p_route_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  w public.business_restroom_preventive_work_orders%rowtype;
  r public.fleet_routes%rowtype;
  existing public.fleet_route_stops%rowtype;
  created public.fleet_route_stops%rowtype;
  next_order integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager access required'; end if;
  select * into w from public.business_restroom_preventive_work_orders where id=p_work_order_id and business_id=p_business_id for update;
  if not found then raise exception 'Preventive work order not found'; end if;
  if w.status not in('planned','assigned','in_progress') then raise exception 'Only active preventive work can be routed'; end if;
  select * into r from public.fleet_routes where id=p_route_id and business_id=p_business_id for update;
  if not found then raise exception 'Fleet route not found'; end if;
  if r.status<>'planned' or coalesce(r.dispatch_locked,false) then raise exception 'Preventive work can only be attached to an unlocked planned route'; end if;
  select s.* into existing from public.fleet_route_stops s where s.route_id=p_route_id and s.metadata->>'preventive_work_order_id'=p_work_order_id::text order by s.created_at desc limit 1;
  if existing.id is not null then return jsonb_build_object('route_id',p_route_id,'route_stop_id',existing.id,'work_order_id',p_work_order_id,'already_attached',true); end if;
  select coalesce(max(stop_order),0)+1 into next_order from public.fleet_route_stops where route_id=p_route_id;
  insert into public.fleet_route_stops(business_id,route_id,location_id,stop_order,status,planned_dwell_minutes,metadata)
  values(p_business_id,p_route_id,w.location_id,next_order,'planned',20,jsonb_build_object('source','preventive_work_order','preventive_work_order_id',w.id,'amenity_id',w.amenity_id,'priority',w.priority,'recommendation_action',w.recommendation_action,'due_at',w.due_at,'server_authoritative',true)) returning * into created;
  update public.fleet_routes set stops_count=next_order,updated_at=now() where id=p_route_id;
  return jsonb_build_object('route_id',p_route_id,'route_stop_id',created.id,'work_order_id',p_work_order_id,'stop_order',next_order,'already_attached',false);
end $$;
revoke all on function public.fleet_attach_preventive_work_to_route(uuid,uuid,uuid) from public,anon;
grant execute on function public.fleet_attach_preventive_work_to_route(uuid,uuid,uuid) to authenticated,service_role;
