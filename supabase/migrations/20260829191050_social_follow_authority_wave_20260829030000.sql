create or replace function public.toggle_follow_user(p_target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_following boolean;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_target_user_id is null or p_target_user_id=v_user then raise exception 'Choose another user'; end if;
 if not exists(select 1 from public.profiles where id=p_target_user_id) then raise exception 'User not found'; end if;
 if exists(select 1 from public.follows where follower_id=v_user and following_id=p_target_user_id) then
   delete from public.follows where follower_id=v_user and following_id=p_target_user_id; v_following:=false;
 else
   insert into public.follows(follower_id,following_id) values(v_user,p_target_user_id); v_following:=true;
 end if;
 return jsonb_build_object('following',v_following,'follower_id',v_user,'following_id',p_target_user_id);
end $$;
revoke all on function public.toggle_follow_user(uuid) from public;
grant execute on function public.toggle_follow_user(uuid) to authenticated;
