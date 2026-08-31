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
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_target_user_id is null or p_target_user_id = v_user then raise exception 'Choose another user'; end if;
  if not exists(select 1 from public.profiles p where p.id = p_target_user_id) then raise exception 'User not found'; end if;

  if exists(select 1 from public.follows f where f.follower_id = v_user and f.following_id = p_target_user_id) then
    delete from public.follows f where f.follower_id = v_user and f.following_id = p_target_user_id;
    v_following := false;
  else
    insert into public.follows(follower_id, following_id) values(v_user, p_target_user_id);
    v_following := true;
    perform public.evaluate_user_badges(v_user);

    if coalesce((select np.community from public.notification_preferences np where np.user_id = p_target_user_id), true) then
      select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Someone')
        into v_actor_name
      from public.profiles p
      where p.id = v_user;

      insert into public.notifications(user_id, type, title, body, data)
      values(
        p_target_user_id,
        'new_follower',
        'Your Kleenest network grew',
        coalesce(v_actor_name, 'Someone') || ' followed you.',
        jsonb_build_object(
          'contributor_id', v_user,
          'actor_user_id', v_user,
          'type', 'new_follower'
        )
      );
    end if;
  end if;

  return jsonb_build_object('following', v_following, 'follower_id', v_user, 'following_id', p_target_user_id);
end;
$$;

revoke all on function public.toggle_follow_user(uuid) from public, anon;
grant execute on function public.toggle_follow_user(uuid) to authenticated;
