create or replace function public.community_contributor_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id is null then raise exception 'User id is required'; end if;
  select pg_catalog.jsonb_build_object(
    'profile', pg_catalog.jsonb_build_object('id',p.id,'display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio,'points',p.points,'level',p.level,'streak',p.streak,'total_check_ins',p.total_check_ins,'total_reviews',p.total_reviews),
    'reputation', case when cr.user_id is null then pg_catalog.jsonb_build_object('score',0,'level','new') else pg_catalog.jsonb_build_object('score',cr.reputation_score,'level',cr.verification_level,'updated_at',cr.updated_at) end,
    'helpful_received',(select count(*) from public.review_likes rl join public.reviews rr on rr.id=rl.review_id where rr.user_id=p.id and rr.status='published' and rl.user_id<>p.id),
    'verified_review_count',(select count(*) from public.reviews vr where vr.user_id=p.id and vr.status='published' and vr.check_in_id is not null),
    'badges',(select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'description',b.description,'icon',b.icon,'earned_at',ub.earned_at) order by ub.earned_at desc),'[]'::jsonb) from public.user_badges ub join public.badges b on b.id=ub.badge_id where ub.user_id=p.id),
    'reviews',(
      select pg_catalog.coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',r.id,
          'location_id',r.location_id,
          'check_in_id',r.check_in_id,
          'stars',r.stars,
          'cleanliness_pct',r.cleanliness_pct,
          'comment',r.comment,
          'created_at',r.created_at,
          'helpful_count',(select count(*) from public.review_likes rl where rl.review_id=r.id),
          'verified_checked_in_at',case when ci.id is not null then ci.checked_in_at end,
          'verified_check_in_method',case when ci.id is not null then ci.verification_method end,
          'verified_distance_meters',case when ci.id is not null then ci.distance_meters end,
          'photo_evidence_count',(select count(*) from public.review_photos rp where rp.review_id=r.id),
          'amenity_evidence_count',(select count(distinct ao.amenity_id) from public.location_amenity_observations ao where ci.id is not null and ao.location_id=r.location_id and ao.user_id=r.user_id and ao.check_in_id=ci.id)
        ) order by r.created_at desc
      ),'[]'::jsonb)
      from (select * from public.reviews where user_id=p.id and status='published' order by created_at desc limit 20) r
      left join public.check_ins ci on ci.id=r.check_in_id and ci.user_id=r.user_id and ci.location_id=r.location_id
    )
  ) into result
  from public.profiles p
  left join public.contributor_reputation cr on cr.user_id=p.id
  where p.id=p_user_id and pg_catalog.coalesce(p.is_demo_test,false)=false;
  if result is null then raise exception 'Contributor not found'; end if;
  return result;
end;
$$;

revoke all on function public.community_contributor_profile(uuid) from public, anon;
grant execute on function public.community_contributor_profile(uuid) to authenticated;
