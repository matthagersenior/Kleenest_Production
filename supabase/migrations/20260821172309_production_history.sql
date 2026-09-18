create or replace function public.process_intelligence_action_jobs(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer:=0;
  r record;
  v_business_id uuid;
  v_action text;
  v_signal_type text;
begin
  for r in
    select j.id,j.location_id,j.surface,
      coalesce(s.confidence_score,0)::numeric as confidence_score,
      coalesce(s.check_in_count,0)::numeric as checkins,
      coalesce(s.qr_check_in_count,0)::numeric as qr_checkins,
      coalesce(s.favorite_count,0)::numeric as favorites,
      coalesce(s.route_count,0)::numeric as routes,
      case
        when exists(select 1 from public.live_network_events e where e.location_id=j.location_id and e.event_type='location.conflict' and e.created_at>now()-interval '2 hours')
          or exists(select 1 from public.live_network_events e where e.location_id=j.location_id and e.event_type='location.stale' and e.created_at>now()-interval '2 hours')
          then 'operational_attention'
        when j.surface='fleet' and (coalesce(s.check_in_count,0)+coalesce(s.qr_check_in_count,0)>=10 or exists(select 1 from public.live_network_events e where e.location_id=j.location_id and e.created_at>now()-interval '2 hours'))
          then 'high_activity_zone'
        when j.surface='business' and (coalesce(s.check_in_count,0)+coalesce(s.qr_check_in_count,0)>=10 or exists(select 1 from public.live_network_events e where e.location_id=j.location_id and e.created_at>now()-interval '2 hours'))
          then 'demand_opportunity'
        when j.surface='business' and coalesce(s.favorite_count,0)+coalesce(s.route_count,0)>=10
          then 'popular_place'
        when j.surface='business' and coalesce(s.confidence_score,0)>=80
          then 'trusted_place'
        else 'review_intelligence'
      end as signal_type
    from public.intelligence_notification_jobs j
    left join public.location_feature_summary s on s.location_id=j.location_id
    where j.status='completed'
      and not exists(select 1 from public.intelligence_action_links a where a.location_id=j.location_id and a.surface=j.surface and a.created_at>now()-interval '2 hours')
    order by j.created_at asc
    limit greatest(p_limit,1)
  loop
    select lc.business_id into v_business_id
    from public.location_claims lc
    where lc.location_id=r.location_id and lc.status='active'
    order by lc.created_at desc limit 1;

    v_signal_type:=r.signal_type;
    v_action:=case
      when v_signal_type='demand_opportunity' then 'create_promotion'
      when v_signal_type='operational_attention' then 'verify_location'
      when v_signal_type='high_activity_zone' then 'review_fleet_route'
      when v_signal_type='popular_place' then 'create_event'
      when v_signal_type='trusted_place' then 'create_campaign'
      else 'review_intelligence'
    end;

    insert into public.intelligence_action_links(location_id,business_id,surface,signal_type,action_type,metadata)
    values(r.location_id,v_business_id,r.surface,v_signal_type,v_action,jsonb_build_object('source_job_id',r.id,'confidence_score',r.confidence_score,'checkins',r.checkins,'qr_checkins',r.qr_checkins,'favorites',r.favorites,'routes',r.routes));
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
