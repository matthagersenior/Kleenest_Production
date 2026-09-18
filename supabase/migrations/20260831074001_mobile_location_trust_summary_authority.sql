create or replace function public.mobile_location_trust_summaries(p_location_ids uuid[])
returns table(location_id uuid, verified_visit_count bigint, verified_review_count bigint, photo_evidence_count bigint, amenity_evidence_count bigint, latest_verified_at timestamptz, latest_amenity_observed_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(cardinality(p_location_ids),0)>100 then raise exception 'A maximum of 100 location ids may be requested'; end if;
  return query
  with requested as (
    select distinct x.location_id from unnest(coalesce(p_location_ids,'{}'::uuid[])) as x(location_id)
  ), published as (
    select r.id as review_id,r.location_id,r.check_in_id
    from public.reviews r join requested q on q.location_id=r.location_id
    where r.status='published'
  ), visits as (
    select p.location_id,count(distinct p.check_in_id) filter(where p.check_in_id is not null) as verified_visit_count,count(*) filter(where p.check_in_id is not null) as verified_review_count,max(ci.checked_in_at) as latest_verified_at
    from published p left join public.check_ins ci on ci.id=p.check_in_id and ci.location_id=p.location_id
    group by p.location_id
  ), photos as (
    select p.location_id,count(rp.id) as photo_evidence_count
    from published p join public.review_photos rp on rp.review_id=p.review_id
    group by p.location_id
  ), amenities as (
    select p.location_id,count(distinct ao.amenity_id) as amenity_evidence_count,max(ao.observed_at) as latest_amenity_observed_at
    from published p join public.location_amenity_observations ao on ao.check_in_id=p.check_in_id and ao.location_id=p.location_id
    where p.check_in_id is not null
    group by p.location_id
  )
  select q.location_id,coalesce(v.verified_visit_count,0),coalesce(v.verified_review_count,0),coalesce(ph.photo_evidence_count,0),coalesce(a.amenity_evidence_count,0),v.latest_verified_at,a.latest_amenity_observed_at
  from requested q
  left join visits v on v.location_id=q.location_id
  left join photos ph on ph.location_id=q.location_id
  left join amenities a on a.location_id=q.location_id;
end;
$$;
revoke all on function public.mobile_location_trust_summaries(uuid[]) from public;
grant execute on function public.mobile_location_trust_summaries(uuid[]) to anon,authenticated,service_role;
