create or replace function public.admin_authorization_v1(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
declare
  v_actor uuid := auth.uid();
  v_target uuid;
  v_result jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('authorized',false,'role',null,'is_admin',false,'is_platform_owner',false);
  end if;
  v_target := coalesce(p_user_id,v_actor);
  if v_target <> v_actor and not exists(
    select 1 from public.profiles p where p.id=v_actor and coalesce(p.is_platform_owner,false)
  ) then
    v_target := v_actor;
  end if;
  select jsonb_build_object(
    'authorized',coalesce(p.is_admin,false) or coalesce(p.is_platform_owner,false) or lower(coalesce(p.role::text,'')) in ('admin','owner','platform_admin','super_admin'),
    'role',p.role::text,
    'is_admin',coalesce(p.is_admin,false),
    'is_platform_owner',coalesce(p.is_platform_owner,false)
  ) into v_result
  from public.profiles p where p.id=v_target;
  return coalesce(v_result,jsonb_build_object('authorized',false,'role',null,'is_admin',false,'is_platform_owner',false));
end;
$$;
grant execute on function public.admin_authorization_v1(uuid) to authenticated;

create or replace function public.business_restroom_health_score(p_business_id uuid, p_location_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists (select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) then raise exception 'Business access denied'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.health_score desc),'[]'::jsonb) into result from (
  select l.id location_id,l.name,
   greatest(0,least(100,round((
     0.25*coalesce(l.cleanliness_pct,0)
     +0.20*coalesce(l.rating*20,0)
     +0.15*least(100,coalesce(bi.confidence,0))
     +0.10*least(100,coalesce(bi.evidence_count,0)*10)
     +0.10*case when l.bathroom_verification_status in('verified','confirmed') then 100 else 25 end
     +0.20*case when coalesce(ae.total_observations,0)=0 then 50 else greatest(0,100-(100.0*coalesce(ae.attention_observations,0)/greatest(1,ae.total_observations))) end
   )::numeric,0)))::integer health_score,
   coalesce(bi.confidence,0) bathroom_confidence,
   coalesce(bi.evidence_count,0) evidence_count,
   coalesce(ae.total_observations,0) recent_amenity_observations,
   coalesce(ae.attention_observations,0) amenity_attention_observations,
   case when coalesce(ae.total_observations,0)=0 then null else round((100.0*coalesce(ae.attention_observations,0)/greatest(1,ae.total_observations))::numeric,1) end amenity_attention_pct,
   l.cleanliness_pct,l.rating,l.review_count,l.bathroom_verification_status,l.updated_at
  from public.locations l
  left join public.location_bathroom_intelligence bi on bi.location_id=l.id
  left join lateral (
    select count(*)::integer total_observations,
      count(*) filter (where ao.status='absent' or ao.metadata->>'sentiment'='needs_attention')::integer attention_observations
    from public.location_amenity_observations ao
    where ao.location_id=l.id and ao.observed_at>=now()-interval '30 days'
  ) ae on true
  where coalesce(l.is_active,true)
    and (p_location_id is null or l.id=p_location_id)
    and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)
 ) x;
 return jsonb_build_object('business_id',p_business_id,'location_id',p_location_id,'locations',result,'formula_version','v2_amenity_evidence');
end;
$$;

create or replace function public.business_restroom_trust_quality(p_business_id uuid, p_location_id uuid default null::uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) then raise exception 'BUSINESS_ACCESS_DENIED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'location_id',l.id,'name',l.name,'quality',public.get_location_trust_quality(l.id),'conflicts',public.get_location_trust_conflicts(l.id)
 ) order by l.name),'[]'::jsonb) into result
 from public.locations l
 where coalesce(l.is_active,true)
   and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)
   and (p_location_id is null or l.id=p_location_id);
 return jsonb_build_object('business_id',p_business_id,'location_id',p_location_id,'locations',result,'generated_at',now());
