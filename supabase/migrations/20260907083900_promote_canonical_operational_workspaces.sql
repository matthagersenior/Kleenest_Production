do $$
declare
  v_demo_fleet uuid;
  v_fleet uuid;
  v_demo_enterprise uuid;
  v_enterprise uuid;
begin
  select id into strict v_demo_fleet from public.businesses where name='Kleenest Demo Fleet' and is_demo_test=true;
  select id into strict v_fleet from public.businesses where name='Kleenest Fleet' and is_demo_test=false;
  select id into strict v_demo_enterprise from public.businesses where name='Matt Test Business' and is_demo_test=true;
  select id into strict v_enterprise from public.businesses where name='Kleenest Enterprise' and is_demo_test=false;

  if exists(select 1 from public.locations where business_id in (v_fleet,v_enterprise))
     or exists(select 1 from public.fleet_vehicles where business_id in (v_fleet,v_enterprise))
     or exists(select 1 from public.fleet_drivers where business_id in (v_fleet,v_enterprise))
     or exists(select 1 from public.fleet_routes where business_id in (v_fleet,v_enterprise))
     or exists(select 1 from public.fleet_route_stops where business_id in (v_fleet,v_enterprise))
     or exists(select 1 from public.qr_codes where business_id in (v_fleet,v_enterprise)) then
    raise exception 'Canonical operational workspaces already contain inventory; refusing to merge demo ownership automatically.';
  end if;

  update public.locations
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end,
         claimed_business_id=case claimed_business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else claimed_business_id end,
         updated_at=now()
   where business_id in (v_demo_fleet,v_demo_enterprise)
      or claimed_business_id in (v_demo_fleet,v_demo_enterprise);

  update public.location_claims
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end,
         updated_at=now()
   where business_id in (v_demo_fleet,v_demo_enterprise);

  update public.qr_codes
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end
   where business_id in (v_demo_fleet,v_demo_enterprise);

  update public.qr_code_versions
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end
   where business_id in (v_demo_fleet,v_demo_enterprise);

  update public.fleet_vehicles
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end,
         updated_at=now()
   where business_id in (v_demo_fleet,v_demo_enterprise);

  update public.fleet_drivers
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end,
         updated_at=now()
   where business_id in (v_demo_fleet,v_demo_enterprise);

  update public.fleet_routes
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end,
         updated_at=now()
   where business_id in (v_demo_fleet,v_demo_enterprise);

  update public.fleet_route_stops
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end,
         updated_at=now()
   where business_id in (v_demo_fleet,v_demo_enterprise);

  update public.fleet_monitored_locations
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end,
         updated_at=now()
   where business_id in (v_demo_fleet,v_demo_enterprise);

  update public.fleet_dispatch_signal_policies
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end,
         updated_at=now()
   where business_id in (v_demo_fleet,v_demo_enterprise);

  update public.fleet_exception_policies
     set business_id=case business_id when v_demo_fleet then v_fleet when v_demo_enterprise then v_enterprise else business_id end,
         updated_at=now()
   where business_id in (v_demo_fleet,v_demo_enterprise);
end $$;
