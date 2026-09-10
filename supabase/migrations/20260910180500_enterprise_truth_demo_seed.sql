-- Deterministic, explicitly demo-only evidence for Business/Enterprise acceptance.
-- Every created record is attached to an existing is_demo_test workspace and carries
-- an enterprise_truth marker so it can be audited separately from customer data.

do $$
declare
  v_business uuid;
  v_amenity uuid;
  v_owner uuid;
  v_manager uuid;
  v_analyst uuid;
  v_staff uuid;
  v_partner_one uuid;
  v_partner_two uuid;
  v_network uuid;
  v_campaign uuid;
  v_location uuid;
  v_qr uuid;
  v_vehicle_one uuid;
  v_vehicle_two uuid;
  v_driver_one uuid;
  v_driver_two uuid;
  v_i integer;
begin
  select id into v_business
  from public.businesses
  where name='Matt Test Business' and is_demo_test=true and lower(business_tier::text)='enterprise'
  order by created_at limit 1;
  if v_business is null then raise exception 'Enterprise truth seed requires demo Enterprise business Matt Test Business'; end if;

  select id into v_amenity from public.amenities where lower(name)='public restroom' order by created_at limit 1;
  if v_amenity is null then raise exception 'Enterprise truth seed requires Public Restroom amenity'; end if;

  select user_id into v_owner from public.business_members where business_id=v_business and role='owner' order by created_at limit 1;
  select bm.user_id into v_manager from public.business_members bm join public.businesses b on b.id=bm.business_id
    where b.name='Kleenest Demo Fleet' and b.is_demo_test=true and bm.role='manager' order by bm.created_at limit 1;
  select bm.user_id into v_analyst from public.business_members bm join public.businesses b on b.id=bm.business_id
    where b.name='Kleenest Demo Fleet' and b.is_demo_test=true and bm.role='analyst' order by bm.created_at limit 1;
  select bm.user_id into v_staff from public.business_members bm join public.businesses b on b.id=bm.business_id
    where b.name='Kleenest Demo Fleet' and b.is_demo_test=true and bm.role='staff' order by bm.created_at limit 1;
  if v_owner is null or v_manager is null or v_analyst is null or v_staff is null then
    raise exception 'Enterprise truth seed requires existing demo owner/manager/analyst/staff users';
  end if;

  insert into public.business_members(business_id,user_id,role) values
    (v_business,v_manager,'manager'),(v_business,v_analyst,'analyst'),(v_business,v_staff,'staff')
  on conflict (business_id,user_id) do nothing;

  -- Five isolated demo locations. Coordinates are intentionally null so acceptance
  -- evidence does not enter consumer proximity/map results.
  for v_i in 1..5 loop
    if not exists(select 1 from public.locations where source_dataset='enterprise_truth_demo' and source_external_id='enterprise-demo-'||lpad(v_i::text,2,'0')) then
      insert into public.locations(
        business_id,name,address,city,state,postal_code,country,place_type,source,source_dataset,source_external_id,
        source_metadata,is_active,is_premium,accessible,changing_table,cleanliness,cleanliness_pct,rating,review_count,
        smart_bathroom,geofence_radius_m,bathroom_verification_status,bathroom_verification_source,
        bathroom_verification_count,bathroom_positive_count,bathroom_negative_count,verification_observation_count,
        verification_positive_count,verification_negative_count,verification_confidence
      ) values (
        v_business,'Enterprise Truth Location '||v_i,'Demo-only acceptance location '||v_i,'Kleenest Demo','MO','00000','US','business','demo',
        'enterprise_truth_demo','enterprise-demo-'||lpad(v_i::text,2,'0'),jsonb_build_object('demo_seed','enterprise_truth_locations','ordinal',v_i),
        true,false,(v_i%2=0),(v_i=3),case when v_i=4 then 'needs_attention' else 'clean' end,
        case when v_i=4 then 58 else 92 end,case when v_i=4 then 3.2 else 4.7 end,0,(v_i=2),150,
        'has_bathroom','enterprise_truth_demo',4,4,0,4,4,0,0.95
      );
    else
      update public.locations set business_id=v_business,claimed_business_id=null,is_active=true
      where source_dataset='enterprise_truth_demo' and source_external_id='enterprise-demo-'||lpad(v_i::text,2,'0');
    end if;
  end loop;

  insert into public.location_amenities(location_id,amenity_id)
  select l.id,v_amenity from public.locations l
  where l.business_id=v_business and l.source_dataset='enterprise_truth_demo'
  on conflict (location_id,amenity_id) do nothing;

  -- Three branded QR assets with scans and redemptions.
  for v_i in 1..3 loop
    select id into v_location from public.locations
      where business_id=v_business and source_dataset='enterprise_truth_demo' and source_external_id='enterprise-demo-'||lpad(v_i::text,2,'0') limit 1;
    select id into v_qr from public.qr_codes where code='enterprise-truth-demo-qr-'||lpad(v_i::text,2,'0') limit 1;
    if v_qr is null then
      insert into public.qr_codes(business_id,location_id,code,active,label,customization,purpose,action_type,action_payload,single_use,max_redemptions)
      values(v_business,v_location,'enterprise-truth-demo-qr-'||lpad(v_i::text,2,'0'),true,'Enterprise Truth QR '||v_i,
        jsonb_build_object('demo_seed','enterprise_truth_qr','style','business_brand'),'checkin','checkin',jsonb_build_object('location_id',v_location),false,null)
      returning id into v_qr;
    else
      update public.qr_codes set business_id=v_business,location_id=v_location,active=true where id=v_qr;
    end if;

    if not exists(select 1 from public.qr_attribution_events where qr_code_id=v_qr and metadata->>'demo_seed'='enterprise_truth_qr') then
      insert into public.qr_attribution_events(qr_code_id,location_id,business_id,user_id,action_type,source,metadata,created_at)
      select v_qr,v_location,v_business,
        case (g%3) when 0 then v_manager when 1 then v_analyst else v_staff end,
        'scan','enterprise_truth_demo',jsonb_build_object('demo_seed','enterprise_truth_qr','sample',g),now()-(g||' hours')::interval
      from generate_series(1,4) g;
    end if;

    if not exists(select 1 from public.qr_redemptions where qr_code_id=v_qr and metadata->>'demo_seed'='enterprise_truth_qr') then
      insert into public.qr_redemptions(qr_code_id,user_id,metadata,redeemed_at)
      values(v_qr,case v_i when 1 then v_manager when 2 then v_analyst else v_staff end,
        jsonb_build_object('demo_seed','enterprise_truth_qr','result','redeemed'),now()-(v_i||' hours')::interval);
    end if;
  end loop;

  select id into v_partner_one from public.businesses where name='Kleenest Demo Fleet' and is_demo_test=true order by created_at limit 1;
  select id into v_partner_two from public.businesses where name='Kleenest Demo Standard' and is_demo_test=true order by created_at limit 1;
  if v_partner_one is null or v_partner_two is null then raise exception 'Enterprise truth seed requires two demo partner businesses'; end if;

  select id into v_network from public.enterprise_partner_networks where owner_business_id=v_business and name='Kleenest Mock Enterprise Network' order by created_at limit 1;
  if v_network is null then
    insert into public.enterprise_partner_networks(owner_business_id,name,enabled)
    values(v_business,'Kleenest Mock Enterprise Network',true) returning id into v_network;
  else
    update public.enterprise_partner_networks set enabled=true where id=v_network;
  end if;

  insert into public.enterprise_partner_network_members(network_id,partner_business_id,status)
  values(v_network,v_partner_one,'active'),(v_network,v_partner_two,'active')
  on conflict(network_id,partner_business_id) do update set status='active';

  select id into v_campaign from public.enterprise_partner_campaigns
    where network_id=v_network and name='Summer Check-In Challenge' order by created_at limit 1;
  if v_campaign is null then
    insert into public.enterprise_partner_campaigns(network_id,name,campaign_type,goal,status,activated_at)
    values(v_network,'Summer Check-In Challenge','engagement','Prove partner attribution and ROI','active',now()-interval '14 days')
    returning id into v_campaign;
  else
    update public.enterprise_partner_campaigns set status='active',activated_at=coalesce(activated_at,now()-interval '14 days') where id=v_campaign;
  end if;

  insert into public.enterprise_partner_network_metrics(network_id,metric_date,visits,check_ins,reviews,preferred_uses,access_redemptions,promotion_redemptions)
  values(v_network,current_date-1,240,156,38,52,31,44)
  on conflict(network_id,metric_date) do update set visits=excluded.visits,check_ins=excluded.check_ins,reviews=excluded.reviews,
    preferred_uses=excluded.preferred_uses,access_redemptions=excluded.access_redemptions,promotion_redemptions=excluded.promotion_redemptions;

  insert into public.enterprise_partner_campaign_outcomes(campaign_id,partner_business_id,metric_date,visits,check_ins,reviews,preferred_uses,access_redemptions,promotion_redemptions,attributed_users,points_awarded)
  values
    (v_campaign,v_partner_one,current_date-1,140,92,24,31,18,27,78,460),
    (v_campaign,v_partner_two,current_date-1,100,64,14,21,13,17,54,320)
  on conflict(campaign_id,partner_business_id,metric_date) do update set visits=excluded.visits,check_ins=excluded.check_ins,reviews=excluded.reviews,
    preferred_uses=excluded.preferred_uses,access_redemptions=excluded.access_redemptions,promotion_redemptions=excluded.promotion_redemptions,
    attributed_users=excluded.attributed_users,points_awarded=excluded.points_awarded;

  if not exists(select 1 from public.enterprise_partner_allocations where network_id=v_network and partner_business_id=v_partner_one and rationale like '%enterprise_truth_allocation%') then
    insert into public.enterprise_partner_allocations(network_id,partner_business_id,campaign_id,allocation_type,quantity,budget_cents,status,rationale,activated_at)
    values(v_network,v_partner_one,v_campaign,'points',500,12500,'active','enterprise_truth_allocation: partner-one funded engagement proof',now()-interval '10 days');
  end if;
  if not exists(select 1 from public.enterprise_partner_allocations where network_id=v_network and partner_business_id=v_partner_two and rationale like '%enterprise_truth_allocation%') then
    insert into public.enterprise_partner_allocations(network_id,partner_business_id,campaign_id,allocation_type,quantity,budget_cents,status,rationale,activated_at)
    values(v_network,v_partner_two,v_campaign,'points',350,9000,'active','enterprise_truth_allocation: partner-two funded engagement proof',now()-interval '10 days');
  end if;

  select id into v_location from public.locations where business_id=v_business and source_dataset='enterprise_truth_demo' and source_external_id='enterprise-demo-04' limit 1;
  if not exists(select 1 from public.business_restroom_remediation_cases where business_id=v_business and resolution_snapshot->>'demo_seed'='enterprise_truth_remediation') then
    insert into public.business_restroom_remediation_cases(business_id,location_id,amenity_id,status,priority,assigned_to,opened_at,assigned_at,started_at,due_at,resolution_snapshot)
    values(v_business,v_location,v_amenity,'in_progress',82,v_manager,now()-interval '4 hours',now()-interval '3 hours',now()-interval '2 hours',now()+interval '8 hours',jsonb_build_object('demo_seed','enterprise_truth_remediation','scenario','supply_issue'));
  end if;

  select id into v_location from public.locations where business_id=v_business and source_dataset='enterprise_truth_demo' and source_external_id='enterprise-demo-02' limit 1;
  if not exists(select 1 from public.business_restroom_preventive_work_orders where business_id=v_business and source_snapshot->>'demo_seed'='enterprise_truth_preventive' and source_snapshot->>'scenario'='scheduled') then
    insert into public.business_restroom_preventive_work_orders(business_id,location_id,amenity_id,recommendation_action,priority,status,source_snapshot,assigned_to,due_at,assigned_at)
    values(v_business,v_location,v_amenity,'Inspect high-traffic restroom supplies before peak period','high','assigned',jsonb_build_object('demo_seed','enterprise_truth_preventive','scenario','scheduled'),v_staff,now()+interval '1 day',now()-interval '1 hour');
  end if;
  if not exists(select 1 from public.business_restroom_preventive_work_orders where business_id=v_business and source_snapshot->>'demo_seed'='enterprise_truth_preventive' and source_snapshot->>'scenario'='completed') then
    insert into public.business_restroom_preventive_work_orders(business_id,location_id,amenity_id,recommendation_action,priority,status,source_snapshot,assigned_to,due_at,assigned_at,started_at,completed_at,completion_notes,verification_status,verification_outcome,verified_by,verified_at)
    values(v_business,v_location,v_amenity,'Restock and inspect accessible fixtures','watch','completed',jsonb_build_object('demo_seed','enterprise_truth_preventive','scenario','completed'),v_manager,now()-interval '1 day',now()-interval '3 days',now()-interval '3 days',now()-interval '2 days','Demo preventive action completed and independently verified.','effective','effective',v_analyst,now()-interval '1 day');
  end if;

  -- Enterprise operational portfolio proof: vehicles, drivers, routes, alert.
  select id into v_vehicle_one from public.fleet_vehicles where business_id=v_business and metadata->>'demo_seed'='enterprise_truth_vehicle_01' limit 1;
  if v_vehicle_one is null then
    insert into public.fleet_vehicles(business_id,name,unit_code,vehicle_type,status,driver_name,current_lat,current_lng,metadata)
    values(v_business,'Enterprise Truth Van 01','ET-01','service_van','active','Demo Manager',38.9517,-92.3341,jsonb_build_object('demo_seed','enterprise_truth_vehicle_01')) returning id into v_vehicle_one;
  end if;
  select id into v_vehicle_two from public.fleet_vehicles where business_id=v_business and metadata->>'demo_seed'='enterprise_truth_vehicle_02' limit 1;
  if v_vehicle_two is null then
    insert into public.fleet_vehicles(business_id,name,unit_code,vehicle_type,status,driver_name,current_lat,current_lng,metadata)
    values(v_business,'Enterprise Truth Van 02','ET-02','service_van','active','Demo Staff',38.6270,-90.1994,jsonb_build_object('demo_seed','enterprise_truth_vehicle_02')) returning id into v_vehicle_two;
  end if;

  select id into v_driver_one from public.fleet_drivers where business_id=v_business and metadata->>'demo_seed'='enterprise_truth_driver_01' limit 1;
  if v_driver_one is null then
    insert into public.fleet_drivers(business_id,name,status,vehicle_id,metadata,user_id)
    values(v_business,'Enterprise Truth Driver 01','active',v_vehicle_one,jsonb_build_object('demo_seed','enterprise_truth_driver_01'),v_manager) returning id into v_driver_one;
  end if;
  select id into v_driver_two from public.fleet_drivers where business_id=v_business and metadata->>'demo_seed'='enterprise_truth_driver_02' limit 1;
  if v_driver_two is null then
    insert into public.fleet_drivers(business_id,name,status,vehicle_id,metadata,user_id)
    values(v_business,'Enterprise Truth Driver 02','active',v_vehicle_two,jsonb_build_object('demo_seed','enterprise_truth_driver_02'),v_staff) returning id into v_driver_two;
  end if;

  if not exists(select 1 from public.fleet_routes where business_id=v_business and metadata->>'demo_seed'='enterprise_truth_route_active') then
    insert into public.fleet_routes(business_id,name,status,vehicle_id,driver_id,scheduled_for,distance_miles,estimated_minutes,stops_count,metadata,dispatched_at,started_at,dispatch_locked)
    values(v_business,'Enterprise Truth Active Route','active',v_vehicle_one,v_driver_one,now()-interval '1 hour',86.5,118,5,jsonb_build_object('demo_seed','enterprise_truth_route_active'),now()-interval '70 minutes',now()-interval '55 minutes',true);
  end if;
  if not exists(select 1 from public.fleet_routes where business_id=v_business and metadata->>'demo_seed'='enterprise_truth_route_planned') then
    insert into public.fleet_routes(business_id,name,status,vehicle_id,driver_id,scheduled_for,distance_miles,estimated_minutes,stops_count,metadata)
    values(v_business,'Enterprise Truth Planned Route','planned',v_vehicle_two,v_driver_two,now()+interval '4 hours',122.0,165,7,jsonb_build_object('demo_seed','enterprise_truth_route_planned'));
  end if;
  if not exists(select 1 from public.fleet_alerts where business_id=v_business and source_kind='enterprise_truth_demo') then
    insert into public.fleet_alerts(business_id,vehicle_id,severity,alert_type,title,details,status,source_kind)
    values(v_business,v_vehicle_one,'warning','restroom_service_risk','Enterprise truth demo operational alert','Demo-only alert proving Enterprise cross-portfolio exception visibility.','open','enterprise_truth_demo');
  end if;
end $$;
