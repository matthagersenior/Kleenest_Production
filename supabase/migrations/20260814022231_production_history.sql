create or replace function public.demo_complete_identity(p_demo_key text)
returns uuid
language plpgsql
security definer
set search_path=public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_demo public.demo_identity_registry%rowtype;
  v_expected_email text;
  v_profile uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select email into v_email from auth.users where id=v_user;
  select * into v_demo from public.demo_identity_registry where demo_key=trim(p_demo_key) for update;
  if v_demo.id is null then raise exception 'demo identity not found'; end if;

  v_expected_email := replace(replace(trim(p_demo_key),'demo-','demo.'),'-','.') || '@kleenest.app';
  if lower(coalesce(v_email,'')) <> lower(v_expected_email) then raise exception 'demo identity email mismatch'; end if;

  insert into public.profiles(id,display_name,username,subscription_tier,is_demo_test)
  values(v_user,v_demo.display_name,v_demo.username,v_demo.subscription_tier,true)
  on conflict(id) do update set display_name=excluded.display_name,username=excluded.username,subscription_tier=excluded.subscription_tier,is_demo_test=true,updated_at=now()
  returning id into v_profile;

  update public.demo_identity_registry
  set auth_user_id=v_user,profile_id=v_profile,status='linked',updated_at=now()
  where id=v_demo.id;
  return v_profile;
end;
$$;

revoke execute on function public.demo_complete_identity(text) from anon, public;
grant execute on function public.demo_complete_identity(text) to authenticated;
