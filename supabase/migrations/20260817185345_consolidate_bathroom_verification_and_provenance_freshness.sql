begin;

-- The four-argument legacy overload is no longer an application authority.
-- All authenticated callers must use the GPS/distance-aware five-argument contract.
revoke execute on function public.record_bathroom_verification(uuid,boolean,double precision,double precision) from public, anon, authenticated;
drop function if exists public.record_bathroom_verification(uuid,boolean,double precision,double precision);

-- Make the confidence freshness signal evidence-based rather than using the
-- location row's updated_at, which can change for unrelated edits.
create or replace function public.kleenest_location_confidence(p_location_id uuid)
returns table(score numeric, level text, verification_count integer, source_count integer, review_count integer, factors jsonb)
language sql
stable
as $function$
  with l as (
    select id, verification_status, bathroom_verification_status,
      coalesce(bathroom_verification_count,0) verification_count,
      coalesce(bathroom_positive_count,0) positive_count,
      coalesce(bathroom_negative_count,0) negative_count,
      coalesce(review_count,0) review_count,
      rating, updated_at, bathroom_verified_at, source, source_dataset
    from public.locations where id=p_location_id
  ), s as (
    select count(*)::int source_count,
           max(observed_at) evidence_observed_at
    from public.location_sources where location_id=p_location_id
  ), e as (
    select max(observed_at) external_observed_at
    from public.external_observations eo
    join public.locations lx on lx.id=eo.location_id
    where eo.location_id=p_location_id
  ), b as (
    select max(created_at) bathroom_observed_at
    from public.location_bathroom_verifications
    where location_id=p_location_id
  ), c as (
    select l.*,s.source_count,
      greatest(s.evidence_observed_at, e.external_observed_at, b.bathroom_observed_at, l.bathroom_verified_at) evidence_fresh_at,
      least(100::numeric,
        20 +
        case when lower(coalesce(l.bathroom_verification_status,'')) in ('verified','confirmed','has_bathroom') then 35 else 0 end +
        least(20, l.positive_count * 4) - least(15, l.negative_count * 5) +
        least(10, l.review_count * 1.5) +
        least(10, s.source_count * 3) +
        case when greatest(s.evidence_observed_at, e.external_observed_at, b.bathroom_observed_at, l.bathroom_verified_at) > now() - interval '180 days' then 5 else 0 end
      ) score
    from l cross join s cross join e cross join b
  )
  select round(score,2),
    case when score >= 85 then 'trusted' when score >= 65 then 'high' when score >= 40 then 'moderate' when score > 0 then 'low' else 'unknown' end,
    verification_count, source_count, review_count,
    jsonb_build_object(
      'bathroom_status', bathroom_verification_status,
      'verification_positive', positive_count,
      'verification_negative', negative_count,
      'rating', rating,
      'source', source,
      'source_dataset', source_dataset,
      'updated_at', updated_at,
      'bathroom_verified_at', bathroom_verified_at,
      'evidence_fresh_at', evidence_fresh_at,
      'freshness_basis', 'latest_source_or_external_observation_or_bathroom_verification'
    )
  from c;
$function$;

commit;
