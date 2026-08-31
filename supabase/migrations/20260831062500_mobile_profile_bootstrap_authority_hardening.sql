create or replace function public.ensure_current_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_name text;
  v_profile jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select u.email,coalesce(u.raw_user_meta_data->>'display_name',pg_catalog.split_part(u.email,'@',1)) into v_email,v_name from auth.users u where u.id=v_user;
  insert into public.profiles(id,email,display_name) values(v_user,v_email,v_name)
  on conflict(id) do update set email=excluded.email,display_name=coalesce(nullif(public.profiles.display_name,''),excluded.display_name);
  select pg_catalog.to_jsonb(p) into v_profile from public.profiles p where p.id=v_user;
  return pg_catalog.jsonb_build_object('profile',v_profile,'created',true);
end;
$$;

create or replace function public.ensure_signup_profile(p_display_name text default null,p_username text default null,p_avatar_url text default null,p_bio text default null,p_is_demo_test boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_email text; v_profile jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select u.email into v_email from auth.users u where u.id=v_user;
  insert into public.profiles(id,email,display_name,username,avatar_url,bio,is_demo_test)
  values(v_user,v_email,coalesce(nullif(p_display_name,''),pg_catalog.split_part(coalesce(v_email,''),'@',1)),nullif(p_username,''),p_avatar_url,p_bio,p_is_demo_test)
  on conflict(id) do update set email=excluded.email,display_name=coalesce(nullif(excluded.display_name,''),public.profiles.display_name),username=coalesce(excluded.username,public.profiles.username),avatar_url=coalesce(excluded.avatar_url,public.profiles.avatar_url),bio=coalesce(excluded.bio,public.profiles.bio),is_demo_test=public.profiles.is_demo_test or excluded.is_demo_test;
  select pg_catalog.to_jsonb(p) into v_profile from public.profiles p where p.id=v_user;
  return pg_catalog.jsonb_build_object('profile',v_profile,'demo',p_is_demo_test);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email,'Kleenest member')) on conflict(id) do nothing;
  return new;
end;
$$;

revoke insert on table public.profiles from authenticated;
revoke all on function public.ensure_signup_profile(text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.ensure_current_user_profile() from public,anon;
grant execute on function public.ensure_current_user_profile() to authenticated;
grant execute on function public.ensure_signup_profile(text,text,text,text,boolean) to service_role;
