-- Refine the Fleet real-world demo to stable, recognizable St. Louis canonical locations.
-- No generated location IDs are hardcoded; locations are resolved by canonical name/address.

do $$
declare
  b uuid;
  r_morning uuid;
  r_afternoon uuid;
  stoprec record;
  idx integer;
begin
  select id into b
  from public.businesses
  where name='Kleenest Demo Fleet' and is_demo_test=true and lower(business_tier::text)='fleet'
  order by created_at limit 1;
  if b is null then return; end if;

  select id into r_morning from public.fleet_routes
  where business_id=b and metadata->>'demo_key'='morning_field_service' limit 1;
  select id into r_afternoon from public.fleet_routes
  where business_id=b and metadata->>'demo_key'='afternoon_recovery' limit 1;
  if r_morning is null or r_afternoon is null then return; end if;

  delete from public.fleet_route_stops
  where business_id=b and route_id in(r_morning,r_afternoon)
    and metadata->>'demo_seed'='demo_fleet_stop';

  idx:=0;
  for stoprec in
    select l.id,l.name,x.stop_order
    from (values
      (1,'America’s Center Convention Complex','823 Washington Avenue'),
      (2,'Central West End Transit Center','4510 Children''s Place'),
      (3,'Barnes-Jewish Center for Outpatient Health','4901 Forest Park Avenue')
    ) as x(stop_order,name,address)
    join public.locations l on l.name=x.name and l.address=x.address
    where coalesce(l.is_active,true)
    order by x.stop_order
  loop
    idx:=idx+1;
    insert into public.fleet_route_stops(
      business_id,route_id,location_id,stop_order,status,
      planned_arrival_at,planned_ttl_minutes,planned_dwell_minutes,metadata
    ) values(
      b,r_morning,stoprec.id,stoprec.stop_order,
      case stoprec.stop_order when 1 then 'completed' when 2 then 'arrived' else 'planned' end,
      now()+(stoprec.stop_order-2)*interval '30 minutes',30,12,
      jsonb_build_object(
        'demo_seed','demo_fleet_stop',
        'demo_refinement','demo_fleet_route_refinement',
        'scenario','morning_field_service',
        'location_name',stoprec.name
      )
    );
  end loop;
  if idx<>3 then raise exception 'Expected 3 canonical morning demo stops, found %',idx; end if;

  idx:=0;
  for stoprec in
    select l.id,l.name,x.stop_order
    from (values
      (1,'12th & Park Recreation Center','1410 South Tucker Boulevard'),
      (2,'Blueprint Coffee','4206 Watson Road')
    ) as x(stop_order,name,address)
    join public.locations l on l.name=x.name and l.address=x.address
    where coalesce(l.is_active,true)
    order by x.stop_order
  loop
    idx:=idx+1;
    insert into public.fleet_route_stops(
      business_id,route_id,location_id,stop_order,status,
      planned_arrival_at,planned_ttl_minutes,planned_dwell_minutes,metadata
    ) values(
      b,r_afternoon,stoprec.id,stoprec.stop_order,'planned',
      now()+interval '3 hours'+(stoprec.stop_order-1)*interval '35 minutes',35,15,
      jsonb_build_object(
        'demo_seed','demo_fleet_stop',
        'demo_refinement','demo_fleet_route_refinement',
        'scenario','afternoon_recovery',
        'location_name',stoprec.name
      )
    );
  end loop;
  if idx<>2 then raise exception 'Expected 2 canonical afternoon demo stops, found %',idx; end if;

  update public.fleet_routes
  set stops_count=case when id=r_morning then 3 else 2 end,
      updated_at=now(),
      metadata=metadata||jsonb_build_object('demo_refinement','demo_fleet_route_refinement')
  where id in(r_morning,r_afternoon);

  delete from public.fleet_monitored_locations where business_id=b;
  insert into public.fleet_monitored_locations(business_id,location_id,enabled)
  select b,s.location_id,true
  from public.fleet_route_stops s
  where s.business_id=b and s.route_id in(r_morning,r_afternoon)
    and s.metadata->>'demo_seed'='demo_fleet_stop'
  group by s.location_id;
end $$;
