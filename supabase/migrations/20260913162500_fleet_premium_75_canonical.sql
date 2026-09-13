-- Canonical Fleet Premium allowance: 75 users.
-- Supersedes the historical 50-seat seed/copy in 20260911033000 without rewriting applied migration history.

update public.account_service_entitlements
set fleet_premium_limit=75
where fleet_enabled=true
  and (fleet_premium_limit is null or fleet_premium_limit=50);

update public.pricing_catalog
set max_users=75,
    price_note='$75/account/month; includes 75 Premium users and Business Growth tools',
    features='["business_growth_tools","up_to_75_premium_users","fleet_management","fleet_dashboard","fleet_analytics","route_planning","dispatch","service_verification"]'::jsonb,
    updated_at=now()
where code='fleet';

create or replace function public.business_fleet_premium_limit(p_business_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_access record;
  v_ent jsonb;
  v_locations integer;
  v_quote jsonb;
  v_explicit integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_access from public.get_business_product_access(p_business_id);
  if v_access.business_id is null or not coalesce(v_access.fleet_enabled,false) then return 0; end if;

  v_ent:=public.get_business_service_entitlement(p_business_id);
  v_explicit:=nullif(v_ent->>'fleet_premium_limit','')::integer;
  if v_explicit is not null and v_explicit>0 then return v_explicit; end if;

  if coalesce(v_access.enterprise_enabled,false) then
    select count(*)::integer into v_locations
    from public.locations l
    where coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true);
    v_quote:=public.business_enterprise_pricing_quote(greatest(6,v_locations));
    return greatest(75,coalesce((v_quote->>'included_premium_seats')::integer,75));
  end if;

  return 75;
end;
$$;
revoke all on function public.business_fleet_premium_limit(uuid) from public,anon;
grant execute on function public.business_fleet_premium_limit(uuid) to authenticated,service_role;

create or replace function public.business_tier_offer_catalog()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'tiers',jsonb_build_array(
    jsonb_build_object(
      'id','standard','label','Business Standard','price_cents',2000,'billing_unit','account_month',
      'price_note','$20/month','max_locations',1,'premium_users',0,
      'includes',jsonb_build_array('Core profile','1 location','Reviews & replies','Basic QR','Basic analytics')
    ),
    jsonb_build_object(
      'id','growth','label','Business Growth','price_cents',5000,'billing_unit','location_month',
      'price_note','$50/location/month; up to 5 locations','max_locations',5,'premium_users',0,
      'includes',jsonb_build_array('Standard','Growth campaigns','Promotions','Contests','QR Studio','Advanced analytics','Intelligence')
    ),
    jsonb_build_object(
      'id','fleet','label','Fleet','price_cents',7500,'billing_unit','account_month',
      'price_note','$75/month; includes 75 Premium users','max_locations',5,'premium_users',75,
      'includes',jsonb_build_array('Business Growth tools','Fleet routing','Dispatch','Field execution','Fleet analytics','75 Premium users')
    ),
    jsonb_build_object(
      'id','enterprise','label','Business Enterprise','price_cents',49900,'billing_unit','band_month',
      'price_note','From $499/month + $1,500 onboarding','max_locations',null,'premium_users',null,
      'includes',jsonb_build_array('Business Growth tools','Enterprise networks','Portfolio controls','Partner campaigns','Allocations','Cross-location intelligence','Fleet add-on available')
    )
  ),
  'upgrade_paths',jsonb_build_object(
    'standard',jsonb_build_array('growth','fleet','enterprise'),
    'growth',jsonb_build_array('fleet_addon','fleet','enterprise'),
    'fleet',jsonb_build_array('enterprise_keep_fleet'),
    'enterprise',jsonb_build_array('fleet_addon')
  ),
  'addon_pricing',jsonb_build_object(
    'fleet',jsonb_build_object('status','not_separately_finalized','note','Fleet add-on entitlement is supported; separate incremental add-on price remains intentionally unset.'),
    'enterprise',jsonb_build_object('status','band_priced','note','Enterprise uses the canonical location-band pricing schedule.')
  )
);
$$;
revoke all on function public.business_tier_offer_catalog() from public,anon;
grant execute on function public.business_tier_offer_catalog() to authenticated,service_role;

