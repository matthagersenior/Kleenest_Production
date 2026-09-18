create or replace function public.community_search_contributors(p_query text, p_limit integer default 20)
returns table(user_id uuid, display_name text, username text, avatar_url text, bio text, points integer, level integer, streak integer, total_check_ins integer, total_reviews integer, reputation_score integer, reputation_level text, helpful_received bigint, badge_count bigint)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query
  select p.id,p.display_name,p.username,p.avatar_url,p.bio,p.points,p.level,p.streak,p.total_check_ins,p.total_reviews,
         coalesce(cr.score,0),coalesce(cr.level,'new'),
         (select count(*) from public.review_likes rl join public.reviews r on r.id=rl.review_id where r.user_id=p.id and r.status='published' and rl.user_id<>p.id),
         (select count(*) from public.user_badges ub where ub.user_id=p.id)
  from public.profiles p
  left join public.contributor_reputation cr on cr.user_id=p.id
  where coalesce(p.is_demo_test,false)=false
    and nullif(trim(coalesce(p_query,'')),'') is not null
    and (coalesce(p.display_name,'') ilike '%'||trim(p_query)||'%' or coalesce(p.username,'') ilike '%'||trim(p_query)||'%')
  order by greatest(similarity(coalesce(p.display_name,''),trim(p_query)),similarity(coalesce(p.username,''),trim(p_query))) desc, p.points desc, p.id
  limit least(greatest(coalesce(p_limit,20),1),50);
end;
$$;

create or replace function public.community_contributor_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id is null then raise exception 'User id is required'; end if;
  select jsonb_build_object(
    'profile', jsonb_build_object('id',p.id,'display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio,'points',p.points,'level',p.level,'streak',p.streak,'total_check_ins',p.total_check_ins,'total_reviews',p.total_reviews),
    'reputation', case when cr.user_id is null then jsonb_build_object('score',0,'level','new') else jsonb_build_object('score',cr.score,'level',cr.level,'updated_at',cr.updated_at) end,
    'helpful_received',(select count(*) from public.review_likes rl join public.reviews r on r.id=rl.review_id where r.user_id=p.id and r.status='published' and rl.user_id<>p.id),
    'badges',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'description',b.description,'icon',b.icon,'earned_at',ub.earned_at) order by ub.earned_at desc),'[]'::jsonb) from public.user_badges ub join public.badges b on b.id=ub.badge_id where ub.user_id=p.id),
    'reviews',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'location_id',r.location_id,'stars',r.stars,'cleanliness_pct',r.cleanliness_pct,'comment',r.comment,'created_at',r.created_at,'helpful_count',(select count(*) from public.review_likes rl where rl.review_id=r.id)) order by r.created_at desc),'[]'::jsonb) from (select * from public.reviews where user_id=p.id and status='published' order by created_at desc limit 20) r)
  ) into result
  from public.profiles p
  left join public.contributor_reputation cr on cr.user_id=p.id
  where p.id=p_user_id and coalesce(p.is_demo_test,false)=false;
  if result is null then raise exception 'Contributor not found'; end if;
  return result;
end;
$$;

revoke all on function public.community_search_contributors(text,integer) from public, anon;
revoke all on function public.community_contributor_profile(uuid) from public, anon;
grant execute on function public.community_search_contributors(text,integer) to authenticated;
grant execute on function public.community_contributor_profile(uuid) to authenticated;
