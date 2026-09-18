create index if not exists location_observations_location_observed_idx on public.location_observations(location_id, observed_at desc);
create index if not exists reviews_location_created_idx on public.reviews(location_id, created_at desc);
create index if not exists location_amenity_observations_location_observed_idx on public.location_amenity_observations(location_id, observed_at desc);

create or replace function public.get_location_trust_summary(p_location_id uuid)
returns jsonb
language sql
security definer
set search_path = public, auth, extensions, pg_catalog
as $$
with loc as (
  select l.id,
         l.verification_status,
         l.bathroom_verification_status,
         l.bathroom_verified_at,
         l.bathroom_verification_count,
         l.bathroom_positive_count,
         l.bathroom_negative_count,
         l.verification_observation_count,
         l.verification_positive_count,
         l.verification_negative_count,
         l.verification_confidence,
         l.review_count,
         l.rating,
         l.updated_at
  from locations l
  where l.id = p_location_id and l.is_active = true
),
obs as (
  select count(*) filter (where observed_at >= now() - interval '30 days')::numeric recent_observations,
         count(*)::numeric total_observations,
         avg(confidence) filter (where observed_at >= now() - interval '30 days') recent_confidence,
         max(observed_at) latest_observation
  from location_observations where location_id=p_location_id
),
am as (
  select count(*) filter (where observed_at >= now() - interval '30 days')::numeric recent_amenity_observations
  from location_amenity_observations where location_id=p_location_id
),
rv as (
  select count(*) filter (where created_at >= now() - interval '90 days')::numeric recent_reviews,
         avg(cleanliness_pct) filter (where created_at >= now() - interval '90 days') recent_cleanliness
  from reviews where location_id=p_location_id and status::text not in ('hidden','rejected')
),
score as (
  select loc.*,
    least(100, greatest(0,
      coalesce(loc.verification_confidence,0) * 0.35 +
      least(100, coalesce(obs.recent_confidence,0)) * 0.20 +
      least(100, coalesce(bi.confidence,0)) * 0.20 +
      least(100, coalesce(loc.rating,0) * 20) * 0.10 +
      least(100, coalesce(rv.recent_cleanliness,0)) * 0.10 +
      least(100, (least(obs.recent_observations,20) / 20.0) * 100) * 0.05
    ))::numeric as trust_score,
    case
      when greatest(coalesce(bi.updated_at,loc.updated_at),coalesce(obs.latest_observation,loc.updated_at)) >= now()-interval '7 days' then 'fresh'
      when greatest(coalesce(bi.updated_at,loc.updated_at),coalesce(obs.latest_observation,loc.updated_at)) >= now()-interval '30 days' then 'recent'
      when greatest(coalesce(bi.updated_at,loc.updated_at),coalesce(obs.latest_observation,loc.updated_at)) >= now()-interval '90 days' then 'aging'
      else 'stale'
    end as freshness
  from loc
  left join location_bathroom_intelligence bi on bi.location_id=loc.id
  cross join obs cross join am cross join rv
)
select jsonb_build_object(
  'location_id',id,
  'trust_score',round(trust_score,1),
  'freshness',freshness,
  'verification_confidence',coalesce(verification_confidence,0),
  'bathroom_confidence',coalesce((select confidence from location_bathroom_intelligence where location_id=id),0),
  'evidence_count',coalesce((select evidence_count from location_bathroom_intelligence where location_id=id),0),
  'recent_observations',coalesce((select count(*) from location_observations where location_id=id and observed_at>=now()-interval '30 days'),0),
  'recent_reviews',coalesce((select count(*) from reviews where location_id=id and created_at>=now()-interval '90 days'),0),
  'generated_at',now()
)
from score;
$$;

revoke execute on function public.get_location_trust_summary(uuid) from public, anon;
grant execute on function public.get_location_trust_summary(uuid) to authenticated;
