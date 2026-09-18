create or replace function public.admin_business_search(p_query text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare q text:=trim(coalesce(p_query,''));
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  if q='' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'name') from (
      select jsonb_build_object(
        'id',b.id,'name',b.name,'business_tier',b.business_tier::text,
        'verification_status',b.verification_status::text,'email',b.email,'phone',b.phone,'website',b.website,
        'location_count',(select count(*) from public.locations l where l.business_id=b.id or l.claimed_business_id=b.id),
        'member_count',(select count(*) from public.business_members bm where bm.business_id=b.id),
        'updated_at',b.updated_at
      ) x
      from public.businesses b
      where b.id::text=q or b.name ilike '%'||replace(replace(q,'%',''),'_','')||'%'
      order by b.name limit 30
    ) s
  ),'[]'::jsonb);
end $$;

create or replace function public.owner_progression_platform_snapshot()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  return jsonb_build_object(
    'users_with_xp',(select count(distinct user_id) from public.progression_events_v2 where status='awarded'),
    'xp_awarded',(select coalesce(sum(xp_awarded),0) from public.progression_events_v2 where status='awarded'),
    'xp_last_24h',(select coalesce(sum(xp_awarded),0) from public.progression_events_v2 where status='awarded' and created_at>=now()-interval '24 hours'),
    'xp_prev_24h',(select coalesce(sum(xp_awarded),0) from public.progression_events_v2 where status='awarded' and created_at>=now()-interval '48 hours' and created_at<now()-interval '24 hours'),
    'discoveries',(select count(*) from public.discovery_contributions),
    'on_site_discoveries',(select count(*) from public.discovery_contributions where evidence_tier>=4),
    'discovery_photos',(select count(*) from public.discovery_photos),
    'active_objectives',(select count(*) from public.progression_objectives_v2 where status='active' and (ends_at is null or ends_at>=now())),
    'objective_kinds',coalesce((select jsonb_object_agg(kind,cnt) from (select kind,count(*) cnt from public.progression_objectives_v2 where status='active' group by kind) q),'{}'::jsonb),
    'evidence_tiers',coalesce((select jsonb_agg(jsonb_build_object('tier',evidence_tier,'count',cnt) order by evidence_tier) from (select evidence_tier,count(*) cnt from public.discovery_contributions group by evidence_tier) q),'[]'::jsonb),
    'awards_by_action',coalesce((select jsonb_agg(jsonb_build_object('action',action,'events',events,'xp',xp) order by xp desc) from (select action,count(*) events,sum(xp_awarded) xp from public.progression_events_v2 where status='awarded' group by action order by xp desc limit 30) q),'[]'::jsonb),
    'level_distribution',coalesce((select jsonb_agg(jsonb_build_object('level',lvl,'users',cnt) order by lvl) from (
      select coalesce((select max(gl.level) from public.progression_global_levels gl where gl.xp_threshold<=u.xp),1) lvl,count(*) cnt
      from (select user_id,sum(xp_awarded)::bigint xp from public.progression_events_v2 where status='awarded' group by user_id) u
      group by 1 order by 1
    ) q),'[]'::jsonb),
    'specialty_levels',coalesce((select jsonb_agg(jsonb_build_object('specialty',specialty,'levels',levels) order by specialty) from (
      select specialty,count(*) levels from public.progression_specialty_levels group by specialty
    ) q),'[]'::jsonb),
    'recent_high_value_events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'action',action,'xp_awarded',xp_awarded,'evidence_tier',evidence_tier,'location_id',location_id,'created_at',created_at) order by created_at desc) from (
      select * from public.progression_events_v2 where status='awarded' order by xp_awarded desc,created_at desc limit 30
    ) q),'[]'::jsonb),
    'anomaly_candidates',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'events_24h',events,'xp_24h',xp) order by xp desc) from (
      select user_id,count(*) events,sum(xp_awarded) xp from public.progression_events_v2 where status='awarded' and created_at>=now()-interval '24 hours' group by user_id having count(*)>=50 or sum(xp_awarded)>=5000 order by xp desc limit 25
    ) q),'[]'::jsonb),
    'recent_discoveries',coalesce((select jsonb_agg(jsonb_build_object('location_id',location_id,'user_id',user_id,'method',method,'tier',evidence_tier,'state',discovery_state,'confidence',confidence,'created_at',created_at) order by created_at desc) from (
      select * from public.discovery_contributions order by created_at desc limit 25
    ) q),'[]'::jsonb)
  );
end $$;

create or replace function public.owner_progression_xp_action_catalog()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('action',action,'base_xp',base_xp,'specialty',specialty,'cooldown_seconds',cooldown_seconds,'max_per_day',max_per_day,'enabled',enabled,'metadata',metadata) order by action) from public.progression_xp_actions),'[]'::jsonb);
end $$;

create or replace function public.owner_update_progression_xp_action(p_action text,p_base_xp integer,p_cooldown_seconds integer,p_max_per_day integer,p_enabled boolean,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare caller uuid:=auth.uid(); before_state jsonb; after_state jsonb;
begin
  if caller is null or not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'reason required'; end if;
  if p_base_xp<0 or p_base_xp>10000 then raise exception 'base xp out of range'; end if;
  if p_cooldown_seconds<0 or p_cooldown_seconds>604800 then raise exception 'cooldown out of range'; end if;
  if p_max_per_day is not null and (p_max_per_day<1 or p_max_per_day>10000) then raise exception 'max per day out of range'; end if;
  select to_jsonb(x) into before_state from public.progression_xp_actions x where x.action=p_action for update;
  if before_state is null then raise exception 'xp action not found'; end if;
  update public.progression_xp_actions set base_xp=p_base_xp,cooldown_seconds=p_cooldown_seconds,max_per_day=p_max_per_day,enabled=p_enabled where action=p_action returning to_jsonb(progression_xp_actions.*) into after_state;
  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason) values(caller,caller,before_state,after_state,'XP economy: '||trim(p_reason));
  return after_state;
end $$;

revoke all on function public.admin_business_search(text) from public,anon;
revoke all on function public.owner_progression_platform_snapshot() from public,anon;
revoke all on function public.owner_progression_xp_action_catalog() from public,anon;
revoke all on function public.owner_update_progression_xp_action(text,integer,integer,integer,boolean,text) from public,anon;
grant execute on function public.admin_business_search(text) to authenticated;
grant execute on function public.owner_progression_platform_snapshot() to authenticated;
grant execute on function public.owner_progression_xp_action_catalog() to authenticated;
grant execute on function public.owner_update_progression_xp_action(text,integer,integer,integer,boolean,text) to authenticated;
