create or replace function public.mobile_location_network_statuses(p_location_ids uuid[])
returns setof jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if coalesce(cardinality(p_location_ids),0)>200 then
    raise exception 'A maximum of 200 location ids may be requested';
  end if;

  return query
  with requested as (
    select distinct x.location_id
    from unnest(coalesce(p_location_ids,'{}'::uuid[])) x(location_id)
  ),
  base as (
    select
      l.id as location_id,
      l.claimed_business_id,
      l.business_id,
      exists(
        select 1
        from public.location_claims lc
        where lc.location_id=l.id
          and lower(coalesce(lc.status,'')) in ('approved','verified','active','claimed')
      ) as approved_claim
    from public.locations l
    join requested q on q.location_id=l.id
    where l.is_active=true
  ),
  visits as (
    select ci.location_id,count(*)::int as verified_visits,count(distinct ci.user_id)::int as verified_contributors,max(ci.checked_in_at) as latest_visit_at
    from public.check_ins ci join requested q on q.location_id=ci.location_id
    where coalesce(ci.verification_method,'') in ('gps','qr','place')
    group by ci.location_id
  ),
  reviews as (
    select r.location_id,count(*)::int as verified_reviews,count(distinct r.user_id)::int as review_contributors,max(r.created_at) as latest_review_at
    from public.reviews r
    join public.check_ins ci on ci.id=r.check_in_id and ci.location_id=r.location_id and ci.user_id=r.user_id and coalesce(ci.verification_method,'') in ('gps','qr','place')
    join requested q on q.location_id=r.location_id
    where r.status='published'
    group by r.location_id
  ),
  photos as (
    select r.location_id,count(rp.id)::int as photo_evidence_count,max(rp.created_at) as latest_photo_at
    from public.review_photos rp join public.reviews r on r.id=rp.review_id and r.status='published'
    join requested q on q.location_id=r.location_id
    where rp.moderation_status='visible'
    group by r.location_id
  ),
  amenities as (
    select o.location_id,count(*)::int as amenity_observation_count,count(distinct o.amenity_id)::int as amenity_evidence_count,count(distinct o.user_id)::int as amenity_contributors,max(o.observed_at) as latest_amenity_at
    from public.location_amenity_observations o join requested q on q.location_id=o.location_id
    group by o.location_id
  ),
  restroom as (
    select o.location_id,count(*)::int as restroom_observation_count,count(distinct o.user_id)::int as restroom_contributors,max(o.created_at) as latest_restroom_at
    from public.restroom_observations o join requested q on q.location_id=o.location_id
    group by o.location_id
  ),
  conflicts as (
    select c.location_id,count(*) filter(where lower(coalesce(c.status,'open')) not in ('resolved','dismissed','closed'))::int as open_conflict_count
    from public.location_data_conflicts c join requested q on q.location_id=c.location_id
    group by c.location_id
  ),
  facts as (
    select
      b.location_id,(b.claimed_business_id is not null or b.approved_claim) as business_claimed,
      coalesce(v.verified_visits,0) as verified_visits,coalesce(v.verified_contributors,0) as verified_contributors,
      coalesce(r.verified_reviews,0) as verified_reviews,coalesce(r.review_contributors,0) as review_contributors,
      coalesce(p.photo_evidence_count,0) as photo_evidence_count,
      coalesce(a.amenity_observation_count,0) as amenity_observation_count,coalesce(a.amenity_evidence_count,0) as amenity_evidence_count,
      coalesce(a.amenity_contributors,0) as amenity_contributors,
      coalesce(ro.restroom_observation_count,0) as restroom_observation_count,coalesce(ro.restroom_contributors,0) as restroom_contributors,
      coalesce(c.open_conflict_count,0) as open_conflict_count,
      greatest(
        coalesce(v.latest_visit_at,'-infinity'::timestamptz),coalesce(r.latest_review_at,'-infinity'::timestamptz),
        coalesce(p.latest_photo_at,'-infinity'::timestamptz),coalesce(a.latest_amenity_at,'-infinity'::timestamptz),
        coalesce(ro.latest_restroom_at,'-infinity'::timestamptz)
      ) as latest_evidence_at
    from base b
    left join visits v on v.location_id=b.location_id
    left join reviews r on r.location_id=b.location_id
    left join photos p on p.location_id=b.location_id
    left join amenities a on a.location_id=b.location_id
    left join restroom ro on ro.location_id=b.location_id
    left join conflicts c on c.location_id=b.location_id
  ),
  scored as (
    select
      f.*,
      ((case when f.verified_visits>0 then 1 else 0 end)+(case when f.verified_reviews>0 then 1 else 0 end)+(case when f.photo_evidence_count>0 then 1 else 0 end)+(case when f.amenity_observation_count>0 then 1 else 0 end)+(case when f.restroom_observation_count>0 then 1 else 0 end))::int as evidence_type_count,
      greatest(0,least(100,
        least(30,f.verified_contributors*10)+least(20,f.verified_visits*5)+least(15,f.verified_reviews*5)+
        least(10,f.photo_evidence_count*5)+least(10,f.amenity_evidence_count*2)+least(5,f.restroom_observation_count*2)+
        case when f.latest_evidence_at>=now()-interval '30 days' then 10 when f.latest_evidence_at>=now()-interval '90 days' then 5 else 0 end-
        least(20,f.open_conflict_count*10)
      ))::int as evidence_score
    from facts f
  ),
  classified as (
    select s.*,
      (s.verified_contributors>=3 and s.verified_visits>=3 and s.verified_reviews>=1 and s.evidence_type_count>=3 and s.latest_evidence_at>=now()-interval '90 days' and s.open_conflict_count<=1 and s.evidence_score>=65) as network_verified
    from scored s
  )
  select jsonb_build_object(
    'location_id',c.location_id,
    'network_state',case when c.business_claimed then 'claimed' when c.network_verified then 'network_verified' when c.evidence_type_count>0 then 'building' else 'unknown' end,
    'network_verified',c.network_verified,'business_claimed',c.business_claimed,'evidence_score',c.evidence_score,'evidence_type_count',c.evidence_type_count,
    'verified_visits',c.verified_visits,'verified_contributors',c.verified_contributors,'verified_reviews',c.verified_reviews,'review_contributors',c.review_contributors,
    'photo_evidence_count',c.photo_evidence_count,'amenity_observation_count',c.amenity_observation_count,'amenity_evidence_count',c.amenity_evidence_count,
    'restroom_observation_count',c.restroom_observation_count,'open_conflict_count',c.open_conflict_count,
    'latest_evidence_at',nullif(c.latest_evidence_at,'-infinity'::timestamptz),'verification_policy','community_evidence_v1'
  )
  from classified c
  order by c.location_id;
end;
$function$;

revoke all on function public.mobile_location_network_statuses(uuid[]) from public;
grant execute on function public.mobile_location_network_statuses(uuid[]) to anon,authenticated,service_role;
