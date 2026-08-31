create or replace function public.follow_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_user_id is null or p_user_id=v_user then raise exception 'cannot_follow_self'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'user_not_found'; end if;
  if exists(select 1 from public.follows where follower_id=v_user and following_id=p_user_id) then
    return pg_catalog.jsonb_build_object('following',true,'new_follow',false);
  end if;
  v_result:=public.toggle_follow_user(p_user_id);
  return pg_catalog.jsonb_build_object('following',coalesce((v_result->>'following')::boolean,false),'new_follow',true);
end;
$$;

create or replace function public.unfollow_user(p_target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_affected integer:=0;
begin
  if v_user is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  if p_target_user_id is null or p_target_user_id=v_user then raise exception 'A different user is required.'; end if;
  delete from public.follows where follower_id=v_user and following_id=p_target_user_id;
  get diagnostics v_affected = row_count;
  return v_affected>0;
end;
$$;

revoke all on function public.follow_user(uuid) from public, anon;
grant execute on function public.follow_user(uuid) to authenticated, service_role;
revoke all on function public.unfollow_user(uuid) from public, anon;
grant execute on function public.unfollow_user(uuid) to authenticated, service_role;
