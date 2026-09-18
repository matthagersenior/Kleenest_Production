create or replace view public.restroom_intelligence as
select
  p.id as place_id,
  p.location_id,
  p.name,
  p.latitude,
  p.longitude,
  coalesce(l.cleanliness_pct, 0)::numeric as base_cleanliness_pct,
  coalesce(l.bathroom_verification_count, 0)::integer as verification_count,
  coalesce(l.bathroom_positive_count, 0)::integer as positive_count,
  coalesce(l.bathroom_negative_count, 0)::integer as negative_count,
  coalesce(obs.observation_count, 0)::integer as observation_count,
  obs.last_observed_at,
  greatest(0, extract(epoch from (now() - coalesce(obs.last_observed_at, l.updated_at, p.updated_at))) / 86400)::numeric as age_days,
  case when obs.last_observed_at is null then 0 else greatest(0, 1 - extract(epoch from (now() - obs.last_observed_at)) / 2592000) end::numeric as freshness_factor,
  case when coalesce(l.bathroom_verification_count,0) + coalesce(l.bathroom_positive_count,0) + coalesce(l.bathroom_negative_count,0) > 0
       then coalesce(l.bathroom_positive_count,0)::numeric / nullif(coalesce(l.bathroom_positive_count,0)+coalesce(l.bathroom_negative_count,0),0)
       else null end as community_agreement,
  case when obs.observation_count > 0 and obs.recent_positive_count > 0 and obs.recent_negative_count > 0 then true else false end as has_recent_conflict,
  round(least(100, greatest(0,
    coalesce(l.cleanliness_pct,50) * 0.55 +
    least(20, coalesce(l.bathroom_verification_count,0) * 2) +
    least(15, coalesce(obs.observation_count,0) * 1.5) +
    case when obs.last_observed_at is null then 0 else greatest(0, 10 * (1 - extract(epoch from (now() - obs.last_observed_at)) / 2592000)) end +
    case when obs.observation_count > 0 and obs.recent_positive_count > 0 and obs.recent_negative_count = 0 then 5 else 0 end
  )))::integer as intelligence_score,
  case
    when obs.last_observed_at is null then 'No recent community observation'
    when extract(epoch from (now() - obs.last_observed_at)) / 86400 <= 1 then 'Observed today'
    when extract(epoch from (now() - obs.last_observed_at)) / 86400 <= 7 then 'Observed this week'
    when extract(epoch from (now() - obs.last_observed_at)) / 86400 <= 30 then 'Observed this month'
    else 'Observation is stale'
  end as freshness_label
from public.places p
left join public.locations l on l.id = p.location_id
left join lateral (
  select
    count(*)::integer as observation_count,
    max(created_at) as last_observed_at,
    count(*) filter (where created_at >= now() - interval '30 days' and observation_type in ('clean','supplies_stocked','open'))::integer as recent_positive_count,
    count(*) filter (where created_at >= now() - interval '30 days' and observation_type in ('needs_cleaning','supplies_low','closed_unavailable'))::integer as recent_negative_count
  from public.restroom_observations ro
  where ro.location_id = p.location_id
) obs on true
where p.is_active = true and p.category = 'restroom';

grant select on public.restroom_intelligence to anon, authenticated;
