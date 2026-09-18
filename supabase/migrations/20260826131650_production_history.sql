create or replace function public.get_location_recommendation_summary(p_location_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  with t as (
    select public.get_location_trust_summary(p_location_id) as trust
  ), o as (
    select * from public.get_location_occupancy(p_location_id, 120)
  ), l as (
    select id, name, address, accessible, changing_table, cleanliness_pct, rating, review_count,
           bathroom_verification_status, bathroom_verified_at
    from public.public_locations where id = p_location_id
  )
  select jsonb_build_object(
    'location_id', l.id,
    'name', l.name,
    'trust', coalesce(t.trust, '{}'::jsonb),
    'occupancy', coalesce((select to_jsonb(o) from o limit 1), '{}'::jsonb),
    'cleanliness_pct', l.cleanliness_pct,
    'rating', l.rating,
    'review_count', l.review_count,
    'accessible', l.accessible,
    'changing_table', l.changing_table,
    'bathroom_verification_status', l.bathroom_verification_status,
    'bathroom_verified_at', l.bathroom_verified_at,
    'recommendation_band', case
      when coalesce((t.trust->>'trust_score')::numeric,0) >= 75 then 'high'
      when coalesce((t.trust->>'trust_score')::numeric,0) >= 50 then 'medium'
      else 'limited'
    end
  )
  from l cross join t;
$$;
revoke all on function public.get_location_recommendation_summary(uuid) from anon;
grant execute on function public.get_location_recommendation_summary(uuid) to authenticated;
