
create or replace function public.ensure_signup_profile(
  p_display_name text default null,
  p_username text default null,
  p_avatar_url text default null,
  p_bio text default null,
  p_is_demo_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_email text;
  v_profile public.profiles;
  v_allow_demo boolean:=false;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

  v_allow_demo :=
    coalesce(p_is_demo_test,false)
    and (
      coalesce(auth.jwt()->>'role','')='service_role'
      or public.is_platform_owner_session()
    );

  select u.email into v_email
  from auth.users u
  where u.id=v_user;

  insert into public.profiles(
    id,display_name,username,avatar_url,bio,is_demo_test
  )
  values(
    v_user,
    coalesce(nullif(trim(coalesce(p_display_name,'')),''),pg_catalog.split_part(coalesce(v_email,''),'@',1)),
    nullif(lower(trim(coalesce(p_username,''))),''),
    p_avatar_url,
    p_bio,
    v_allow_demo
  )
  on conflict(id) do update set
    display_name=coalesce(nullif(excluded.display_name,''),public.profiles.display_name),
    username=coalesce(excluded.username,public.profiles.username),
    avatar_url=coalesce(excluded.avatar_url,public.profiles.avatar_url),
    bio=coalesce(excluded.bio,public.profiles.bio),
    is_demo_test=case
      when v_allow_demo then true
      else public.profiles.is_demo_test
    end
  returning * into v_profile;

  return jsonb_build_object(
    'profile',to_jsonb(v_profile),
    'demo',coalesce(v_profile.is_demo_test,false)
  );
end;
$$;

revoke all on function public.ensure_signup_profile(text,text,text,text,boolean) from public,anon;
grant execute on function public.ensure_signup_profile(text,text,text,text,boolean) to authenticated,service_role;
