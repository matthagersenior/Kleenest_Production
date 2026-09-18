create or replace view public.restroom_intelligence as
with obs as (
  select
    eo.location_id,
    count(*)::integer as observation_count,
    max(eo.observed_at) as last_observed_at,
    count(*) filter (where eo.observed_at >= now() - interval '30 days' and lower(coalesce(eo.value_text,'')) in ('clean','supplies_stocked','open'))::integer as recent_positive_count,
    count(*) filter (where eo.observed_at >= now() - interval '30 days' and lower(coalesce(eo.value_text,'')) in ('needs_cleaning','supplies_low','closed_unavailable'))::integer as recent_negative_count,
    coalesce(sum(case when eo.observed_at >= now() - interval '30 days' then coalesce(eo.confidence,1) else 0 end),0) as weighted_observation_count,
    coalesce(sum(case when eo.observed_at >= now() - interval '30 days' and lower(coalesce(eo.value_text,'')) in ('clean','supplies_stocked','open') then coalesce(eo.confidence,1) else 0 end),0) as weighted_positive_count,
    coalesce(sum(case when eo.observed_at >= now() - interval '30 days' and lower(coalesce(eo.value_text,'')) in ('needs_cleaning','supplies_low','closed_unavailable') then coalesce(eo.confidence,1) else 0 end),0) as weighted_negative_count
  from public.external_observations eo
  group by eo.location_id
)
select
  p.id as place_id,p.location_id,p.name,p.latitude,p.longitude,
  coalesce(l.cleanliness_pct,0) as base_cleanliness_pct,
  coalesce(l.bathroom_verification_count,0) as verification_count,
  coalesce(l.bathroom_positive_count,0) as positive_count,
  coalesce(l.bathroom_negative_count,0) as negative_count,
  coalesce(obs.observation_count,0) as observation_count,
  obs.last_observed_at,
  greatest(0,extract(epoch from now()-coalesce(obs.last_observed_at,l.updated_at,p.updated_at))/86400) as age_days,
  case when obs.last_observed_at is null then 0 else greatest(0,1-extract(epoch from now()-obs.last_observed_at)/2592000) end as freshness_factor,
  case when coalesce(obs.weighted_positive_count,0)+coalesce(obs.weighted_negative_count,0)>0 then obs.weighted_positive_count/nullif(obs.weighted_positive_count+obs.weighted_negative_count,0) end as weighted_community_agreement,
  coalesce(obs.weighted_positive_count,0)>0 and coalesce(obs.weighted_negative_count,0)>0 as has_recent_conflict,
  round(least(100,greatest(0,coalesce(l.cleanliness_pct,50)*.50+least(18,coalesce(l.bathroom_verification_count,0)*1.8)+least(17,coalesce(obs.weighted_observation_count,0)*2)+case when obs.last_observed_at is null then 0 else greatest(0,10*(1-extract(epoch from now()-obs.last_observed_at)/2592000)) end+case when coalesce(obs.weighted_positive_count,0)>coalesce(obs.weighted_negative_count,0) and coalesce(obs.weighted_negative_count,0)=0 then 5 else 0 end-case when coalesce(obs.weighted_negative_count,0)>coalesce(obs.weighted_positive_count,0) then 8 else 0 end)))::integer as intelligence_score,
  case when obs.last_observed_at is null then 'No recent community observation' when extract(epoch from now()-obs.last_observed_at)/86400<=1 then 'Observed today' when extract(epoch from now()-obs.last_observed_at)/86400<=7 then 'Observed this week' when extract(epoch from now()-obs.last_observed_at)/86400<=30 then 'Observed this month' else 'Observation is stale' end as freshness_label
from public.places p left join public.locations l on l.id=p.location_id left join obs on obs.location_id=p.location_id
where p.is_active=true and p.category='restroom';

create or replace view public.location_intelligence_snapshot as
select p.id as place_id,p.location_id,p.name,p.category,p.latitude,p.longitude,
coalesce(ri.intelligence_score,0) intelligence_score,ri.freshness_label,ri.last_observed_at,coalesce(ri.base_cleanliness_pct,0) cleanliness_pct,coalesce(ri.verification_count,0) verification_count,coalesce(ri.observation_count,0) observation_count,
count(dfe.id) filter(where dfe.event_type='search' and dfe.occurred_at>=now()-interval '7 days') searches_7d,
count(dfe.id) filter(where dfe.event_type='search' and dfe.occurred_at>=now()-interval '30 days') searches_30d,
count(dfe.id) filter(where dfe.event_type='location_view' and dfe.occurred_at>=now()-interval '30 days') views_30d,
count(dfe.id) filter(where dfe.event_type='directions_requested' and dfe.occurred_at>=now()-interval '30 days') directions_30d,
count(dfe.id) filter(where dfe.event_type='arrival' and dfe.occurred_at>=now()-interval '30 days') arrivals_30d,
count(dfe.id) filter(where dfe.event_type='check_in' and dfe.occurred_at>=now()-interval '30 days') checkins_30d,
count(dfe.id) filter(where dfe.event_type='review_submitted' and dfe.occurred_at>=now()-interval '30 days') reviews_30d,
now() calculated_at,
count(dfe.id) filter(where dfe.event_type='check_in' and dfe.occurred_at>=now()-interval '30 days') check_in_count
from public.places p left join restroom_intelligence ri on ri.place_id=p.id left join public.data_feature_events dfe on dfe.location_id=p.location_id where p.is_active=true group by p.id,p.location_id,p.name,p.category,p.latitude,p.longitude,ri.intelligence_score,ri.freshness_label,ri.last_observed_at,ri.base_cleanliness_pct,ri.verification_count,ri.observation_count;
