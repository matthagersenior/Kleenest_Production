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
revoke all on function public.unfollow_user(uuid) from public, anon;
grant execute on function public.unfollow_user(uuid) to authenticated, service_role;
