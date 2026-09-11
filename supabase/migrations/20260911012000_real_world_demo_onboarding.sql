-- Real-world Growth/Fleet/Enterprise demo flows and guided onboarding authority.

-- Repair the canonical Growth campaign mutation to the actual business_campaigns table.
create or replace function public.business_manage_campaign(
  p_business_id uuid,
  p_campaign_id uuid,
  p_action text,
  p_name text default null,
  p_campaign_type text default null,
  p_goal text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.business_campaigns;
  v_description text;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
  v_description:=nullif(trim(concat_ws(' · ',nullif(trim(p_campaign_type),''),nullif(trim(p_goal),''))),'');
  if p_action='create' then
    insert into public.business_campaigns(business_id,name,description,status,starts_at)
    values(p_business_id,coalesce(nullif(trim(p_name),''),'New Campaign'),v_description,coalesce(nullif(trim(p_status),''),'draft'),now())
    returning * into r;
  elsif p_action='update' then
    update public.business_campaigns
    set name=coalesce(nullif(trim(p_name),''),name),
        description=coalesce(v_description,description),
        status=coalesce(nullif(trim(p_status),''),status),
        updated_at=now()
    where id=p_campaign_id and business_id=p_business_id
    returning * into r;
  elsif p_action='pause' then
    update public.business_campaigns set status='paused',updated_at=now()
    where id=p_campaign_id and business_id=p_business_id returning * into r;
  elsif p_action='activate' then
    update public.business_campaigns set status='active',updated_at=now()
    where id=p_campaign_id and business_id=p_business_id returning * into r;
  else
    raise exception 'Unknown campaign action';
  end if;
  if r.id is null then raise exception 'Campaign not found'; end if;
  return to_jsonb(r);
end;
$$;
revoke all on function public.business_manage_campaign(uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.business_manage_campaign(uuid,uuid,text,text,text,text,text) to authenticated,service_role;

create table if not exists public.business_onboarding_profiles(
  business_id uuid primary key references public.businesses(id) on delete cascade,
  business_type text not null,
  goals text[] not null default '{}',
  scale jsonb not null default '{}',
  recommended_products text[] not null default '{}',
  preview jsonb not null default '{}',
  applied_setup jsonb not null default '{}',
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.business_onboarding_profiles enable row level security;
revoke all on table public.business_onboarding_profiles from public,anon,authenticated;
grant select,insert,update,delete on table public.business_onboarding_profiles to service_role;

drop policy if exists business_onboarding_manager_select on public.business_onboarding_profiles;
create policy business_onboarding_manager_select on public.business_onboarding_profiles
for select to authenticated using(public.business_can_manage(business_id));
drop policy if exists business_onboarding_manager_insert on public.business_onboarding_profiles;
create policy business_onboarding_manager_insert on public.business_onboarding_profiles
for insert to authenticated with check(public.business_can_manage(business_id));
drop policy if exists business_onboarding_manager_update on public.business_onboarding_profiles;
create policy business_onboarding_manager_update on public.business_onboarding_profiles
for update to authenticated using(public.business_can_manage(business_id)) with check(public.business_can_manage(business_id));

create or replace function public.business_onboarding_catalog()
returns jsonb
language sql
stable
set search_path=''
as $$
select jsonb_build_object(
  'business_types',jsonb_build_array(
    jsonb_build_object('id','restaurant_cafe','label','Restaurant / cafe','detail','Food service, coffee, quick service and hospitality-led visits'),
    jsonb_build_object('id','retail','label','Retail','detail','Stores, shopping, convenience and customer-facing retail'),
    jsonb_build_object('id','fuel_travel','label','Fuel / travel stop','detail','Gas, travel plazas, roadside service and rest-stop style locations'),
    jsonb_build_object('id','hospitality','label','Hotel / hospitality','detail','Hotels, lodging and guest-service operations'),
    jsonb_build_object('id','healthcare_public','label','Healthcare / public service','detail','Clinics, public facilities and high-trust visitor environments'),
    jsonb_build_object('id','logistics_delivery','label','Logistics / delivery','detail','Courier, trucking, delivery and route-based mobile workforces'),
    jsonb_build_object('id','field_service','label','Field service','detail','Home service, utilities, construction, mobile care and field teams'),
    jsonb_build_object('id','multi_location_chain','label','Multi-location / chain','detail','Operators managing several locations, markets or brands'),
    jsonb_build_object('id','venue_entertainment','label','Venue / entertainment','detail','Event, recreation, entertainment and high-traffic venues'),
    jsonb_build_object('id','other','label','Other','detail','Build a recommendation from your results and operating scale')
  ),
  'goals',jsonb_build_array(
    jsonb_build_object('id','restroom_trust','label','Improve restroom trust','detail','Freshness, verification, issue recovery and consumer confidence','product','standard'),
    jsonb_build_object('id','verified_feedback','label','Collect verified feedback','detail','Check-ins, reviews and evidence tied to real visits','product','standard'),
    jsonb_build_object('id','increase_visits','label','Increase visits','detail','Promotions, campaigns, QR attribution and conversion','product','growth'),
    jsonb_build_object('id','loyalty_repeat','label','Increase repeat visits','detail','Contests, progression and loyalty-style engagement','product','growth'),
    jsonb_build_object('id','promotions_events','label','Promote offers & events','detail','Location offers, campaigns, contests and events','product','growth'),
    jsonb_build_object('id','multi_location_consistency','label','Improve multi-location consistency','detail','Cross-location operations, reporting and standards','product','growth'),
    jsonb_build_object('id','reduce_downtime','label','Reduce restroom downtime','detail','Remediation, prevention, work queues and recovery evidence','product','growth'),
    jsonb_build_object('id','route_efficiency','label','Improve route efficiency','detail','Planning, dispatch, stop execution and exception handling','product','fleet'),
    jsonb_build_object('id','workforce_wellbeing','label','Support mobile workers','detail','Premium amenity discovery and safer on-road stop choices','product','fleet'),
    jsonb_build_object('id','service_verification','label','Verify field service','detail','Arrival, service, geofence and completion evidence','product','fleet'),
    jsonb_build_object('id','partner_network','label','Build partner networks','detail','Cross-business networks, campaigns and shared outcomes','product','enterprise'),
    jsonb_build_object('id','multi_market_roi','label','Measure multi-market ROI','detail','Portfolio comparisons, allocations, benchmarks and ROI','product','enterprise')
  ),
  'scale_questions',jsonb_build_array(
    jsonb_build_object('id','locations','label','How many locations do you operate?'),
    jsonb_build_object('id','mobile_workers','label','How many people regularly work on the road?'),
    jsonb_build_object('id','markets','label','How many cities or markets do you operate in?')
  )
);
$$;
revoke all on function public.business_onboarding_catalog() from public,anon;
grant execute on function public.business_onboarding_catalog() to authenticated,service_role;

create or replace function public.business_onboarding_preview(
  p_business_id uuid,
  p_business_type text,
  p_goals text[],
  p_scale jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_type text:=lower(trim(coalesce(p_business_type,'')));
  v_goals text[]:=array(select distinct lower(trim(x)) from unnest(coalesce(p_goals,'{}'::text[])) x where nullif(trim(x),'') is not null);
  v_valid_types text[]:=array['restaurant_cafe','retail','fuel_travel','hospitality','healthcare_public','logistics_delivery','field_service','multi_location_chain','venue_entertainment','other'];
  v_valid_goals text[]:=array['restroom_trust','verified_feedback','increase_visits','loyalty_repeat','promotions_events','multi_location_consistency','reduce_downtime','route_efficiency','workforce_wellbeing','service_verification','partner_network','multi_market_roi'];
  v_growth_goals text[]:=array['increase_visits','loyalty_repeat','promotions_events','multi_location_consistency','reduce_downtime'];
  v_fleet_goals text[]:=array['route_efficiency','workforce_wellbeing','service_verification'];
  v_enterprise_goals text[]:=array['partner_network','multi_market_roi'];
  v_location_count integer;
  v_mobile_workers integer:=greatest(0,coalesce(nullif(p_scale->>'mobile_workers','')::integer,0));
  v_markets integer:=greatest(0,coalesce(nullif(p_scale->>'markets','')::integer,0));
  v_needs_growth boolean;
  v_needs_fleet boolean;
  v_needs_enterprise boolean;
  v_growth_available boolean;
  v_fleet_available boolean;
  v_enterprise_available boolean;
  v_current_plan text;
  v_products text[]:='{}';
  v_caps jsonb:='[]'::jsonb;
  v_next jsonb:='[]'::jsonb;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not v_type=any(v_valid_types) then raise exception 'Unsupported business type'; end if;
  if exists(select 1 from unnest(v_goals) g where not g=any(v_valid_goals)) then raise exception 'Unsupported onboarding goal'; end if;

  select lower(b.business_tier::text),
         coalesce(nullif(p_scale->>'locations','')::integer,(select count(*)::integer from public.locations l where l.business_id=b.id and coalesce(l.is_active,true)))
  into v_current_plan,v_location_count
  from public.businesses b where b.id=p_business_id;
  if v_current_plan is null then raise exception 'Business not found'; end if;

  v_needs_growth := v_goals && v_growth_goals or v_type='multi_location_chain' or v_location_count>1;
  v_needs_fleet := v_goals && v_fleet_goals or (v_type in ('logistics_delivery','field_service') and v_mobile_workers>0);
  v_needs_enterprise := v_goals && v_enterprise_goals or v_location_count>5 or v_markets>1 and v_type='multi_location_chain';

  v_growth_available:=public.business_advanced_allowed(p_business_id);
  v_fleet_available:=public.business_fleet_authorized(p_business_id);
  v_enterprise_available:=public.business_enterprise_authorized(p_business_id);

  if v_needs_enterprise then
    v_products:=array['enterprise'];
  else
    if v_needs_growth then v_products:=array_append(v_products,'growth'); end if;
    if v_needs_fleet then v_products:=array_append(v_products,'fleet'); end if;
    if coalesce(array_length(v_products,1),0)=0 then v_products:=array['standard']; end if;
  end if;

  if 'restroom_trust'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','restroom_trust','label','Restroom trust & remediation','route','/operations','product','standard','available',true)); end if;
  if 'verified_feedback'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','verified_feedback','label','Verified check-ins, QR & reviews','route','/reviews','product','standard','available',true)); end if;
  if 'increase_visits'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','increase_visits','label','Visit-growth campaign & attribution','route','/growth','product','growth','available',v_growth_available)); end if;
  if 'loyalty_repeat'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','loyalty_repeat','label','Contest & repeat-visit progression','route','/growth','product','growth','available',v_growth_available)); end if;
  if 'promotions_events'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','promotions_events','label','Promotions, campaigns & events','route','/growth','product','growth','available',v_growth_available)); end if;
  if 'multi_location_consistency'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','multi_location_consistency','label','Multi-location operations & reporting','route','/enterprise-locations','product','growth','available',v_growth_available)); end if;
  if 'reduce_downtime'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','reduce_downtime','label','Remediation & preventive operations','route','/prevention','product','growth','available',v_growth_available)); end if;
  if 'route_efficiency'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','route_efficiency','label','Route planning & dispatch','route','/planner','product','fleet','available',v_fleet_available)); end if;
  if 'workforce_wellbeing'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','workforce_wellbeing','label','Mobile workforce Premium access','route','/premium','product','fleet','available',v_fleet_available)); end if;
  if 'service_verification'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','service_verification','label','Arrival, geofence & completion evidence','route','/execution','product','fleet','available',v_fleet_available)); end if;
  if 'partner_network'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','partner_network','label','Enterprise partner network','route','/enterprise','product','enterprise','available',v_enterprise_available)); end if;
  if 'multi_market_roi'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','multi_market_roi','label','Enterprise allocations & ROI','route','/enterprise-economy','product','enterprise','available',v_enterprise_available)); end if;

  v_next:=jsonb_build_array(
    jsonb_build_object('id','profile','label','Confirm business profile and locations','route','/profile','available',true),
    jsonb_build_object('id','qr','label','Create verified-visit QR entry point','route','/qr-studio','available',true)
  );
  if v_needs_growth then v_next:=v_next||jsonb_build_array(jsonb_build_object('id','growth','label','Launch starter Growth program','route','/growth','available',v_growth_available)); end if;
  if v_needs_fleet then v_next:=v_next||jsonb_build_array(jsonb_build_object('id','fleet','label','Add Fleet assets and first route','route','/planner','available',v_fleet_available)); end if;
  if v_needs_enterprise then v_next:=v_next||jsonb_build_array(jsonb_build_object('id','enterprise','label','Build Enterprise network and portfolio controls','route','/enterprise','available',v_enterprise_available)); end if;

  return jsonb_build_object(
    'business_id',p_business_id,
    'business_type',v_type,
    'goals',to_jsonb(v_goals),
    'scale',coalesce(p_scale,'{}'::jsonb)||jsonb_build_object('resolved_locations',v_location_count),
    'current_plan',v_current_plan,
    'recommended_products',to_jsonb(v_products),
    'needs',jsonb_build_object('growth',v_needs_growth,'fleet',v_needs_fleet,'enterprise',v_needs_enterprise),
    'available',jsonb_build_object('standard',true,'growth',v_growth_available,'fleet',v_fleet_available,'enterprise',v_enterprise_available),
    'upgrade_required',(v_needs_growth and not v_growth_available) or (v_needs_fleet and not v_fleet_available) or (v_needs_enterprise and not v_enterprise_available),
    'capabilities',v_caps,
    'next_steps',v_next
  );
end;
$$;
revoke all on function public.business_onboarding_preview(uuid,text,text[],jsonb) from public,anon;
grant execute on function public.business_onboarding_preview(uuid,text,text[],jsonb) to authenticated,service_role;

create or replace function public.business_onboarding_state(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v jsonb;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  select to_jsonb(p) into v from public.business_onboarding_profiles p where p.business_id=p_business_id;
  return coalesce(v,'{}'::jsonb);
end;
$$;
revoke all on function public.business_onboarding_state(uuid) from public,anon;
grant execute on function public.business_onboarding_state(uuid) to authenticated,service_role;

create or replace function public.business_onboarding_apply(
  p_business_id uuid,
  p_business_type text,
  p_goals text[],
  p_scale jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_preview jsonb;
  v_goals text[];
  v_location_id uuid;
  v_created text[]:='{}';
  v_offered text[]:='{}';
  v_next text[]:='{}';
  v_growth boolean;
  v_fleet boolean;
  v_enterprise boolean;
  v_qr public.qr_codes;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Business owner or admin access required'; end if;
  v_preview:=public.business_onboarding_preview(p_business_id,p_business_type,p_goals,p_scale);
  v_goals:=array(select jsonb_array_elements_text(v_preview->'goals'));
  v_growth:=coalesce((v_preview->'available'->>'growth')::boolean,false);
  v_fleet:=coalesce((v_preview->'available'->>'fleet')::boolean,false);
  v_enterprise:=coalesce((v_preview->'available'->>'enterprise')::boolean,false);

  select l.id into v_location_id from public.locations l
  where l.business_id=p_business_id and coalesce(l.is_active,true)
  order by l.created_at,l.id limit 1;

  if v_location_id is not null and (v_goals && array['restroom_trust','verified_feedback','increase_visits','loyalty_repeat']) then
    if not exists(
      select 1 from public.qr_codes q
      where q.business_id=p_business_id and q.action_payload->>'onboarding_key'='verified_visit_feedback'
    ) then
      select * into v_qr from public.business_create_custom_qr(
        p_business_id,v_location_id,'Verified Visit + Feedback','check_in','location',
        jsonb_build_object('location_id',v_location_id,'onboarding_key','verified_visit_feedback'),
        jsonb_build_object('frame_label','Scan for a verified visit','cta_label','Check in, review and earn Kleenest progress'),
        false,null
      );
      v_created:=array_append(v_created,'verified_visit_qr');
    end if;
  elsif v_location_id is null then
    v_next:=array_append(v_next,'Add or claim a location before creating location QR programs.');
  end if;

  if (v_preview->'needs'->>'growth')::boolean then
    if v_growth then
      if v_goals && array['increase_visits','promotions_events','loyalty_repeat'] then
        if not exists(select 1 from public.business_campaigns where business_id=p_business_id and name='[Onboarding] Verified Visit Growth') then
          insert into public.business_campaigns(business_id,location_id,name,description,status,starts_at)
          values(p_business_id,v_location_id,'[Onboarding] Verified Visit Growth','Starter campaign created from onboarding: connect verified visits, QR attribution and repeat engagement.','active',now());
          v_created:=array_append(v_created,'growth_campaign');
        end if;
        if not exists(select 1 from public.promotions where business_id=p_business_id and title='[Onboarding] Welcome Back Offer') then
          insert into public.promotions(business_id,location_id,title,description,discount,starts_at,ends_at,active)
          values(p_business_id,v_location_id,'[Onboarding] Welcome Back Offer','Starter offer for verified visits. Customize the value and schedule before public promotion.','Customize offer',now(),now()+interval '30 days',true);
          v_created:=array_append(v_created,'growth_promotion');
        end if;
      end if;
      if 'loyalty_repeat'=any(v_goals) and not exists(select 1 from public.contests where business_id=p_business_id and name='[Onboarding] Verified Visit Streak') then
        insert into public.contests(name,description,starts_at,ends_at,scoring_rules,rewards,status,created_by,business_id,metrics_config)
        values('[Onboarding] Verified Visit Streak','Starter repeat-visit challenge created by onboarding.',now(),now()+interval '30 days',jsonb_build_object('check_in',1,'verified_visit',2),jsonb_build_object('type','business_reward','note','Customize reward before launch'),'draft',auth.uid(),p_business_id,jsonb_build_object('source','business_onboarding'));
        v_created:=array_append(v_created,'growth_contest');
      end if;
      if 'promotions_events'=any(v_goals) and v_location_id is not null and not exists(select 1 from public.business_events where business_id=p_business_id and title='[Onboarding] Community Visit Event') then
        insert into public.business_events(business_id,location_id,title,description,event_date,event_time,status,metrics_config)
        values(p_business_id,v_location_id,'[Onboarding] Community Visit Event','Starter event. Set the real date, time and offer before publishing.',current_date+14,'10:00','active',jsonb_build_object('source','business_onboarding'));
        v_created:=array_append(v_created,'growth_event');
      end if;
      v_next:=array_append(v_next,'Review starter Growth content, customize incentives, then publish from Growth & Engagement.');
    else
      v_offered:=array_append(v_offered,'Business Growth');
    end if;
  end if;

  if (v_preview->'needs'->>'fleet')::boolean then
    if v_fleet then
      if v_location_id is not null and not exists(select 1 from public.fleet_monitored_locations where business_id=p_business_id and location_id=v_location_id) then
        insert into public.fleet_monitored_locations(business_id,location_id,enabled,created_by)
        values(p_business_id,v_location_id,true,auth.uid());
        v_created:=array_append(v_created,'fleet_monitored_location');
      end if;
      v_next:=array_append(v_next,'Add real vehicles and drivers, build the first route, then dispatch from Fleet. No fake operational assets were created.');
    else
      v_offered:=array_append(v_offered,'Fleet');
    end if;
  end if;

  if (v_preview->'needs'->>'enterprise')::boolean then
    if v_enterprise then
      if 'partner_network'=any(v_goals) and not exists(select 1 from public.enterprise_partner_networks where owner_business_id=p_business_id and name='Kleenest Partner Network') then
        insert into public.enterprise_partner_networks(owner_business_id,name,enabled)
        values(p_business_id,'Kleenest Partner Network',true);
        v_created:=array_append(v_created,'enterprise_partner_network');
      end if;
      v_next:=array_append(v_next,'Invite real partner businesses and define allocation/campaign economics from Enterprise before activation.');
    else
      v_offered:=array_append(v_offered,'Enterprise');
    end if;
  end if;

  insert into public.business_onboarding_profiles(
    business_id,business_type,goals,scale,recommended_products,preview,applied_setup,completed_at,created_by,updated_at
  )
  values(
    p_business_id,lower(trim(p_business_type)),v_goals,coalesce(p_scale,'{}'::jsonb),
    array(select jsonb_array_elements_text(v_preview->'recommended_products')),v_preview,
    jsonb_build_object('created',to_jsonb(v_created),'offered',to_jsonb(v_offered),'next_steps',to_jsonb(v_next)),
    now(),auth.uid(),now()
  )
  on conflict(business_id) do update set
    business_type=excluded.business_type,
    goals=excluded.goals,
    scale=excluded.scale,
    recommended_products=excluded.recommended_products,
    preview=excluded.preview,
    applied_setup=excluded.applied_setup,
    completed_at=excluded.completed_at,
    created_by=excluded.created_by,
    updated_at=now();

  return jsonb_build_object(
    'preview',v_preview,
    'created',to_jsonb(v_created),
    'offered',to_jsonb(v_offered),
    'next_steps',to_jsonb(v_next)
  );
end;
$$;
revoke all on function public.business_onboarding_apply(uuid,text,text[],jsonb) from public,anon;
grant execute on function public.business_onboarding_apply(uuid,text,text[],jsonb) to authenticated,service_role;

create or replace function public.business_real_world_demo_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.businesses;
  v_location uuid;
  v_promo integer:=0;
  v_campaign integer:=0;
  v_contest integer:=0;
  v_event integer:=0;
  v_qr integer:=0;
  v_scans integer:=0;
  v_redemptions integer:=0;
  v_enterprise jsonb;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  select * into b from public.businesses where id=p_business_id and is_demo_test=true;
  if b.id is null then raise exception 'Real-world demo snapshots are restricted to demo workspaces'; end if;

  if lower(b.business_tier::text)='enterprise' then
    v_enterprise:=public.business_enterprise_truth_demo_snapshot(p_business_id);
    return jsonb_build_object(
      'scenario','enterprise',
      'workspace',b.name,
      'headline','Regional operator: locations, Fleet operations, partner economics and ROI',
      'evidence',coalesce(v_enterprise->'evidence','{}'::jsonb),
      'passed',coalesce((v_enterprise->>'passed')::boolean,false),
      'source','enterprise_truth_demo'
    );
  end if;

  select id into v_location from public.locations where business_id=p_business_id and coalesce(is_active,true) order by created_at,id limit 1;
  select count(*) into v_promo from public.promotions where business_id=p_business_id and title='Morning Commuter Verified Visit Offer';
  select count(*) into v_campaign from public.business_campaigns where business_id=p_business_id and name='Morning Verified Visit Growth';
  select count(*) into v_contest from public.contests where business_id=p_business_id and name='7-Day Verified Visit Streak';
  select count(*) into v_event from public.business_events where business_id=p_business_id and title='Saturday Community Coffee Stop';
  select count(*) into v_qr from public.qr_codes where business_id=p_business_id and code like 'demo-growth-qr-%';
  select count(*) into v_scans from public.qr_attribution_events where business_id=p_business_id and metadata->>'demo_seed'='demo_growth_qr';
  select count(*) into v_redemptions from public.qr_redemptions r join public.qr_codes q on q.id=r.qr_code_id where q.business_id=p_business_id and r.metadata->>'demo_seed'='demo_growth_qr';

  return jsonb_build_object(
    'scenario','growth',
    'workspace',b.name,
    'headline','Neighborhood coffee shop: turn verified visits into repeat traffic',
    'evidence',jsonb_build_object(
      'locations',case when v_location is null then 0 else 1 end,
      'promotions',v_promo,'campaigns',v_campaign,'contests',v_contest,'events',v_event,
      'qr_assets',v_qr,'qr_scans',v_scans,'qr_redemptions',v_redemptions
    ),
    'passed',(v_location is not null and v_promo>=1 and v_campaign>=1 and v_contest>=1 and v_event>=1 and v_qr>=1 and v_scans>=12 and v_redemptions>=3),
    'source','real_world_demo'
  );
end;
$$;
revoke all on function public.business_real_world_demo_snapshot(uuid) from public,anon;
grant execute on function public.business_real_world_demo_snapshot(uuid) to authenticated,service_role;

create or replace function public.fleet_real_world_demo_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  b public.businesses;
  v_vehicles integer;
  v_drivers integer;
  v_routes integer;
  v_active integer;
  v_stops integer;
  v_alerts integer;
  v_monitored integer;
begin
  if not public.business_fleet_authorized(p_business_id) then raise exception 'Fleet access required'; end if;
  select * into b from public.businesses where id=p_business_id and is_demo_test=true;
  if b.id is null then raise exception 'Real-world demo snapshots are restricted to demo workspaces'; end if;
  select count(*) into v_vehicles from public.fleet_vehicles where business_id=p_business_id and metadata->>'demo_seed'='demo_fleet_asset';
  select count(*) into v_drivers from public.fleet_drivers where business_id=p_business_id and metadata->>'demo_seed'='demo_fleet_driver';
  select count(*) into v_routes from public.fleet_routes where business_id=p_business_id and metadata->>'demo_seed' like 'demo_fleet_route%';
  select count(*) into v_active from public.fleet_routes where business_id=p_business_id and metadata->>'demo_seed'='demo_fleet_route_active' and status in('active','dispatched','in_progress');
  select count(*) into v_stops from public.fleet_route_stops where business_id=p_business_id and metadata->>'demo_seed'='demo_fleet_stop';
  select count(*) into v_alerts from public.fleet_alerts where business_id=p_business_id and source_kind='real_world_demo' and status='open';
  select count(*) into v_monitored from public.fleet_monitored_locations where business_id=p_business_id and enabled=true;
  return jsonb_build_object(
    'scenario','fleet',
    'workspace',b.name,
    'headline','Field-service fleet: dispatch a route, verify stops and recover from an exception',
    'evidence',jsonb_build_object('vehicles',v_vehicles,'drivers',v_drivers,'routes',v_routes,'active_routes',v_active,'route_stops',v_stops,'open_alerts',v_alerts,'monitored_locations',v_monitored),
    'passed',(v_vehicles>=2 and v_drivers>=2 and v_routes>=2 and v_active>=1 and v_stops>=4 and v_alerts>=1 and v_monitored>=2),
    'source','real_world_demo'
  );
end;
$$;
revoke all on function public.fleet_real_world_demo_snapshot(uuid) from public,anon;
grant execute on function public.fleet_real_world_demo_snapshot(uuid) to authenticated,service_role;

-- Seed a realistic Growth story into the existing demo Growth workspace.
do $$
declare
  b uuid;
  loc uuid;
  q uuid;
  seq integer;
begin
  select id into b from public.businesses where name='Downtown Coffee & Market' and is_demo_test=true and lower(business_tier::text)='growth' order by created_at limit 1;
  if b is null then return; end if;
  select id into loc from public.locations where business_id=b and coalesce(is_active,true) order by created_at,id limit 1;
  if loc is null then return; end if;

  if not exists(select 1 from public.promotions where business_id=b and title='Morning Commuter Verified Visit Offer') then
    insert into public.promotions(business_id,location_id,title,description,discount,starts_at,ends_at,days_of_week,start_hour,end_hour,active)
    values(b,loc,'Morning Commuter Verified Visit Offer','Scan the location QR after a real morning visit; the demo shows attributable verified traffic rather than generic impressions.','10% demo offer',now()-interval '7 days',now()+interval '30 days',array[1,2,3,4,5]::smallint[],6,10,true);
  end if;

  if not exists(select 1 from public.business_campaigns where business_id=b and name='Morning Verified Visit Growth') then
    insert into public.business_campaigns(business_id,location_id,name,description,status,starts_at,ends_at)
    values(b,loc,'Morning Verified Visit Growth','demo_growth_visit_campaign · Grow attributable commuter visits using QR check-ins, an offer and repeat-visit progression.','active',now()-interval '7 days',now()+interval '30 days');
  end if;

  if not exists(select 1 from public.contests where business_id=b and name='7-Day Verified Visit Streak') then
    insert into public.contests(name,description,starts_at,ends_at,scoring_rules,rewards,status,business_id,metrics_config)
    values('7-Day Verified Visit Streak','Real-world Growth demo: reward repeat verified visits without inventing unverified traffic.',now()-interval '2 days',now()+interval '28 days',jsonb_build_object('check_in',1,'verified_visit',2),jsonb_build_object('reward','Demo coffee upgrade'),'active',b,jsonb_build_object('demo_seed','demo_growth_review_signal'));
  end if;

  if not exists(select 1 from public.business_events where business_id=b and title='Saturday Community Coffee Stop') then
    insert into public.business_events(business_id,location_id,title,description,event_date,event_time,status,metrics_config)
    values(b,loc,'Saturday Community Coffee Stop','Real-world Growth demo event tied to the same location, QR attribution and analytics.',current_date+5,'09:00','active',jsonb_build_object('demo_seed','demo_growth_visit_campaign'));
  end if;

  select id into q from public.qr_codes where business_id=b and code='demo-growth-qr-01';
  if q is null then
    insert into public.qr_codes(business_id,location_id,code,label,active,customization,purpose,action_type,action_payload,single_use)
    values(b,loc,'demo-growth-qr-01','Morning Verified Visit',true,jsonb_build_object('brand_mode','custom','frame_label','Scan after your visit'),'check_in','location',jsonb_build_object('location_id',loc,'demo_seed','demo_growth_qr'),false)
    returning id into q;
  end if;

  for seq in 1..18 loop
    if not exists(select 1 from public.qr_attribution_events where qr_code_id=q and metadata->>'demo_seed'='demo_growth_qr' and metadata->>'sequence'=seq::text) then
      insert into public.qr_attribution_events(qr_code_id,location_id,business_id,action_type,source,metadata,created_at)
      values(q,loc,b,'scan','real_world_demo',jsonb_build_object('demo_seed','demo_growth_qr','sequence',seq,'cohort','morning_commuter'),now()-(18-seq)*interval '8 hours');
    end if;
  end loop;
  for seq in 1..4 loop
    if not exists(select 1 from public.qr_redemptions where qr_code_id=q and metadata->>'demo_seed'='demo_growth_qr' and metadata->>'sequence'=seq::text) then
      insert into public.qr_redemptions(qr_code_id,metadata,redeemed_at)
      values(q,jsonb_build_object('demo_seed','demo_growth_qr','sequence',seq,'outcome','offer_redeemed'),now()-(4-seq)*interval '1 day');
    end if;
  end loop;
end $$;

-- Seed a realistic Fleet dispatch story into the existing demo Fleet workspace.
do $$
declare
  b uuid;
  hub uuid;
  v1 uuid; v2 uuid;
  d1 uuid; d2 uuid;
  r1 uuid; r2 uuid;
  stoprec record;
  idx integer:=0;
begin
  select id into b from public.businesses where name='Kleenest Demo Fleet' and is_demo_test=true and lower(business_tier::text)='fleet' order by created_at limit 1;
  if b is null then return; end if;

  select id into hub from public.locations where business_id=b and source_external_id='demo-fleet-dispatch-hub' limit 1;
  if hub is null then
    insert into public.locations(business_id,name,address,city,state,postal_code,country,latitude,longitude,place_type,description,source,is_active,bathroom_verification_status,bathroom_verification_source,bathroom_verification_count,bathroom_positive_count,source_dataset,source_external_id,source_metadata,geofence_radius_m)
    values(b,'Kleenest Fleet Dispatch Hub','701 Demo Market Street','Saint Louis','MO','63101','US',38.6270,-90.1994,'office','Demo-only field-service dispatch hub.','demo',true,'has_bathroom','demo',3,3,'real_world_demo','demo-fleet-dispatch-hub',jsonb_build_object('demo_seed','demo_fleet_hub'),150)
    returning id into hub;
  end if;

  select id into v1 from public.fleet_vehicles where business_id=b and metadata->>'demo_key'='service_van_12' limit 1;
  if v1 is null then
    insert into public.fleet_vehicles(business_id,name,unit_code,vehicle_type,status,current_lat,current_lng,odometer_miles,metadata)
    values(b,'Service Van 12','SV-12','service_van','active',38.6270,-90.1994,28450,jsonb_build_object('demo_seed','demo_fleet_asset','demo_key','service_van_12')) returning id into v1;
  end if;
  select id into v2 from public.fleet_vehicles where business_id=b and metadata->>'demo_key'='service_van_27' limit 1;
  if v2 is null then
    insert into public.fleet_vehicles(business_id,name,unit_code,vehicle_type,status,current_lat,current_lng,odometer_miles,metadata)
    values(b,'Service Van 27','SV-27','service_van','active',38.6270,-90.1994,17620,jsonb_build_object('demo_seed','demo_fleet_asset','demo_key','service_van_27')) returning id into v2;
  end if;

  select id into d1 from public.fleet_drivers where business_id=b and metadata->>'demo_key'='maria_lopez' limit 1;
  if d1 is null then
    insert into public.fleet_drivers(business_id,name,email,status,vehicle_id,metadata)
    values(b,'Maria Lopez','demo.maria@kleenest.invalid','active',v1,jsonb_build_object('demo_seed','demo_fleet_driver','demo_key','maria_lopez')) returning id into d1;
  end if;
  select id into d2 from public.fleet_drivers where business_id=b and metadata->>'demo_key'='james_carter' limit 1;
  if d2 is null then
    insert into public.fleet_drivers(business_id,name,email,status,vehicle_id,metadata)
    values(b,'James Carter','demo.james@kleenest.invalid','active',v2,jsonb_build_object('demo_seed','demo_fleet_driver','demo_key','james_carter')) returning id into d2;
  end if;

  select id into r1 from public.fleet_routes where business_id=b and metadata->>'demo_key'='morning_field_service' limit 1;
  if r1 is null then
    insert into public.fleet_routes(business_id,name,status,vehicle_id,driver_id,scheduled_for,distance_miles,estimated_minutes,stops_count,metadata,dispatched_at,started_at,dispatch_locked)
    values(b,'Morning Field Service — Downtown','active',v1,d1,now()-interval '45 minutes',18.4,96,3,jsonb_build_object('demo_seed','demo_fleet_route_active','demo_key','morning_field_service','customer_story','Three field-service stops with a live exception'),now()-interval '40 minutes',now()-interval '38 minutes',true)
    returning id into r1;
  end if;
  select id into r2 from public.fleet_routes where business_id=b and metadata->>'demo_key'='afternoon_recovery' limit 1;
  if r2 is null then
    insert into public.fleet_routes(business_id,name,status,vehicle_id,driver_id,scheduled_for,distance_miles,estimated_minutes,stops_count,metadata,dispatch_locked)
    values(b,'Afternoon Preventive Recovery','planned',v2,d2,now()+interval '3 hours',14.1,74,2,jsonb_build_object('demo_seed','demo_fleet_route_planned','demo_key','afternoon_recovery','customer_story','Preventive follow-up route'),false)
    returning id into r2;
  end if;

  if not exists(select 1 from public.fleet_route_stops where route_id=r1 and metadata->>'demo_seed'='demo_fleet_stop') then
    idx:=0;
    for stoprec in
      select id,name from public.locations
      where id<>hub and coalesce(is_active,true) and latitude between 38.55 and 38.75 and longitude between -90.35 and -90.15
      order by case when address is not null then 0 else 1 end,name,id limit 3
    loop
      idx:=idx+1;
      insert into public.fleet_route_stops(business_id,route_id,location_id,stop_order,status,planned_arrival_at,planned_ttl_minutes,planned_dwell_minutes,metadata)
      values(b,r1,stoprec.id,idx,case when idx=1 then 'completed' when idx=2 then 'arrived' else 'planned' end,now()+(idx-2)*interval '30 minutes',30,12,jsonb_build_object('demo_seed','demo_fleet_stop','scenario','morning_field_service','location_name',stoprec.name));
    end loop;
  end if;

  if not exists(select 1 from public.fleet_route_stops where route_id=r2 and metadata->>'demo_seed'='demo_fleet_stop') then
    idx:=0;
    for stoprec in
      select id,name from public.locations
      where id<>hub and coalesce(is_active,true) and latitude between 38.55 and 38.75 and longitude between -90.35 and -90.15
      order by name desc,id limit 2
    loop
      idx:=idx+1;
      insert into public.fleet_route_stops(business_id,route_id,location_id,stop_order,status,planned_arrival_at,planned_ttl_minutes,planned_dwell_minutes,metadata)
      values(b,r2,stoprec.id,idx,'planned',now()+interval '3 hours'+(idx-1)*interval '35 minutes',35,15,jsonb_build_object('demo_seed','demo_fleet_stop','scenario','afternoon_recovery','location_name',stoprec.name));
    end loop;
  end if;

  insert into public.fleet_monitored_locations(business_id,location_id,enabled)
  select b,x.location_id,true
  from (
    select distinct location_id from public.fleet_route_stops where route_id in(r1,r2) and location_id is not null limit 3
  ) x
  where not exists(select 1 from public.fleet_monitored_locations m where m.business_id=b and m.location_id=x.location_id);

  if not exists(select 1 from public.fleet_alerts where business_id=b and source_kind='real_world_demo' and title='Restroom-access detour threatens Stop 3 SLA') then
    insert into public.fleet_alerts(business_id,vehicle_id,severity,alert_type,title,details,status,source_kind,created_at)
    values(b,v1,'warning','route_exception','Restroom-access detour threatens Stop 3 SLA','demo_fleet_alert · Driver reports an amenity stop detour; dispatch can compare nearby Kleenest locations, monitor dwell and recover the route.','open','real_world_demo',now()-interval '8 minutes');
  end if;
end $$;
