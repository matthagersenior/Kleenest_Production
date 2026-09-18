create or replace function public.enterprise_operational_portfolio_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if not public.business_capability_allowed(p_business_id,'enterprise.portfolio_fleet') then
    raise exception 'Enterprise portfolio capability and business management access required';
  end if;

  with portfolio_business_ids as (
    select p_business_id as business_id
    union
    select m.partner_business_id
    from public.enterprise_partner_networks n
    join public.enterprise_partner_network_members m on m.network_id=n.id and m.status='active'
    where n.owner_business_id=p_business_id and coalesce(n.enabled,true)
  ),
  business_rows as (
    select b.id,b.name,b.business_tier::text as tier,
           (select count(*) from public.locations l where (l.business_id=b.id or l.claimed_business_id=b.id) and coalesce(l.is_active,true))::integer as location_count,
           (select count(*) from public.fleet_vehicles v where v.business_id=b.id and coalesce(v.status,'active')<>'retired')::integer as vehicle_count,
           (select count(*) from public.fleet_drivers d where d.business_id=b.id and coalesce(d.status,'active')<>'inactive')::integer as driver_count,
           (select count(*) from public.fleet_routes r where r.business_id=b.id and r.status in ('planned','dispatched','active','in_progress','paused'))::integer as open_route_count
    from public.businesses b join portfolio_business_ids p on p.business_id=b.id
  ),
  location_rows as (
    select l.id,l.business_id,coalesce(l.claimed_business_id,l.business_id) as resolved_business_id,b.name as business_name,
           l.name,l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,l.place_type,l.rating,l.review_count,
           l.bathroom_verification_status,l.geofence_radius_m
    from public.locations l
    join portfolio_business_ids p on p.business_id=coalesce(l.claimed_business_id,l.business_id)
    left join public.businesses b on b.id=coalesce(l.claimed_business_id,l.business_id)
    where coalesce(l.is_active,true)
    order by b.name,l.name limit 1000
  ),
  route_rows as (
    select r.id,r.business_id,b.name as business_name,r.name,r.status,r.scheduled_for,r.stops_count,r.distance_miles,r.estimated_minutes,
           r.dispatched_at,r.started_at,r.actual_completed_at,r.dispatch_locked,
           v.id as vehicle_id,coalesce(v.name,v.unit_code) as vehicle_name,v.current_lat,v.current_lng,
           d.id as driver_id,d.name as driver_name
    from public.fleet_routes r
    join portfolio_business_ids p on p.business_id=r.business_id
    join public.businesses b on b.id=r.business_id
    left join public.fleet_vehicles v on v.id=r.vehicle_id
    left join public.fleet_drivers d on d.id=r.driver_id
    where r.status in ('planned','dispatched','active','in_progress','paused')
    order by coalesce(r.scheduled_for,r.created_at) desc limit 250
  ),
  alert_rows as (
    select a.id,a.business_id,b.name as business_name,a.severity,a.alert_type,a.title,a.details,a.status,a.created_at,a.vehicle_id
    from public.fleet_alerts a
    join portfolio_business_ids p on p.business_id=a.business_id
    join public.businesses b on b.id=a.business_id
    where coalesce(a.status,'open') not in ('resolved','closed')
    order by case lower(coalesce(a.severity,'')) when 'critical' then 0 when 'high' then 1 when 'warning' then 2 else 3 end,a.created_at desc
    limit 250
  )
  select jsonb_build_object(
    'business_id',p_business_id,
    'businesses',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from business_rows x),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(to_jsonb(x)) from location_rows x),'[]'::jsonb),
    'routes',coalesce((select jsonb_agg(to_jsonb(x)) from route_rows x),'[]'::jsonb),
    'alerts',coalesce((select jsonb_agg(to_jsonb(x)) from alert_rows x),'[]'::jsonb),
    'summary',jsonb_build_object(
      'business_count',(select count(*) from business_rows),
      'location_count',(select count(*) from location_rows),
      'open_route_count',(select count(*) from route_rows),
      'open_alert_count',(select count(*) from alert_rows),
      'active_route_count',(select count(*) from route_rows where status in ('dispatched','active','in_progress'))
    )
  ) into result;
  return result;
end $$;
revoke all on function public.enterprise_operational_portfolio_snapshot(uuid) from public,anon;
grant execute on function public.enterprise_operational_portfolio_snapshot(uuid) to authenticated,service_role;