end;
$$;

create or replace function public.business_reverification_queue(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) then raise exception 'BUSINESS_ACCESS_DENIED'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score desc,x.name),'[]'::jsonb) into result from (
   select l.id location_id,l.name,q,
     (case when coalesce((q->>'contradiction_count')::int,0)>0 then 50 else 0 end + case when coalesce((q->>'stale')::boolean,false) then 30 else 0 end + case when coalesce((q->>'total_observations')::int,0)<2 then 20 else 0 end)::int priority_score,
     case when coalesce((q->>'contradiction_count')::int,0)>0 then 'resolve_conflict' when coalesce((q->>'stale')::boolean,false) then 'refresh_stale_evidence' else 'increase_evidence' end suggested_action
   from public.locations l
   cross join lateral public.get_location_trust_quality(l.id) q
   where coalesce(l.is_active,true)
     and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)
     and coalesce((q->>'needs_reverification')::boolean,false)
 ) x;
 return jsonb_build_object('business_id',p_business_id,'queue',result,'generated_at',now());
end;
$$;

create or replace function public.business_reverification_operations(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) then raise exception 'BUSINESS_ACCESS_DENIED'; end if;
 insert into public.business_reverification_cases(business_id,location_id,status,opened_at,updated_at)
 select p_business_id,l.id,'open',now(),now()
 from public.locations l
 cross join lateral public.get_location_trust_quality(l.id) q
 where coalesce(l.is_active,true)
   and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)
   and coalesce((q->>'needs_reverification')::boolean,false)
   and not exists(select 1 from public.business_reverification_cases c where c.business_id=p_business_id and c.location_id=l.id and c.status in('open','in_progress'));
 update public.business_reverification_cases c
 set status='resolved',resolved_at=now(),resolution_reason='canonical_trust_quality_cleared',resolution_snapshot=coalesce(public.get_location_trust_quality(c.location_id),'{}'::jsonb),updated_at=now()
 where c.business_id=p_business_id and c.status in('open','in_progress')
   and not coalesce((public.get_location_trust_quality(c.location_id)->>'needs_reverification')::boolean,true);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.active_sort,x.priority_score desc,x.updated_at desc),'[]'::jsonb) into result
 from (
   select c.id case_id,c.business_id,c.location_id,l.name,c.status,c.assigned_to,c.qr_id,c.opened_at,c.assigned_at,c.resolved_at,c.dismissed_at,c.resolution_reason,c.resolution_snapshot,c.updated_at,q,
     case when c.status in('open','in_progress') then 0 else 1 end active_sort,
     (case when coalesce((q->>'contradiction_count')::int,0)>0 then 50 else 0 end + case when coalesce((q->>'stale')::boolean,false) then 30 else 0 end + case when coalesce((q->>'total_observations')::int,0)<2 then 20 else 0 end)::int priority_score,
     case when coalesce((q->>'contradiction_count')::int,0)>0 then 'resolve_conflict' when coalesce((q->>'stale')::boolean,false) then 'refresh_stale_evidence' when coalesce((q->>'needs_reverification')::boolean,false) then 'increase_evidence' else 'resolved' end suggested_action,
     case when c.assigned_to=auth.uid() then true else false end assigned_to_me
   from public.business_reverification_cases c
   join public.locations l on l.id=c.location_id
   cross join lateral public.get_location_trust_quality(c.location_id) q
   where c.business_id=p_business_id
 ) x;
 return jsonb_build_object('business_id',p_business_id,'cases',result,'generated_at',now());
end;
$$;

