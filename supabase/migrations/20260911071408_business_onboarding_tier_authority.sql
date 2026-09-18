-- Canonical Business onboarding tier authority: Standard -> Growth -> Enterprise.
-- Fleet remains an operational capability/package and must not become a fourth Business tier.

update public.pricing_catalog
set max_locations=5,
    updated_at=now()
where code='business_growth'
  and category='business'
  and active=true
  and max_locations is distinct from 5;

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
  v_raw_tier text;
  v_current_plan text;
  v_minimum_tier text;
  v_recommended_tier text;
  v_tier_reason text;
  v_needs_growth boolean;
  v_needs_fleet boolean;
  v_needs_enterprise boolean;
  v_growth_available boolean;
  v_fleet_available boolean;
  v_enterprise_available boolean;
  v_current_rank integer;
  v_minimum_rank integer;
  v_products text[]='{}';
  v_caps jsonb='[]'::jsonb;
  v_next jsonb='[]'::jsonb;
  v_tier_options jsonb='[]'::jsonb;
  v_standard_price public.pricing_catalog;
  v_growth_price public.pricing_catalog;
  v_enterprise_price public.pricing_catalog;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not v_type=any(v_valid_types) then raise exception 'Unsupported business type'; end if;
  if exists(select 1 from unnest(v_goals) g where not g=any(v_valid_goals)) then raise exception 'Unsupported onboarding goal'; end if;

  select lower(b.business_tier::text),
         coalesce(nullif(p_scale->>'locations','')::integer,(select count(*)::integer from public.locations l where coalesce(l.claimed_business_id,l.business_id)=b.id and coalesce(l.is_active,true)))
  into v_raw_tier,v_location_count
  from public.businesses b where b.id=p_business_id;
  if v_raw_tier is null then raise exception 'Business not found'; end if;

  v_location_count:=greatest(0,coalesce(v_location_count,0));
  v_current_plan:=case when v_raw_tier='enterprise' then 'enterprise' when v_raw_tier in ('growth','fleet') then 'growth' else 'standard' end;

  v_needs_growth :=
    v_goals && v_growth_goals
    or v_type='multi_location_chain'
    or v_location_count>1;

  v_needs_fleet :=
    v_goals && v_fleet_goals
    or (v_type in ('logistics_delivery','field_service') and v_mobile_workers>0);

  v_needs_enterprise :=
    v_goals && v_enterprise_goals
    or v_location_count>5
    or (v_markets>1 and v_type='multi_location_chain');

  -- Fleet operational needs lift the Business tier to Growth, because Fleet capability
  -- is included by canonical product access for Growth and Enterprise.
  v_minimum_tier:=case
    when v_needs_enterprise then 'enterprise'
    when v_needs_growth or v_needs_fleet then 'growth'
    else 'standard'
  end;

  v_current_rank:=case v_current_plan when 'enterprise' then 3 when 'growth' then 2 else 1 end;
  v_minimum_rank:=case v_minimum_tier when 'enterprise' then 3 when 'growth' then 2 else 1 end;
  v_recommended_tier:=case when v_current_rank>=v_minimum_rank then v_current_plan else v_minimum_tier end;

  v_tier_reason:=case
    when v_needs_enterprise and v_location_count>5 then 'More than 5 active or planned locations requires Business Enterprise.'
    when v_needs_enterprise and v_goals && v_enterprise_goals then 'The selected partner-network or multi-market ROI outcomes require Business Enterprise.'
    when v_needs_enterprise and v_markets>1 and v_type='multi_location_chain' then 'A multi-market chain requires Enterprise portfolio controls.'
    when v_needs_fleet and not v_needs_growth then 'Fleet operations require at least Business Growth; Fleet capability is included with Growth and Enterprise.'
    when v_needs_growth and v_location_count>1 then 'Multiple locations up to 5 fit Business Growth; more than 5 requires Enterprise.'
    when v_needs_growth then 'The selected growth, engagement, analytics or prevention outcomes require Business Growth.'
    else 'The selected needs fit Business Standard.'
  end;

  v_growth_available:=public.business_advanced_allowed(p_business_id);
  v_fleet_available:=public.business_fleet_authorized(p_business_id);
  v_enterprise_available:=public.business_enterprise_authorized(p_business_id);

  select * into v_standard_price from public.pricing_catalog where code='business_standard' and category='business' and active=true order by updated_at desc limit 1;
  select * into v_growth_price from public.pricing_catalog where code='business_growth' and category='business' and active=true order by updated_at desc limit 1;
  select * into v_enterprise_price from public.pricing_catalog where code='business_enterprise' and category='business' and active=true order by updated_at desc limit 1;

  v_tier_options:=jsonb_build_array(
    jsonb_build_object(
      'id','standard','label','Business Standard','price_cents',v_standard_price.price_cents,'interval',v_standard_price.interval,
      'price_note',v_standard_price.price_note,'max_locations',coalesce(v_standard_price.max_locations,1),
      'fleet_included',false,'recommended',v_recommended_tier='standard',
      'summary','Core profile, one location, reviews, QR and basic analytics.'
    ),
    jsonb_build_object(
      'id','growth','label','Business Growth','price_cents',v_growth_price.price_cents,'interval',v_growth_price.interval,
      'price_note',v_growth_price.price_note,'max_locations',5,
      'fleet_included',true,'recommended',v_recommended_tier='growth',
      'summary','Advanced growth, QR Studio, intelligence, multi-location up to 5 and Fleet operations.'
    ),
    jsonb_build_object(
      'id','enterprise','label','Business Enterprise','price_cents',v_enterprise_price.price_cents,'interval',v_enterprise_price.interval,
      'price_note',coalesce(v_enterprise_price.price_note,'Contact'),'max_locations',null,
      'fleet_included',true,'recommended',v_recommended_tier='enterprise',
      'summary','Enterprise networks, portfolio controls, allocations, cross-location intelligence and portfolio Fleet.'
    )
  );

  v_products:=array[v_recommended_tier];

  if 'restroom_trust'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','restroom_trust','label','Restroom trust & remediation','route','/operations','product','standard','available',true)); end if;
  if 'verified_feedback'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','verified_feedback','label','Verified check-ins, QR & reviews','route','/reviews','product','standard','available',true)); end if;
  if 'increase_visits'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','increase_visits','label','Visit-growth campaign & attribution','route','/growth','product','growth','available',v_growth_available)); end if;
  if 'loyalty_repeat'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','loyalty_repeat','label','Contest & repeat-visit progression','route','/growth','product','growth','available',v_growth_available)); end if;
  if 'promotions_events'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','promotions_events','label','Promotions, campaigns & events','route','/growth','product','growth','available',v_growth_available)); end if;
  if 'multi_location_consistency'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','multi_location_consistency','label','Multi-location operations & reporting','route','/enterprise-locations','product','growth','available',v_growth_available)); end if;
  if 'reduce_downtime'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','reduce_downtime','label','Remediation & preventive operations','route','/prevention','product','growth','available',v_growth_available)); end if;
  if 'route_efficiency'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','route_efficiency','label','Route planning & dispatch','route','/planner','product','fleet','tier','growth','available',v_fleet_available)); end if;
  if 'workforce_wellbeing'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','workforce_wellbeing','label','Mobile workforce Premium access','route','/premium','product','fleet','tier','growth','available',v_fleet_available)); end if;
  if 'service_verification'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','service_verification','label','Arrival, geofence & completion evidence','route','/execution','product','fleet','tier','growth','available',v_fleet_available)); end if;
  if 'partner_network'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','partner_network','label','Enterprise partner network','route','/enterprise','product','enterprise','available',v_enterprise_available)); end if;
  if 'multi_market_roi'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','multi_market_roi','label','Enterprise allocations & ROI','route','/enterprise-economy','product','enterprise','available',v_enterprise_available)); end if;

  v_next:=jsonb_build_array(
    jsonb_build_object('id','profile','label','Confirm business profile and locations','route','/profile','available',true),
    jsonb_build_object('id','qr','label','Create verified-visit QR entry point','route','/qr-studio','available',true)
  );
  if v_needs_growth or v_needs_fleet then v_next:=v_next||jsonb_build_array(jsonb_build_object('id','growth','label','Activate Business Growth capabilities','route','/growth','available',v_growth_available)); end if;
  if v_needs_fleet then v_next:=v_next||jsonb_build_array(jsonb_build_object('id','fleet','label','Configure included Fleet operations','route','/planner','available',v_fleet_available)); end if;
  if v_needs_enterprise then v_next:=v_next||jsonb_build_array(jsonb_build_object('id','enterprise','label','Build Enterprise network and portfolio controls','route','/enterprise','available',v_enterprise_available)); end if;

  return jsonb_build_object(
    'business_id',p_business_id,
    'business_type',v_type,
    'goals',to_jsonb(v_goals),
    'scale',coalesce(p_scale,'{}'::jsonb)||jsonb_build_object('resolved_locations',v_location_count),
    'raw_business_tier',v_raw_tier,
    'current_plan',v_current_plan,
    'minimum_tier',v_minimum_tier,
    'recommended_tier',v_recommended_tier,
    'tier_reason',v_tier_reason,
    'tier_options',v_tier_options,
    'fleet_included',v_recommended_tier in ('growth','enterprise'),
    'recommended_products',to_jsonb(v_products),
    'needs',jsonb_build_object('growth',v_needs_growth or v_needs_fleet,'fleet',v_needs_fleet,'enterprise',v_needs_enterprise),
    'available',jsonb_build_object('standard',true,'growth',v_growth_available,'fleet',v_fleet_available,'enterprise',v_enterprise_available),
    'upgrade_required',v_minimum_rank>v_current_rank,
    'capabilities',v_caps,
    'next_steps',v_next
  );
end;
$$;

revoke all on function public.business_onboarding_preview(uuid,text,text[],jsonb) from public,anon;
grant execute on function public.business_onboarding_preview(uuid,text,text[],jsonb) to authenticated,service_role;

comment on function public.business_onboarding_preview(uuid,text,text[],jsonb) is
  'Canonical onboarding offer authority. Business tiers are Standard, Growth and Enterprise. Legacy fleet tier normalizes to Growth; Fleet is an operational capability/package, not a Business tier.';
