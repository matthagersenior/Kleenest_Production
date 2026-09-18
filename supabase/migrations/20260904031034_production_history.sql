create or replace function public.business_progression_engagement_snapshot(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_result jsonb;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=v_user) and not public.is_platform_owner_session() then raise exception 'business access required'; end if;
 select jsonb_build_object(
  'business_id',p_business_id,
  'discoveries',count(distinct dc.id),
  'discovered_locations',count(distinct dc.location_id),
  'xp_at_locations',coalesce(sum(pe.xp_awarded) filter(where pe.status='awarded'),0),
  'contributors',count(distinct pe.user_id),
  'active_campaigns',(select count(*) from public.business_campaigns bc where bc.business_id=p_business_id and bc.status='active' and (bc.ends_at is null or bc.ends_at>=now())),
  'recent_actions',coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (select jsonb_build_object('action',e.action,'xp',e.xp_awarded,'location_id',e.location_id,'created_at',e.created_at) x from public.progression_events_v2 e join public.locations l2 on l2.id=e.location_id where (l2.business_id=p_business_id or l2.claimed_business_id=p_business_id) and e.status='awarded' order by e.created_at desc limit 25) q),'[]'::jsonb)
 ) into v_result
 from public.locations l
 left join public.discovery_contributions dc on dc.location_id=l.id
 left join public.progression_events_v2 pe on pe.location_id=l.id
 where l.business_id=p_business_id or l.claimed_business_id=p_business_id;
 return coalesce(v_result,jsonb_build_object('business_id',p_business_id,'discoveries',0,'discovered_locations',0,'xp_at_locations',0,'contributors',0,'active_campaigns',0,'recent_actions','[]'::jsonb));
end $$;
grant execute on function public.business_progression_engagement_snapshot(uuid) to authenticated;

create or replace function public.fleet_progression_snapshot(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=v_user) and not public.is_platform_owner_session() then raise exception 'business access required'; end if;
 return jsonb_build_object(
  'business_id',p_business_id,
  'routes_total',(select count(*) from public.fleet_routes r where r.business_id=p_business_id),
  'routes_completed',(select count(*) from public.fleet_routes r where r.business_id=p_business_id and r.status='completed'),
  'stops_completed',(select count(*) from public.fleet_route_stops s where s.business_id=p_business_id and s.actual_completed_at is not null),
  'fleet_xp',(select coalesce(sum(e.xp_awarded),0) from public.progression_events_v2 e where e.action='fleet_stop_complete' and e.status='awarded' and exists(select 1 from public.fleet_route_stops s where s.business_id=p_business_id and s.location_id=e.location_id)),
  'recent_fleet_awards',coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (select jsonb_build_object('user_id',e.user_id,'location_id',e.location_id,'xp',e.xp_awarded,'created_at',e.created_at) x from public.progression_events_v2 e where e.action='fleet_stop_complete' and e.status='awarded' and exists(select 1 from public.fleet_route_stops s where s.business_id=p_business_id and s.location_id=e.location_id) order by e.created_at desc limit 20) q),'[]'::jsonb)
 );
end $$;
grant execute on function public.fleet_progression_snapshot(uuid) to authenticated;

create or replace function public.owner_progression_platform_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
 return jsonb_build_object(
  'users_with_xp',(select count(distinct user_id) from public.progression_events_v2 where status='awarded'),
  'xp_awarded',(select coalesce(sum(xp_awarded),0) from public.progression_events_v2 where status='awarded'),
  'discoveries',(select count(*) from public.discovery_contributions),
  'on_site_discoveries',(select count(*) from public.discovery_contributions where evidence_tier>=4),
  'discovery_photos',(select count(*) from public.discovery_photos),
  'active_objectives',(select count(*) from public.progression_objectives_v2 where status='active' and (ends_at is null or ends_at>=now())),
  'objective_kinds',coalesce((select jsonb_object_agg(kind,cnt) from (select kind,count(*) cnt from public.progression_objectives_v2 where status='active' group by kind) q),'{}'::jsonb),
  'awards_by_action',coalesce((select jsonb_agg(jsonb_build_object('action',action,'events',events,'xp',xp) order by xp desc) from (select action,count(*) events,sum(xp_awarded) xp from public.progression_events_v2 where status='awarded' group by action order by xp desc limit 30) q),'[]'::jsonb),
  'recent_discoveries',coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (select jsonb_build_object('location_id',dc.location_id,'method',dc.method,'tier',dc.evidence_tier,'state',dc.discovery_state,'created_at',dc.created_at) x from public.discovery_contributions dc order by dc.created_at desc limit 25) q),'[]'::jsonb)
 );
end $$;
grant execute on function public.owner_progression_platform_snapshot() to authenticated;
