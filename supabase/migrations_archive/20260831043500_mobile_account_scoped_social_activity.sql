create or replace function public.toggle_follow_user(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_following boolean;
  v_actor_name text;
  v_target_name text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_target_user_id is null or p_target_user_id=v_user then raise exception 'Choose another user'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_target_user_id) then raise exception 'User not found'; end if;

  if exists(select 1 from public.follows f where f.follower_id=v_user and f.following_id=p_target_user_id) then
    delete from public.follows f where f.follower_id=v_user and f.following_id=p_target_user_id;
    v_following:=false;
  else
    insert into public.follows(follower_id,following_id) values(v_user,p_target_user_id);
    v_following:=true;
    perform public.evaluate_user_badges(v_user);

    select coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'a contributor') into v_target_name
    from public.profiles p where p.id=p_target_user_id;
    insert into public.social_activity(user_id,actor_user_id,activity_type,metadata)
    values(v_user,v_user,'followed_contributor',jsonb_build_object('target_user_id',p_target_user_id,'summary','Followed '||coalesce(v_target_name,'a contributor')));

    if coalesce((select np.community from public.notification_preferences np where np.user_id=p_target_user_id),true) then
      select coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'Someone') into v_actor_name
      from public.profiles p where p.id=v_user;
      insert into public.notifications(user_id,type,title,body,data)
      values(p_target_user_id,'new_follower','Your Kleenest network grew',coalesce(v_actor_name,'Someone')||' followed you.',jsonb_build_object('contributor_id',v_user,'actor_user_id',v_user,'type','new_follower'));
    end if;
  end if;

  return jsonb_build_object('following',v_following,'follower_id',v_user,'following_id',p_target_user_id);
end;
$$;

create or replace function public.toggle_review_like(p_review_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  liked boolean;
  v_user uuid := auth.uid();
  v_review_owner uuid;
  v_location_id uuid;
  v_actor_name text;
  v_location_name text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select r.user_id,r.location_id into v_review_owner,v_location_id from public.reviews r where r.id=p_review_id and r.status='published';
  if v_review_owner is null then raise exception 'Review not found'; end if;

  if exists(select 1 from public.review_likes rl where rl.user_id=v_user and rl.review_id=p_review_id) then
    delete from public.review_likes rl where rl.user_id=v_user and rl.review_id=p_review_id;
    liked:=false;
  else
    insert into public.review_likes(user_id,review_id) values(v_user,p_review_id);
    liked:=true;
    perform public.award_helpful_review_badges(v_review_owner);

    select l.name into v_location_name from public.locations l where l.id=v_location_id;
    insert into public.social_activity(user_id,actor_user_id,activity_type,location_id,metadata)
    values(v_user,v_user,'review_helpful_given',v_location_id,jsonb_build_object('review_id',p_review_id,'review_owner_id',v_review_owner,'summary','Marked a review helpful at '||coalesce(v_location_name,'a restroom')));

    if v_review_owner<>v_user and coalesce((select np.community from public.notification_preferences np where np.user_id=v_review_owner),true) then
      select coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'Someone') into v_actor_name from public.profiles p where p.id=v_user;
      insert into public.notifications(user_id,type,title,body,data)
      values(v_review_owner,'review_helpful','Your review helped someone',coalesce(v_actor_name,'Someone')||' marked your review as helpful.',jsonb_build_object('review_id',p_review_id,'location_id',v_location_id,'actor_user_id',v_user,'type','review_helpful'));
    end if;
  end if;

  return liked;
end;
$$;

revoke all on function public.toggle_follow_user(uuid) from public, anon;
grant execute on function public.toggle_follow_user(uuid) to authenticated;
revoke all on function public.toggle_review_like(uuid) from public, anon;
grant execute on function public.toggle_review_like(uuid) to authenticated;
