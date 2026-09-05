create or replace function public.live_network_motif_snapshot(
  p_business_id uuid default null,
  p_window_minutes integer default 60
)
returns table(
  motif_key text,
  label text,
  scope_type text,
  scope_id uuid,
  severity text,
  confidence numeric,
  observed_count bigint,
  last_seen_at timestamptz,
  evidence jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner boolean := false;
  v_window_minutes integer := greatest(5, least(coalesce(p_window_minutes, 60), 1440));
  v_since timestamptz := now() - make_interval(mins => greatest(5, least(coalesce(p_window_minutes, 60), 1440)));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_owner := public.is_platform_owner_session();

  if p_business_id is not null
     and not v_owner
     and not public.can_manage_business(p_business_id) then
    raise exception 'Business access required';
  end if;

  return query
  with
  route_activity as (
    select count(*)::bigint as n, max(e.created_at) as last_at
    from public.location_route_events e
    left join public.locations l on l.id = e.location_id
    where e.created_at >= v_since
      and (p_business_id is null or l.business_id = p_business_id)
  ),
  discovery_activity as (
    select count(*)::bigint as n, max(e.created_at) as last_at
    from public.location_discovery_events e
    where e.created_at >= v_since
      and p_business_id is null
  ),
  quality as (
    select
      count(*)::bigint as n,
      max(q.observed_at) as last_at,
      avg(q.cleanliness_score)::numeric as cleanliness,
      avg(q.safety_score)::numeric as safety,
      avg(q.availability_score)::numeric as availability,
      avg(q.overall_stars)::numeric as stars
    from public.location_quality_observations q
    join public.locations l on l.id = q.location_id
    where q.observed_at >= v_since
      and (p_business_id is null or l.business_id = p_business_id)
  ),
  occupancy as (
    select
      count(*)::bigint as n,
      max(o.observed_at) as last_at,
      avg(case when o.capacity_count > 0 then o.occupancy_count::numeric / o.capacity_count end)::numeric as occupancy_ratio,
      avg(o.queue_count)::numeric as queue_avg,
      avg(o.wait_minutes)::numeric as wait_avg,
      avg(o.confidence)::numeric as source_confidence
    from public.location_occupancy_observations o
    join public.locations l on l.id = o.location_id
    where o.observed_at >= v_since
      and (p_business_id is null or l.business_id = p_business_id)
  ),
  geofence as (
    select
      count(*)::bigint as n,
      count(*) filter (where g.event_type = 'enter')::bigint as enters,
      count(*) filter (where g.event_type = 'exit')::bigint as exits,
      count(*) filter (where g.dwell_seconds is not null)::bigint as dwells,
      avg(g.dwell_seconds)::numeric as dwell_avg,
      max(g.occurred_at) as last_at
    from public.geofence_events g
    where g.occurred_at >= v_since
      and (p_business_id is null or g.business_id = p_business_id)
      and (v_owner or p_business_id is not null)
  ),
  fleet as (
    select
      (select count(*) from public.fleet_operational_events e
       where e.occurred_at >= v_since
         and (p_business_id is null or e.business_id = p_business_id))::bigint as event_n,
      (select count(*) from public.fleet_alerts a
       where a.created_at >= v_since
         and a.status <> 'resolved'
         and (p_business_id is null or a.business_id = p_business_id))::bigint as open_alert_n,
      greatest(
        coalesce((select max(e.occurred_at) from public.fleet_operational_events e
                  where e.occurred_at >= v_since and (p_business_id is null or e.business_id = p_business_id)), '-infinity'::timestamptz),
        coalesce((select max(a.created_at) from public.fleet_alerts a
                  where a.created_at >= v_since and (p_business_id is null or a.business_id = p_business_id)), '-infinity'::timestamptz)
      ) as last_at
    where v_owner or p_business_id is not null
  ),
  source_health as (
    select
      count(*)::bigint as n,
      count(*) filter (where e.event_type = 'source_health_degraded')::bigint as degraded,
      count(*) filter (where e.event_type = 'source_health_recovered')::bigint as recovered,
      max(e.created_at) as last_at
    from public.live_network_events e
    where e.created_at >= v_since
      and e.event_type in ('source_health_degraded','source_health_recovered')
  ),
  motifs as (
    select
      'network_momentum'::text as motif_key,
      'Network momentum'::text as label,
      case when p_business_id is null then 'network' else 'business' end::text as scope_type,
      p_business_id as scope_id,
      case
        when (coalesce(r.n,0) + coalesce(d.n,0)) >= 100 then 'high'
        when (coalesce(r.n,0) + coalesce(d.n,0)) >= 20 then 'elevated'
        when (coalesce(r.n,0) + coalesce(d.n,0)) > 0 then 'active'
        else 'quiet'
      end::text as severity,
      least(1::numeric, (coalesce(r.n,0) + coalesce(d.n,0))::numeric / 25)::numeric as confidence,
      (coalesce(r.n,0) + coalesce(d.n,0))::bigint as observed_count,
      greatest(coalesce(r.last_at,'-infinity'::timestamptz),coalesce(d.last_at,'-infinity'::timestamptz)) as last_seen_at,
      jsonb_build_object('routes',coalesce(r.n,0),'discoveries',coalesce(d.n,0),'window_minutes',v_window_minutes) as evidence
    from route_activity r cross join discovery_activity d

    union all

    select
      'quality_drift','Quality drift',
      case when p_business_id is null then 'network' else 'business' end,
      p_business_id,
      case
        when q.n = 0 then 'quiet'
        when coalesce(q.cleanliness,5) < 2.5 or coalesce(q.safety,5) < 2.5 then 'high'
        when coalesce(q.cleanliness,5) < 3.5 or coalesce(q.availability,5) < 3.5 then 'elevated'
        else 'stable'
      end,
      least(1::numeric, q.n::numeric / 10),
      q.n,
      q.last_at,
      jsonb_build_object('cleanliness_avg',round(q.cleanliness,2),'safety_avg',round(q.safety,2),'availability_avg',round(q.availability,2),'stars_avg',round(q.stars,2),'window_minutes',v_window_minutes)
    from quality q

    union all

    select
      'occupancy_pressure','Occupancy pressure',
      case when p_business_id is null then 'network' else 'business' end,
      p_business_id,
      case
        when o.n = 0 then 'quiet'
        when coalesce(o.occupancy_ratio,0) >= 0.9 or coalesce(o.wait_avg,0) >= 10 then 'high'
        when coalesce(o.occupancy_ratio,0) >= 0.7 or coalesce(o.wait_avg,0) >= 5 or coalesce(o.queue_avg,0) >= 3 then 'elevated'
        else 'stable'
      end,
      least(1::numeric, greatest(coalesce(o.source_confidence,0), o.n::numeric / 10)),
      o.n,
      o.last_at,
      jsonb_build_object('occupancy_ratio',round(o.occupancy_ratio,3),'queue_avg',round(o.queue_avg,2),'wait_minutes_avg',round(o.wait_avg,2),'window_minutes',v_window_minutes)
    from occupancy o

    union all

    select
      'geofence_flow','Geofence flow',
      case when p_business_id is null then 'network' else 'business' end,
      p_business_id,
      case when g.n >= 50 then 'high' when g.n >= 10 then 'elevated' when g.n > 0 then 'active' else 'quiet' end,
      least(1::numeric, g.n::numeric / 10),
      g.n,
      g.last_at,
      jsonb_build_object('enters',g.enters,'exits',g.exits,'dwells',g.dwells,'dwell_seconds_avg',round(g.dwell_avg,1),'window_minutes',v_window_minutes)
    from geofence g
    where v_owner or p_business_id is not null

    union all

    select
      'fleet_pressure','Fleet operational pressure',
      case when p_business_id is null then 'network' else 'business' end,
      p_business_id,
      case when f.open_alert_n >= 5 then 'high' when f.open_alert_n > 0 then 'elevated' when f.event_n > 0 then 'active' else 'quiet' end,
      least(1::numeric, greatest(f.event_n,f.open_alert_n)::numeric / 10),
      (f.event_n + f.open_alert_n)::bigint,
      nullif(f.last_at,'-infinity'::timestamptz),
      jsonb_build_object('operational_events',f.event_n,'open_alerts',f.open_alert_n,'window_minutes',v_window_minutes)
    from fleet f
    where v_owner or p_business_id is not null

    union all

    select
      'source_health','Source health',
      'network',null::uuid,
      case when s.degraded > s.recovered then 'elevated' when s.n > 0 then 'stable' else 'quiet' end,
      least(1::numeric, s.n::numeric / 4),
      s.n,
      s.last_at,
      jsonb_build_object('degraded',s.degraded,'recovered',s.recovered,'window_minutes',v_window_minutes)
    from source_health s
  )
  select
    m.motif_key,m.label,m.scope_type,m.scope_id,m.severity,
    round(coalesce(m.confidence,0),3),m.observed_count,
    nullif(m.last_seen_at,'-infinity'::timestamptz),m.evidence
  from motifs m
  order by
    case m.severity when 'high' then 1 when 'elevated' then 2 when 'active' then 3 when 'stable' then 4 else 5 end,
    m.motif_key;
end;
$$;

revoke all on function public.live_network_motif_snapshot(uuid,integer) from public;
grant execute on function public.live_network_motif_snapshot(uuid,integer) to authenticated;

comment on function public.live_network_motif_snapshot(uuid,integer) is
'Privacy-safe live-network motif analysis. Global non-owner callers receive aggregate network/quality/occupancy/source-health motifs only; business operational motifs require business management access, and platform owners may request global operational motifs.';
