create or replace function public.community_progression_identities(p_user_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'authentication required'; end if;
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object('user_id',p.id,'identity',internal.progression_public_identity(p.id))
      order by p.id
    ),'[]'::jsonb)
    from public.profiles p
    where p.id=any(coalesce(p_user_ids,'{}'::uuid[]))
      and coalesce(p.is_demo_test,false)=false
      and not public.users_have_block_relationship(v_user,p.id)
  );
end
$$;

revoke all on function public.community_progression_identities(uuid[]) from public, anon;
grant execute on function public.community_progression_identities(uuid[]) to authenticated;
