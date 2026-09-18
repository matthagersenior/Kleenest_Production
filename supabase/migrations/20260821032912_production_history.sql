create or replace function public.get_public_restroom_intelligence(p_place_id uuid)
returns table(
  place_id uuid,
  location_id uuid,
  name text,
  latitude double precision,
  longitude double precision,
  base_cleanliness_pct numeric,
  verification_count integer,
  positive_count integer,
  negative_count integer,
  observation_count integer,
  last_observed_at timestamptz,
  age_days numeric,
  freshness_factor numeric,
  weighted_community_agreement numeric,
  has_recent_conflict boolean,
  intelligence_score integer,
  freshness_label text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.place_id,r.location_id,r.name,r.latitude,r.longitude,
         r.base_cleanliness_pct,r.verification_count,r.positive_count,
         r.negative_count,r.observation_count,r.last_observed_at,r.age_days,
         r.freshness_factor,r.weighted_community_agreement,r.has_recent_conflict,
         r.intelligence_score,r.freshness_label
  from public.restroom_intelligence r
  where r.place_id = p_place_id;
$$;
revoke all on function public.get_public_restroom_intelligence(uuid) from public, anon, authenticated;
grant execute on function public.get_public_restroom_intelligence(uuid) to anon, authenticated;
