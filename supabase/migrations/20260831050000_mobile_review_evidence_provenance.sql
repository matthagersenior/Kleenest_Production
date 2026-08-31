create or replace function public.mobile_location_review_evidence(
  p_location_id uuid,
  p_limit integer default 30
)
returns table(
  review_id uuid,
  verified_checked_in_at timestamptz,
  verified_check_in_method text,
  verified_distance_meters double precision,
  photo_evidence_count bigint,
  amenity_evidence_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select r.id, r.user_id, r.location_id, r.check_in_id, r.created_at
    from public.reviews r
    where r.location_id = p_location_id
      and r.status = 'published'
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit,30),1),100)
  )
  select
    p.id as review_id,
    case when ci.id is not null then ci.checked_in_at end as verified_checked_in_at,
    case when ci.id is not null then ci.verification_method end as verified_check_in_method,
    case when ci.id is not null then ci.distance_meters end as verified_distance_meters,
    (select count(*) from public.review_photos rp where rp.review_id = p.id) as photo_evidence_count,
    (select count(distinct ao.amenity_id)
       from public.location_amenity_observations ao
      where ci.id is not null
        and ao.location_id = p.location_id
        and ao.user_id = p.user_id
        and ao.check_in_id = ci.id) as amenity_evidence_count
  from published p
  left join public.check_ins ci
    on ci.id = p.check_in_id
   and ci.user_id = p.user_id
   and ci.location_id = p.location_id
  order by p.created_at desc;
$$;

revoke all on function public.mobile_location_review_evidence(uuid,integer) from public;
grant execute on function public.mobile_location_review_evidence(uuid,integer) to anon, authenticated;

create or replace function public.mobile_review_evidence(p_review_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when r.id is null then null else pg_catalog.jsonb_build_object(
    'review_id', r.id,
    'verified_checked_in_at', case when ci.id is not null then ci.checked_in_at end,
    'verified_check_in_method', case when ci.id is not null then ci.verification_method end,
    'verified_distance_meters', case when ci.id is not null then ci.distance_meters end,
    'photo_evidence_count', (select count(*) from public.review_photos rp where rp.review_id = r.id),
    'amenity_evidence_count', (select count(distinct ao.amenity_id) from public.location_amenity_observations ao where ci.id is not null and ao.location_id = r.location_id and ao.user_id = r.user_id and ao.check_in_id = ci.id)
  ) end
  from public.reviews r
  left join public.check_ins ci
    on ci.id = r.check_in_id
   and ci.user_id = r.user_id
   and ci.location_id = r.location_id
  where r.id = p_review_id
    and r.status = 'published'
  limit 1;
$$;

revoke all on function public.mobile_review_evidence(uuid) from public;
grant execute on function public.mobile_review_evidence(uuid) to anon, authenticated;