create or replace function public.business_tier_qualification_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_current text;
  v_locations integer;
  v_members integer;
  v_access record;
  v_limit integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_platform_owner_session() and not exists(
    select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()
  ) then raise exception 'Business membership required'; end if;

  select lower(coalesce(b.business_tier::text,'standard')) into v_current
  from public.businesses b where b.id=p_business_id;
  if v_current is null then raise exception 'Business not found'; end if;

  select count(*)::integer into v_locations
  from public.locations l where coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true);
  select count(*)::integer into v_members from public.business_members bm where bm.business_id=p_business_id;
  select * into v_access from public.get_business_product_access(p_business_id);
  v_limit:=v_access.location_limit;

  return jsonb_build_object(
    'business_id',p_business_id,
    'current_tier',v_current,
    'effective_plan',v_current,
    'threshold_plan',case when v_locations>5 then 'enterprise' else v_current end,
    'location_count',v_locations,
    'member_count',v_members,
    'location_limit',v_limit,
    'growth_included',v_current in ('growth','fleet','enterprise') or coalesce(v_access.enterprise_enabled,false),
    'fleet_enabled',coalesce(v_access.fleet_enabled,false),
    'fleet_premium_limit',public.business_fleet_premium_limit(p_business_id),
    'enterprise_enabled',coalesce(v_access.enterprise_enabled,false),
    'enterprise_qualifies',(v_locations>5),
    'upgrade_required',(v_locations>5 and not coalesce(v_access.enterprise_enabled,false)),
    'qualification_reason',case
      when v_locations>5 then 'More than 5 active locations requires Enterprise pricing.'
      when v_current='fleet' then 'Fleet includes Business Growth tools and 75 Premium users.'
      when v_current='growth' then 'Business Growth supports up to 5 locations; Fleet and Enterprise remain available upgrade/add-on paths.'
      when v_current='enterprise' then 'Enterprise is active; Fleet remains an optional add-on unless separately enabled.'
      else 'Business Standard can upgrade to Growth, Fleet, or Enterprise.'
    end
  );
