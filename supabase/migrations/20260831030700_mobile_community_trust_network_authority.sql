create or replace function public.community_search_contributors(p_query text, p_limit integer default 20)
returns table(user_id uuid, display_name text, username text, avatar_url text, bio text, points integer, level integer, streak integer, total_check_ins integer, total_reviews integer, reputation_score integer, reputation_level text, helpful_received bigint, badge_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare v_query text := trim(coalesce(p_query,''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_query = '' then return; end if;
  return query
  select p.id,p.display_name,p.username,p.avatar_url,p.bio,p.points,p.level,p.streak,p.total_check_ins,p.total_reviews,
         coalesce(round(cr.reputation_score),0)::integer,coalesce(cr.verification_level,'new'),
         (select count(*) from public.review_likes rl join public.reviews r on r.id=rl.review_id where r.user_id=p.id and r.status='published' and rl.user_id<>p.id),
         (select count(*) from public.user_badges ub where ub.user_id=p.id)
  from public.profiles p
  left join public.contributor_reputation cr on cr.user_id=p.id
  where coalesce(p.is_demo_test,false)=false
    and (coalesce(p.display_name,'') ilike '%'||v_query||'%' or coalesce(p.username,'') ilike '%'||v_query||'%')
  order by case when lower(coalesce(p.username,''))=lower(v_query) then 0 when lower(coalesce(p.display_name,''))=lower(v_query) then 1 when lower(coalesce(p.username,'')) like lower(v_query)||'%' then 2 when lower(coalesce(p.display_name,'')) like lower(v_query)||'%' then 3 else 4 end, p.points desc, p.id
  limit least(greatest(coalesce(p_limit,20),1),50);
end;
$$;

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
  select jsonb_build_object(
    'profile', jsonb_build_object('id',p.id,'display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio,'points',p.points,'level',p.level,'streak',p.streak,'total_check_ins',p.total_check_ins,'total_reviews',p.total_reviews),
    'reputation', case when cr.user_id is null then jsonb_build_object('score',0,'level','new') else jsonb_build_object('score',cr.reputation_score,'level',cr.verification_level,'updated_at',cr.updated_at) end,
    'helpful_received',(select count(*) from public.review_likes rl join public.reviews r on r.id=rl.review_id where r.user_id=p.id and r.status='published' and rl.user_id<>p.id),
    'verified_review_count',(select count(*) from public.reviews vr where vr.user_id=p.id and vr.status='published' and vr.check_in_id is not null),
    'badges',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'description',b.description,'icon',b.icon,'earned_at',ub.earned_at) order by ub.earned_at desc),'[]'::jsonb) from public.user_badges ub join public.badges b on b.id=ub.badge_id where ub.user_id=p.id),
    'reviews',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'location_id',r.location_id,'check_in_id',r.check_in_id,'stars',r.stars,'cleanliness_pct',r.cleanliness_pct,'comment',r.comment,'created_at',r.created_at,'helpful_count',(select count(*) from public.review_likes rl where rl.review_id=r.id)) order by r.created_at desc),'[]'::jsonb) from (select * from public.reviews where user_id=p.id and status='published' order by created_at desc limit 20) r)
  ) into result
  from public.profiles p
  left join public.contributor_reputation cr on cr.user_id=p.id
  where p.id=p_user_id and coalesce(p.is_demo_test,false)=false;
  if result is null then raise exception 'Contributor not found'; end if;
  return result;
end;
$$;

create or replace function public.community_following_members(p_limit integer default 100)
returns table(user_id uuid, followed_at timestamptz, display_name text, username text, avatar_url text, bio text, points integer, level integer, total_check_ins integer, total_reviews integer, reputation_score integer, reputation_level text, helpful_received bigint, verified_review_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, f.created_at, p.display_name, p.username, p.avatar_url, p.bio, p.points, p.level, p.total_check_ins, p.total_reviews,
         coalesce(round(cr.reputation_score),0)::integer, coalesce(cr.verification_level,'new'),
         (select count(*) from public.review_likes rl join public.reviews r on r.id=rl.review_id where r.user_id=p.id and r.status='published' and rl.user_id<>p.id),
         (select count(*) from public.reviews vr where vr.user_id=p.id and vr.status='published' and vr.check_in_id is not null)
  from public.follows f join public.profiles p on p.id=f.following_id left join public.contributor_reputation cr on cr.user_id=p.id
  where auth.uid() is not null and f.follower_id=auth.uid() and coalesce(p.is_demo_test,false)=false
  order by f.created_at desc limit least(greatest(coalesce(p_limit,100),1),100);
$$;

create or replace function public.community_follower_members(p_limit integer default 100)
returns table(user_id uuid, followed_at timestamptz, display_name text, username text, avatar_url text, bio text, points integer, level integer, total_check_ins integer, total_reviews integer, reputation_score integer, reputation_level text, helpful_received bigint, verified_review_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, f.created_at, p.display_name, p.username, p.avatar_url, p.bio, p.points, p.level, p.total_check_ins, p.total_reviews,
         coalesce(round(cr.reputation_score),0)::integer, coalesce(cr.verification_level,'new'),
         (select count(*) from public.review_likes rl join public.reviews r on r.id=rl.review_id where r.user_id=p.id and r.status='published' and rl.user_id<>p.id),
         (select count(*) from public.reviews vr where vr.user_id=p.id and vr.status='published' and vr.check_in_id is not null)
  from public.follows f join public.profiles p on p.id=f.follower_id left join public.contributor_reputation cr on cr.user_id=p.id
  where auth.uid() is not null and f.following_id=auth.uid() and coalesce(p.is_demo_test,false)=false
  order by f.created_at desc limit least(greatest(coalesce(p_limit,100),1),100);
$$;

create or replace function public.community_following_review_activity(p_limit integer default 30)
returns table(review_id uuid, user_id uuid, display_name text, username text, avatar_url text, reputation_level text, location_id uuid, location_name text, stars smallint, cleanliness_pct numeric, comment text, check_in_id uuid, helpful_count bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, p.id, p.display_name, p.username, p.avatar_url, coalesce(cr.verification_level,'new'), r.location_id, l.name, r.stars, r.cleanliness_pct, r.comment, r.check_in_id,
         (select count(*) from public.review_likes rl where rl.review_id=r.id), r.created_at
  from public.reviews r join public.profiles p on p.id=r.user_id join public.locations l on l.id=r.location_id left join public.contributor_reputation cr on cr.user_id=p.id
  where auth.uid() is not null and r.status='published' and coalesce(p.is_demo_test,false)=false and (r.user_id=auth.uid() or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=r.user_id))
  order by r.created_at desc limit least(greatest(coalesce(p_limit,30),1),100);
$$;

revoke all on function public.community_search_contributors(text,integer) from public, anon;
revoke all on function public.community_contributor_profile(uuid) from public, anon;
revoke all on function public.community_following_members(integer) from public, anon;
revoke all on function public.community_follower_members(integer) from public, anon;
revoke all on function public.community_following_review_activity(integer) from public, anon;
grant execute on function public.community_search_contributors(text,integer) to authenticated;
grant execute on function public.community_contributor_profile(uuid) to authenticated;
grant execute on function public.community_following_members(integer) to authenticated;
grant execute on function public.community_follower_members(integer) to authenticated;
grant execute on function public.community_following_review_activity(integer) to authenticated;