create or replace function public.business_create_reverification_qr(p_business_id uuid, p_location_id uuid)
returns public.qr_codes
language plpgsql
security definer
set search_path to ''
as $$
declare v public.qr_codes; q jsonb; c_id uuid;
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not exists(select 1 from public.locations l where l.id=p_location_id and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)) then raise exception 'Location does not belong to business'; end if;
 q:=public.get_location_trust_quality(p_location_id);
 if not coalesce((q->>'needs_reverification')::boolean,false) then raise exception 'Location does not currently need reverification'; end if;
 insert into public.business_reverification_cases(business_id,location_id,status,assigned_to,assigned_at,updated_at)
 values(p_business_id,p_location_id,'in_progress',auth.uid(),now(),now())
 on conflict (business_id,location_id) where status in ('open','in_progress') do update set status='in_progress',assigned_to=auth.uid(),assigned_at=coalesce(public.business_reverification_cases.assigned_at,now()),updated_at=now()
 returning id into c_id;
 v:=public.business_create_custom_qr(p_business_id,p_location_id,'Help reverify this restroom','trust_reverification','trust_mission',jsonb_build_object('location_id',p_location_id,'source','qr_reverification','priority',case when coalesce((q->>'contradiction_count')::int,0)>0 then 'high' else 'medium' end,'reverification_case_id',c_id),jsonb_build_object('frame_label','Help verify this restroom','cta_label','Scan to start a Kleenest trust mission'),false,null);
 update public.business_reverification_cases set qr_id=v.id,updated_at=now() where id=c_id;
 return v;
end;
$$;

create or replace function public.get_business_growth_action_summary(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
declare
 v_result jsonb;
 v_actions jsonb;
 v_locations integer:=0;
 v_healthy integer:=0;
 v_active_promotions integer:=0;
 v_active_campaigns integer:=0;
 v_qr_scans integer:=0;
 v_redemptions integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 select count(*),count(*) filter(where coalesce((public.business_restroom_health_score(p_business_id,l.id)#>>'{locations,0,health_score}')::int,0)>=75)
 into v_locations,v_healthy
 from public.locations l
 where (l.business_id=p_business_id or l.claimed_business_id=p_business_id) and coalesce(l.is_active,true);
 select count(*) into v_active_promotions from public.promotions p where p.business_id=p_business_id and p.active=true and (p.ends_at is null or p.ends_at>=now());
 select count(*) into v_active_campaigns from public.enterprise_partner_campaigns c join public.enterprise_partner_networks n on n.id=c.network_id where n.owner_business_id=p_business_id and c.status='active';
 select count(*) into v_qr_scans from public.qr_attribution_events q where q.business_id=p_business_id and q.action_type in('scan','view','engagement');
 select count(*) into v_redemptions from public.qr_redemptions r join public.qr_codes q on q.id=r.qr_code_id join public.locations l on l.id=q.location_id where l.business_id=p_business_id or l.claimed_business_id=p_business_id;
 select coalesce(jsonb_agg(action),'[]'::jsonb) into v_actions from (values
  (case when v_locations=0 then jsonb_build_object('priority','critical','type','locations','title','Add or claim your first location') else null end),
  (case when v_locations>0 and v_healthy=0 then jsonb_build_object('priority','high','type','restroom_health','title','Improve restroom health signals') else null end),
  (case when v_locations>0 and v_active_promotions=0 then jsonb_build_object('priority','medium','type','promotion','title','Create a customer promotion') else null end),
  (case when v_locations>0 and v_active_campaigns=0 then jsonb_build_object('priority','medium','type','campaign','title','Create or activate a growth campaign') else null end),
  (case when v_locations>0 and v_qr_scans=0 then jsonb_build_object('priority','medium','type','qr','title','Deploy a Kleenest QR engagement point') else null end)
 ) v(action) where action is not null;
 v_result:=jsonb_build_object('business_id',p_business_id,'locations',v_locations,'healthy_locations',v_healthy,'active_promotions',v_active_promotions,'active_campaigns',v_active_campaigns,'qr_engagements',v_qr_scans,'qr_redemptions',v_redemptions,'actions',v_actions);
 return v_result;
end;
$$;

grant select on table public.offline_packs to authenticated;
