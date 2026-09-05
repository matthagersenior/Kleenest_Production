create or replace function public.fleet_manager_dispatch(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_routes jsonb;
  v_preventive_stops jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.fleet_actor_is_manager(p_business_id) then
    raise exception 'Fleet manager access required';
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(r)
      || jsonb_build_object(
        'stops', coalesce((
          select jsonb_agg(to_jsonb(s) order by s.stop_order)
          from public.fleet_route_stops s
          where s.route_id = r.id and s.business_id = r.business_id
        ), '[]'::jsonb),
        'driver', (select to_jsonb(d) from public.fleet_drivers d where d.id = r.driver_id and d.business_id = r.business_id),
        'vehicle', (select to_jsonb(v) from public.fleet_vehicles v where v.id = r.vehicle_id and v.business_id = r.business_id)
      )
    order by case r.status when 'active' then 0 when 'paused' then 1 when 'planned' then 2 else 3 end,
             r.scheduled_for nulls last,
             r.updated_at desc
  ), '[]'::jsonb)
  into v_routes
  from public.fleet_routes r
  where r.business_id = p_business_id
    and r.status not in ('cancelled','failed');

  select coalesce(jsonb_agg(jsonb_build_object(
    'route_id',r.id,
    'route_name',r.name,
    'route_status',r.status,
    'scheduled_for',r.scheduled_for,
    'route_stop_id',s.id,
    'stop_order',s.stop_order,
    'stop_status',s.status,
    'location_id',s.location_id,
    'work_order_id',s.metadata->>'preventive_work_order_id',
    'amenity_id',s.metadata->>'amenity_id',
    'priority',s.metadata->>'priority',
    'recommendation_action',s.metadata->>'recommendation_action',
    'due_at',s.metadata->>'due_at'
  ) order by case r.status when 'active' then 0 when 'paused' then 1 when 'planned' then 2 else 3 end,s.stop_order), '[]'::jsonb)
  into v_preventive_stops
  from public.fleet_routes r
  join public.fleet_route_stops s on s.route_id=r.id and s.business_id=r.business_id
  where r.business_id=p_business_id
    and r.status not in ('cancelled','failed')
    and nullif(s.metadata->>'preventive_work_order_id','') is not null;

  return jsonb_build_object(
    'business_id', p_business_id,
    'routes', v_routes,
    'preventive_stops', v_preventive_stops
  );
end;
$$;

revoke all on function public.fleet_manager_dispatch(uuid) from public, anon;
grant execute on function public.fleet_manager_dispatch(uuid) to authenticated, service_role;
