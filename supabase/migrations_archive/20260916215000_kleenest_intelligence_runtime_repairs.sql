-- Runtime repairs discovered by live projection probes after the additive foundation migration.

create or replace function public.location_kleenest_now(p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare
  v_l public.locations; v_bi public.location_bathroom_intelligence; v_lc public.location_confidence;
  v_service public.business_restroom_service_updates; v_service_score numeric:=0; v_community_at timestamptz; v_community_score numeric:=0; v_fresh numeric:=0;
  v_source text:='inferred'; v_confirmations int:=0; v_conflicts int:=0; v_label text; v_availability text:='unknown'; v_fresh_at timestamptz;
begin
  select * into v_l from public.locations where id=p_location_id; if not found then raise exception 'Location not found'; end if;
  select * into v_bi from public.location_bathroom_intelligence where location_id=p_location_id;
  select * into v_lc from public.location_confidence where location_id=p_location_id;
  select * into v_service from public.business_restroom_service_updates where location_id=p_location_id order by reported_at desc limit 1;
  select max(created_at),count(distinct user_id) filter(where user_id is not null),count(*) filter(where observation_type in('dirty','supplies_low','closed','not_accessible','bathroom_missing') and created_at>=now()-interval '7 days')
  into v_community_at,v_confirmations,v_conflicts from public.restroom_observations where location_id=p_location_id;
  if v_community_at is not null then v_community_score:=greatest(0,least(100,100-(extract(epoch from(now()-v_community_at))/86400*3.333333))); end if;
  if v_service.id is not null then v_service_score:=public.kleenest_service_freshness_score(v_service.event_kind,v_service.reported_at); end if;
  v_fresh:=greatest(v_community_score,v_service_score,coalesce(v_bi.freshness_score,0));
  if v_service.id is not null and v_service_score>=v_community_score and v_service_score>=coalesce(v_bi.freshness_score,0) then v_source:='business_reported';v_fresh_at:=v_service.reported_at;
  elsif v_community_at is not null then v_source:='community';v_fresh_at:=v_community_at;
  elsif coalesce(v_bi.evidence_count,0)>0 then v_source:='system';v_fresh_at:=v_bi.computed_at; end if;
  v_label:=case when v_fresh>=85 then 'very_fresh' when v_fresh>=60 then 'fresh' when v_fresh>=30 then 'aging' else 'stale' end;
  v_availability:=case when v_service.id is not null and v_service.event_kind='closed' then 'business_reported_closed' when v_service.id is not null and v_service.event_kind='reopened' then 'business_reported_open' else coalesce(v_bi.access,'unknown') end;
  return jsonb_build_object(
    'location_id',v_l.id,'name',v_l.name,'freshness_score',round(v_fresh,1),'freshness_label',v_label,'freshness_provenance',v_source,'freshness_at',v_fresh_at,
    'confidence_score',coalesce(v_lc.score,v_bi.confidence,0),'confidence_level',coalesce(v_lc.level,'unknown'),'independent_confirmations',v_confirmations,'recent_conflicts',v_conflicts,
    'bathroom_status',coalesce(v_bi.status,v_l.bathroom_verification_status,'unknown'),'availability',v_availability,
    'latest_service',case when v_service.id is null then null else jsonb_build_object('event_kind',v_service.event_kind,'reported_at',v_service.reported_at,'provenance','business_reported','freshness_score',v_service_score) end,
    'explanation',jsonb_build_object('freshness','Freshness can come from recent community evidence or a claimed business service update.','confidence','Confidence remains based on independent evidence and verification; business service reports do not become independent confirmations.'),'generated_at',now());
end $$;

create or replace function public.location_facility_passport(p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_l public.locations;v_now jsonb;v_milestones jsonb;v_claimed boolean;v_review_count bigint;v_observation_count bigint;v_amenity_count bigint;v_service_count bigint;v_resolved_count bigint;
begin
  select * into v_l from public.locations where id=p_location_id; if not found then raise exception 'Location not found'; end if;
  v_now:=public.location_kleenest_now(p_location_id);
  select exists(select 1 from public.location_claims c where c.location_id=p_location_id and c.status='approved') or v_l.claimed_business_id is not null into v_claimed;
  select count(*) into v_review_count from public.reviews where location_id=p_location_id and coalesce(status::text,'published')<>'deleted';
  select count(*) into v_observation_count from public.restroom_observations where location_id=p_location_id;
  select count(*) into v_amenity_count from public.location_amenities where location_id=p_location_id;
  select count(*) into v_service_count from public.business_restroom_service_updates where location_id=p_location_id;
  select count(*) into v_resolved_count from public.business_restroom_remediation_cases where location_id=p_location_id and status in('resolved','closed','completed');
  with milestone_rows as (
    select 'discovered'::text kind,v_l.created_at occurred_at,'Added to the Kleenest location network'::text label,'system'::text provenance
    union all
    select 'verified',v_l.bathroom_verified_at,'Bathroom verification recorded','community' where v_l.bathroom_verified_at is not null
    union all
    select 'claimed',c.updated_at,'Claimed business connected','business_reported' from (select updated_at from public.location_claims where location_id=p_location_id and status='approved' order by updated_at desc limit 1)c
    union all
    select 'service',s.reported_at,replace(s.event_kind,'_',' '),'business_reported' from (select event_kind,reported_at from public.business_restroom_service_updates where location_id=p_location_id order by reported_at desc limit 12)s
    union all
    select 'recovery',coalesce(r.resolved_at,r.started_at,r.opened_at),'Trust recovery '||replace(r.status,'_',' '),case when r.status in('resolved','closed','completed') then 'business_reported' else 'system' end from (select status,resolved_at,started_at,opened_at from public.business_restroom_remediation_cases where location_id=p_location_id order by coalesce(resolved_at,started_at,opened_at) desc limit 8)r
  ) select coalesce(jsonb_agg(to_jsonb(m) order by m.occurred_at desc),'[]'::jsonb) into v_milestones from milestone_rows m;
  return jsonb_build_object('location',jsonb_build_object('id',v_l.id,'name',v_l.name,'address',v_l.address,'city',v_l.city,'state',v_l.state,'place_type',v_l.place_type,'claimed',v_claimed),'now',v_now,'summary',jsonb_build_object('reviews',v_review_count,'observations',v_observation_count,'amenities',v_amenity_count,'service_updates',v_service_count,'resolved_recovery_cases',v_resolved_count),'milestones',v_milestones,'generated_at',now());
end $$;

create or replace function public.kleenest_verified_access(p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_user uuid:=auth.uid();v_bi public.location_bathroom_intelligence;v_source text:='none';v_allowed boolean:=false;v_reason text:='No verified access entitlement is active for this location.';v_program uuid;v_eligible boolean:=false;
begin
  select * into v_bi from public.location_bathroom_intelligence where location_id=p_location_id;
  if coalesce(v_bi.access,'') in('public','permissive') then v_allowed:=true;v_source:='public_access';v_reason:='This location is currently represented as public/permissive access in Kleenest.';end if;
  if v_user is null then return jsonb_build_object('allowed',v_allowed,'source',v_source,'reason',v_reason,'checked_at',now());end if;
  if exists(select 1 from public.preferred_location_activations a where a.user_id=v_user and a.location_id=p_location_id and a.deactivated_at is null) then v_allowed:=true;v_source:='preferred_access';v_reason:='Your preferred-location activation includes this facility.';end if;
  if not v_allowed and exists(select 1 from public.single_use_access_purchases p join public.single_use_access_offers o on o.id=p.offer_id join public.partner_program_locations pl on pl.partner_program_id=o.partner_program_id where p.user_id=v_user and p.status='purchased' and p.redeemed_at is null and pl.location_id=p_location_id and pl.status='active' and o.enabled and(o.expires_at is null or o.expires_at>now())) then v_allowed:=true;v_source:='single_use';v_reason:='You have an unused single-use access pass for this partner location.';end if;
  select e.eligible,e.partner_program_id into v_eligible,v_program from public.can_activate_preferred_location(p_location_id)e limit 1;
  if not v_allowed and coalesce(v_eligible,false) then v_allowed:=true;v_source:=case when exists(select 1 from public.fleet_premium_memberships m where m.user_id=v_user and m.status='active') then 'fleet_premium' when public.family_has_premium_access(v_user) then 'family_premium' else 'consumer_premium' end;v_reason:='Your scoped Kleenest Premium membership is eligible for this preferred-access partner.';end if;
  return jsonb_build_object('allowed',v_allowed,'source',v_source,'reason',v_reason,'partner_program_id',v_program,'checked_at',now());
end $$;

create or replace function public.business_fix_first_queue(p_business_id uuid,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_policy jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if not public.business_can_manage(p_business_id) and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role::text='analyst') then raise exception 'Business access required';end if;
  select config into v_policy from public.kleenest_intelligence_policy where policy_key='global_v1';
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.priority_score desc,q.name) from(
    select l.id location_id,l.name,l.city,l.state,
      round(((100-coalesce((z.n->>'freshness_score')::numeric,0))*coalesce((v_policy->'fix_first'->>'freshness_weight')::numeric,.45)+greatest(0,75-coalesce(l.cleanliness_pct,50))*coalesce((v_policy->'fix_first'->>'cleanliness_weight')::numeric,.25)+(select count(*) from public.business_restroom_remediation_cases r where r.location_id=l.id and r.status not in('resolved','closed','completed'))*coalesce((v_policy->'fix_first'->>'active_case_weight')::numeric,20)+(select count(*) from public.restroom_observations ro where ro.location_id=l.id and ro.created_at>=now()-interval '7 days' and ro.observation_type in('dirty','supplies_low','closed','not_accessible'))*coalesce((v_policy->'fix_first'->>'negative_observation_weight')::numeric,5))::numeric,1) priority_score,
      array_remove(array[case when coalesce((z.n->>'freshness_score')::numeric,0)<40 then 'stale freshness evidence' end,case when coalesce(l.cleanliness_pct,50)<70 then 'cleanliness below target' end,case when exists(select 1 from public.business_restroom_remediation_cases r where r.location_id=l.id and r.status not in('resolved','closed','completed')) then 'active remediation' end,case when exists(select 1 from public.restroom_observations ro where ro.location_id=l.id and ro.created_at>=now()-interval '7 days' and ro.observation_type in('dirty','supplies_low','closed','not_accessible')) then 'recent negative evidence' end],null) reasons,z.n current_state
    from public.locations l cross join lateral(select public.location_kleenest_now(l.id) as n)z where coalesce(l.claimed_business_id,l.business_id)=p_business_id
    order by priority_score desc limit least(greatest(p_limit,1),50)
  )q),'[]'::jsonb);
end $$;

create or replace function public.owner_update_intelligence_policy(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_config jsonb;
begin
  if not public.is_platform_owner_session()then raise exception 'Platform owner access required';end if;
  update public.kleenest_intelligence_policy set config=config||coalesce(p_patch,'{}'::jsonb),updated_at=now(),updated_by=auth.uid() where policy_key='global_v1' returning config into v_config;
  return v_config;
end $$;
