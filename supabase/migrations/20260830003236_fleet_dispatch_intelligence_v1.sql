create or replace function public.fleet_dispatch_intelligence(p_business_id uuid,p_route_id uuid default null,p_limit integer default 20)
returns jsonb
language plpgsql stable security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare
  v_route public.fleet_routes;
  v_candidates jsonb;
  v_drivers jsonb;
  v_vehicles jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
  if p_route_id is not null then
    select * into v_route from public.fleet_routes where id=p_route_id and business_id=p_business_id;
    if not found then raise exception 'Route not found'; end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score desc,x.name),'[]'::jsonb) into v_candidates
  from (
    select o.location_id,o.name,o.latitude,o.longitude,o.bathroom_verification_status,o.rating,o.accessible,o.changing_table,o.amenity_count,o.quality_observation_count,o.verified_bathroom,o.needs_fresh_observation,
      (case when coalesce(o.needs_fresh_observation,0)>0 then 50 else 0 end
       + case when coalesce(o.verified_bathroom,0)=0 then 30 else 0 end
       + case when o.rating is null then 10 when o.rating<3 then 20 else 0 end
       + case when coalesce(o.quality_observation_count,0)=0 then 15 else 0 end)::integer priority_score,
      array_remove(array[
        case when coalesce(o.needs_fresh_observation,0)>0 then 'needs fresh observation' end,
        case when coalesce(o.verified_bathroom,0)=0 then 'bathroom not verified' end,
        case when o.rating is null then 'rating missing' when o.rating<3 then 'low rating' end,
        case when coalesce(o.quality_observation_count,0)=0 then 'no quality observations' end
      ],null) reasons
    from public.fleet_service_opportunities_for_business(p_business_id) o
    where not exists(select 1 from public.fleet_route_stops s where s.route_id=p_route_id and s.location_id=o.location_id)
    order by priority_score desc,o.name
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'status',d.status,'vehicle_id',d.vehicle_id,'user_id',d.user_id,'ready',d.status='active') order by (d.status='active') desc,d.name),'[]'::jsonb)
  into v_drivers from public.fleet_drivers d where d.business_id=p_business_id;

  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'unit_code',v.unit_code,'status',v.status,'vehicle_type',v.vehicle_type,'driver_name',v.driver_name,'ready',v.status='active') order by (v.status='active') desc,v.name),'[]'::jsonb)
  into v_vehicles from public.fleet_vehicles v where v.business_id=p_business_id;

  return jsonb_build_object(
    'business_id',p_business_id,
    'route_id',p_route_id,
    'route',case when p_route_id is null then null else jsonb_build_object('id',v_route.id,'name',v_route.name,'status',v_route.status,'driver_id',v_route.driver_id,'vehicle_id',v_route.vehicle_id,'scheduled_for',v_route.scheduled_for,'dispatch_locked',v_route.dispatch_locked,'stops_count',v_route.stops_count) end,
    'candidate_stops',v_candidates,
    'drivers',v_drivers,
    'vehicles',v_vehicles,
    'generated_at',now(),
    'model','authoritative_dispatch_intelligence_v1'
  );
end $$;
revoke execute on function public.fleet_dispatch_intelligence(uuid,uuid,integer) from public,anon;
grant execute on function public.fleet_dispatch_intelligence(uuid,uuid,integer) to authenticated;
