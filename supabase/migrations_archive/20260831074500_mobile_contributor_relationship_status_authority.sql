create or replace function public.community_relationship_status(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_following boolean;
  v_follows_you boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_user_id is null then raise exception 'Contributor id is required'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id and coalesce(p.is_demo_test,false)=false) then raise exception 'Contributor not found'; end if;
  if p_user_id=v_user then return jsonb_build_object('is_self',true,'is_following',false,'follows_you',false,'mutual',false); end if;
  select exists(select 1 from public.follows f where f.follower_id=v_user and f.following_id=p_user_id),exists(select 1 from public.follows f where f.follower_id=p_user_id and f.following_id=v_user) into v_following,v_follows_you;
  return jsonb_build_object('is_self',false,'is_following',v_following,'follows_you',v_follows_you,'mutual',v_following and v_follows_you);
end;
$$;
revoke all on function public.community_relationship_status(uuid) from public,anon;
grant execute on function public.community_relationship_status(uuid) to authenticated,service_role;
