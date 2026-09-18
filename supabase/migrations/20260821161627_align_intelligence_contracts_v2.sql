create or replace view public.location_intelligence_snapshot as
select
  p.id as place_id,
  p.location_id,
  p.name,
  p.category,
  p.latitude,
  p.longitude,
  coalesce(ri.intelligence_score,0) as intelligence_score,
  ri.freshness_label,
  ri.last_observed_at,
  coalesce(ri.base_cleanliness_pct,0::numeric) as cleanliness_pct,
  coalesce(ri.verification_count,0) as verification_count,
  coalesce(ri.observation_count,0) as observation_count,
  count(dfe.id) filter (where dfe.event_type='search' and dfe.occurred_at >= now()-interval '7 days') as searches_7d,
  count(dfe.id) filter (where dfe.event_type='search' and dfe.occurred_at >= now()-interval '30 days') as searches_30d,
  count(dfe.id) filter (where dfe.event_type='location_view' and dfe.occurred_at >= now()-interval '30 days') as views_30d,
  count(dfe.id) filter (where dfe.event_type='directions_requested' and dfe.occurred_at >= now()-interval '30 days') as directions_30d,
  count(dfe.id) filter (where dfe.event_type='arrival' and dfe.occurred_at >= now()-interval '30 days') as arrivals_30d,
  count(dfe.id) filter (where dfe.event_type='check_in' and dfe.occurred_at >= now()-interval '30 days') as checkins_30d,
  count(dfe.id) filter (where dfe.event_type='review_submitted' and dfe.occurred_at >= now()-interval '30 days') as reviews_30d,
  now() as calculated_at,
  count(dfe.id) filter (where dfe.event_type='check_in' and dfe.occurred_at >= now()-interval '30 days') as check_in_count
from public.places p
left join public.restroom_intelligence ri on ri.place_id=p.id
left join public.data_feature_events dfe on dfe.location_id=p.location_id
where p.is_active=true
group by p.id,p.location_id,p.name,p.category,p.latitude,p.longitude,ri.intelligence_score,ri.freshness_label,ri.last_observed_at,ri.base_cleanliness_pct,ri.verification_count,ri.observation_count;
alter table public.user_feature_entitlements add column if not exists created_at timestamptz not null default now();