end;
$$;

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
  v_current text;
  v_recommended text;
  v_needs_growth boolean;
  v_needs_fleet boolean;
  v_needs_enterprise boolean;
  v_growth_available boolean;
  v_fleet_available boolean;
  v_enterprise_available boolean;
  v_addons text[]='{}';
  v_products text[]='{}';
  v_caps jsonb='[]'::jsonb;
  v_next jsonb='[]'::jsonb;
  v_catalog jsonb;
  v_quote jsonb:=null;
  v_reason text;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not v_type=any(v_valid_types) then raise exception 'Unsupported business type'; end if;
  if exists(select 1 from unnest(v_goals) g where not g=any(v_valid_goals)) then raise exception 'Unsupported onboarding goal'; end if;

  select lower(b.business_tier::text),
         coalesce(nullif(p_scale->>'locations','')::integer,(select count(*)::integer from public.locations l where coalesce(l.claimed_business_id,l.business_id)=b.id and coalesce(l.is_active,true)))
  into v_current,v_location_count
  from public.businesses b where b.id=p_business_id;
  if v_current is null then raise exception 'Business not found'; end if;
  v_location_count:=greatest(0,coalesce(v_location_count,0));

  v_needs_growth:=v_goals && v_growth_goals or v_type='multi_location_chain' or v_location_count>1;
  v_needs_fleet:=v_goals && v_fleet_goals or (v_type in ('logistics_delivery','field_service') and v_mobile_workers>0);
  v_needs_enterprise:=v_goals && v_enterprise_goals or v_location_count>5 or (v_markets>1 and v_type='multi_location_chain');

  v_growth_available:=public.business_advanced_allowed(p_business_id);
  v_fleet_available:=public.business_fleet_authorized(p_business_id);
  v_enterprise_available:=public.business_enterprise_authorized(p_business_id);

  if v_needs_enterprise then
    v_recommended:='enterprise';
    if v_needs_fleet and not v_fleet_available then v_addons:=array_append(v_addons,'fleet'); end if;
    v_quote:=public.business_enterprise_pricing_quote(greatest(6,v_location_count));
    v_reason:=case
      when v_location_count>5 then 'More than 5 locations moves this operation to the Enterprise pricing schedule.'
      when v_goals && v_enterprise_goals then 'Partner-network or multi-market ROI outcomes require Enterprise controls.'
      else 'A multi-market chain requires Enterprise portfolio controls.'
    end;
  elsif v_needs_fleet then
    if v_current='growth' then
      v_recommended:='growth';
      if not v_fleet_available then v_addons:=array_append(v_addons,'fleet'); end if;
      v_reason:='Keep Business Growth and add Fleet, or move directly to the Fleet tier. Fleet includes the Growth toolset and 75 Premium users.';
    elsif v_current='enterprise' then
      v_recommended:='enterprise';
      if not v_fleet_available then v_addons:=array_append(v_addons,'fleet'); end if;
      v_reason:='Keep Enterprise and add Fleet for routing, dispatch, field execution and Premium workforce access.';
    else
      v_recommended:='fleet';
      v_reason:='Fleet is the best direct tier for this mobile workforce and includes Business Growth tools plus 75 Premium users.';
    end if;
  elsif v_needs_growth then
    v_recommended:=case when v_current in ('fleet','enterprise') then v_current else 'growth' end;
    v_reason:=case
      when v_current='fleet' then 'Fleet already includes the Business Growth toolset.'
      when v_current='enterprise' then 'Enterprise already includes the Business Growth toolset.'
      else 'The selected growth and multi-location outcomes fit Business Growth.'
    end;
  else
    v_recommended:=v_current;
    v_reason:=case v_current
      when 'fleet' then 'Fleet remains active and includes the Growth toolset.'
      when 'enterprise' then 'Enterprise remains active for this workspace.'
      when 'growth' then 'Business Growth remains active for this workspace.'
      else 'The selected needs fit Business Standard.'
    end;
  end if;

  if v_needs_enterprise and v_current='fleet' and not ('fleet'=any(v_addons)) then
    v_addons:=array_append(v_addons,'fleet');
  end if;

  v_products:=array[v_recommended]||v_addons;
  v_catalog:=public.business_tier_offer_catalog();

  if 'restroom_trust'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','restroom_trust','label','Restroom trust & remediation','route','/operations','product','standard','available',true)); end if;
  if 'verified_feedback'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','verified_feedback','label','Verified check-ins, QR & reviews','route','/reviews','product','standard','available',true)); end if;
  if 'increase_visits'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','increase_visits','label','Visit-growth campaign & attribution','route','/growth','product','growth','available',v_growth_available)); end if;
  if 'loyalty_repeat'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','loyalty_repeat','label','Contest & repeat-visit progression','route','/growth','product','growth','available',v_growth_available)); end if;
  if 'promotions_events'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','promotions_events','label','Promotions, campaigns & events','route','/growth','product','growth','available',v_growth_available)); end if;
  if 'multi_location_consistency'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','multi_location_consistency','label','Multi-location operations & reporting','route','/enterprise-locations','product','growth','available',v_growth_available)); end if;
  if 'reduce_downtime'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','reduce_downtime','label','Remediation & preventive operations','route','/prevention','product','growth','available',v_growth_available)); end if;
  if 'route_efficiency'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','route_efficiency','label','Route planning & dispatch','route','/planner','product','fleet','available',v_fleet_available)); end if;
  if 'workforce_wellbeing'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','workforce_wellbeing','label','50-user Fleet Premium workforce access','route','/premium','product','fleet','available',v_fleet_available)); end if;
  if 'service_verification'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','service_verification','label','Arrival, geofence & completion evidence','route','/execution','product','fleet','available',v_fleet_available)); end if;
  if 'partner_network'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','partner_network','label','Enterprise partner network','route','/enterprise','product','enterprise','available',v_enterprise_available)); end if;
  if 'multi_market_roi'=any(v_goals) then v_caps:=v_caps||jsonb_build_array(jsonb_build_object('id','multi_market_roi','label','Enterprise allocations & ROI','route','/enterprise-economy','product','enterprise','available',v_enterprise_available)); end if;

  v_next:=jsonb_build_array(
    jsonb_build_object('id','profile','label','Confirm business profile and locations','route','/profile','available',true),
    jsonb_build_object('id','qr','label','Create verified-visit QR entry point','route','/qr-studio','available',true)
  );
  if v_needs_growth then v_next:=v_next||jsonb_build_array(jsonb_build_object('id','growth','label','Configure Business Growth workflows','route','/growth','available',v_growth_available)); end if;
  if v_needs_fleet then v_next:=v_next||jsonb_build_array(jsonb_build_object('id','fleet','label','Configure Fleet assets, Premium users and first route','route','/planner','available',v_fleet_available)); end if;
  if v_needs_enterprise then v_next:=v_next||jsonb_build_array(jsonb_build_object('id','enterprise','label','Configure Enterprise network and portfolio controls','route','/enterprise','available',v_enterprise_available)); end if;

  return jsonb_build_object(
    'business_id',p_business_id,
    'business_type',v_type,
    'goals',to_jsonb(v_goals),
    'scale',coalesce(p_scale,'{}'::jsonb)||jsonb_build_object('resolved_locations',v_location_count),
    'current_plan',v_current,
    'recommended_tier',v_recommended,
    'recommended_addons',to_jsonb(v_addons),
    'recommended_products',to_jsonb(v_products),
    'tier_reason',v_reason,
    'tier_options',v_catalog->'tiers',
    'upgrade_paths',v_catalog->'upgrade_paths',
    'enterprise_quote',v_quote,
    'fleet_premium_users',case when v_recommended='fleet' or 'fleet'=any(v_addons) then 75 else 0 end,
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
