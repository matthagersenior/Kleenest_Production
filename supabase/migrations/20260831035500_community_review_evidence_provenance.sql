drop function if exists public.community_following_review_activity(integer);

create function public.community_following_review_activity(p_limit integer default 30)
returns table(
  review_id uuid,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  reputation_level text,
  location_id uuid,
  location_name text,
  stars smallint,
  cleanliness_pct numeric,
  comment text,
  check_in_id uuid,
  helpful_count bigint,
  created_at timestamptz,
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
  select
    r.id,
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    coalesce(cr.verification_level,'new'),
    r.location_id,
    l.name,
    r.stars,
    r.cleanliness_pct,
    r.comment,
    r.check_in_id,
    (select count(*) from public.review_likes rl where rl.review_id=r.id),
    r.created_at,
    case when ci.id is not null then ci.checked_in_at end,
    case when ci.id is not null then ci.verification_method end,
    case when ci.id is not null then ci.distance_meters end,
    (select count(*) from public.review_photos rp where rp.review_id=r.id),
    (select count(distinct ao.amenity_id)
       from public.location_amenity_observations ao
      where ci.id is not null
        and ao.location_id=r.location_id
        and ao.user_id=r.user_id
        and ao.check_in_id=ci.id)
  from public.reviews r
  join public.profiles p on p.id=r.user_id
  join public.locations l on l.id=r.location_id
  left join public.contributor_reputation cr on cr.user_id=p.id
  left join public.check_ins ci
    on ci.id=r.check_in_id
   and ci.user_id=r.user_id
   and ci.location_id=r.location_id
  where auth.uid() is not null
    and r.status='published'
    and coalesce(p.is_demo_test,false)=false
    and (r.user_id=auth.uid() or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=r.user_id))
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit,30),1),100);
$$;

revoke all on function public.community_following_review_activity(integer) from public, anon;
grant execute on function public.community_following_review_activity(integer) to authenticated;
