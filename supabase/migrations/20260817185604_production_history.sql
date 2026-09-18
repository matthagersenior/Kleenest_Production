create or replace function public.kleenest_location_confidence(p_location_id uuid)
returns table(score numeric, level text, verification_count integer, source_count integer, review_count integer, factors jsonb)
language sql stable
as $function$
  with l as (
    select id, verification_status, bathroom_verification_status,
      coalesce(bathroom_verification_count,0) verification_count,
      coalesce(bathroom_positive_count,0) positive_count,
      coalesce(bathroom_negative_count,0) negative_count,
      coalesce(review_count,0) review_count, rating, updated_at,
      bathroom_verified_at, source, source_dataset
    from public.locations where id=p_location_id
  ), s as (
    select count(*)::int source_count, max(observed_at) evidence_observed_at
    from public.location_sources where location_id=p_location_id
  ), e as (
    select max(observed_at) external_observed_at
    from public.external_observations
    where location_id=p_location_id
  ), b as (
    select max(created_at) bathroom_observed_at
    from public.location_bathroom_verifications
    where location_id=p_location_id
  ), contradictions as (
    select count(*)::int contradictory_amenity_count
    from (
      select amenity_id
      from public.location_amenity_observations
      where location_id=p_location_id
        and observed_at >= now() - interval '180 days'
        and status in ('present','absent')
      group by amenity_id
      having bool_or(status='present') and bool_or(status='absent')
    ) x
  ), c as (
    select l.*,s.source_count,
      greatest(s.evidence_observed_at,e.external_observed_at,b.bathroom_observed_at,l.bathroom_verified_at) evidence_fresh_at,
      contradictions.contradictory_amenity_count,
      least(100::numeric,
        20 +
        case when lower(coalesce(l.bathroom_verification_status,'')) in ('verified','confirmed','has_bathroom') then 35 else 0 end +
        least(20,l.positive_count * 4) - least(15,l.negative_count * 5) +
        least(10,l.review_count * 1.5) + least(10,s.source_count * 3) +
        case when greatest(s.evidence_observed_at,e.external_observed_at,b.bathroom_observed_at,l.bathroom_verified_at) > now() - interval '180 days' then 5 else 0 end
      ) score
    from l cross join s cross join e cross join b cross join contradictions
  )
  select round(score,2),
    case when score >= 85 then 'trusted' when score >= 65 then 'high' when score >= 40 then 'moderate' when score > 0 then 'low' else 'unknown' end,
    verification_count,source_count,review_count,
    jsonb_build_object(
      'bathroom_status',bathroom_verification_status,
      'verification_positive',positive_count,
      'verification_negative',negative_count,
      'rating',rating,
      'source',source,
      'source_dataset',source_dataset,
      'updated_at',updated_at,
      'bathroom_verified_at',bathroom_verified_at,
      'evidence_fresh_at',evidence_fresh_at,
      'freshness_basis','latest_source_or_external_observation_or_bathroom_verification',
      'contradictory_amenity_count',contradictory_amenity_count,
      'contradiction_window','180_days',
      'contradiction_policy','present_and_absent_observations_for_same_amenity_within_window_are_exposed_as_conflict_and_do_not_get_silently_collapsed'
    )
  from c;
$function$;

comment on function public.kleenest_location_confidence(uuid) is 'Canonical location confidence calculation. Contradictory amenity observations are surfaced in factors without silently changing existing score weights.';
