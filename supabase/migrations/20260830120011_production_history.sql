create or replace function public.fleet_current_user_dispatch(p_business_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  d public.fleet_drivers%rowtype;
  v jsonb;
  routes jsonb;
  score jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select fd.* into d
  from public.fleet_drivers fd
  where fd.user_id=uid
    and (p_business_id is null or fd.business_id=p_business_id)
  order by fd.updated_at desc
  limit 1;

  if d.id is null then
    return jsonb_build_object('driver',null,'vehicle',null,'routes','[]'::jsonb,'performance',null);
  end if;

  select to_jsonb(fv) into v
  from public.fleet_vehicles fv
  where fv.id=coalesce(d.vehicle_id,(select fr.vehicle_id from public.fleet_routes fr where fr.driver_id=d.id and fr.business_id=d.business_id and fr.status in ('planned','active','paused') order by fr.scheduled_for nulls last,fr.updated_at desc limit 1));

  select coalesce(jsonb_agg(
    to_jsonb(fr) || jsonb_build_object(
      'stops',coalesce((select jsonb_agg(to_jsonb(fs) order by fs.stop_order) from public.fleet_route_stops fs where fs.route_id=fr.id),'[]'::jsonb)
    )
    order by case fr.status when 'active' then 0 when 'paused' then 1 when 'planned' then 2 else 3 end, fr.scheduled_for nulls last, fr.updated_at desc
  ),'[]'::jsonb)
  into routes
  from public.fleet_routes fr
  where fr.business_id=d.business_id and fr.driver_id=d.id and fr.status not in ('cancelled','failed');

  select to_jsonb(s) into score
  from public.fleet_driver_scorecards s
  where s.business_id=d.business_id and s.driver_id=d.id
  order by s.score_date desc,s.created_at desc
  limit 1;

  return jsonb_build_object(
    'business_id',d.business_id,
    'driver',to_jsonb(d),
    'vehicle',v,
    'routes',routes,
    'performance',score
  );
end;
$$;
revoke all on function public.fleet_current_user_dispatch(uuid) from public,anon;
grant execute on function public.fleet_current_user_dispatch(uuid) to authenticated;
