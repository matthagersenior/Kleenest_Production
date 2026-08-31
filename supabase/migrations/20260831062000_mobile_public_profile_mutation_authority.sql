create or replace function public.update_my_public_profile(p_display_name text, p_username text, p_bio text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_display_name text := nullif(pg_catalog.btrim(coalesce(p_display_name,'')), '');
  v_username text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_username,''))), '');
  v_bio text := nullif(pg_catalog.btrim(coalesce(p_bio,'')), '');
  v_row public.profiles;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_display_name is not null and pg_catalog.length(v_display_name) > 80 then raise exception 'Display name must be 80 characters or fewer'; end if;
  if v_username is not null and (pg_catalog.length(v_username) < 3 or pg_catalog.length(v_username) > 30 or v_username !~ '^[a-z0-9._-]+$') then raise exception 'Username must be 3-30 characters using letters, numbers, dots, dashes, or underscores'; end if;
  if v_bio is not null and pg_catalog.length(v_bio) > 300 then raise exception 'Bio must be 300 characters or fewer'; end if;
  if v_username is not null and exists(select 1 from public.profiles p where pg_catalog.lower(p.username)=v_username and p.id<>v_uid) then raise exception 'Username is already in use'; end if;
  update public.profiles set display_name=v_display_name, username=v_username, bio=v_bio where id=v_uid returning * into v_row;
  if v_row.id is null then raise exception 'Profile not found'; end if;
  return pg_catalog.jsonb_build_object('id',v_row.id,'display_name',v_row.display_name,'username',v_row.username,'avatar_url',v_row.avatar_url,'bio',v_row.bio,'points',v_row.points,'level',v_row.level,'streak',v_row.streak,'total_check_ins',v_row.total_check_ins,'total_reviews',v_row.total_reviews);
end;
$$;

create or replace function public.update_my_public_avatar(p_avatar_url text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_avatar_url text := nullif(pg_catalog.btrim(coalesce(p_avatar_url,'')), '');
  v_row public.profiles;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_avatar_url is null or pg_catalog.length(v_avatar_url) > 2048 or v_avatar_url !~ '^https://' then raise exception 'A valid HTTPS avatar URL is required'; end if;
  update public.profiles set avatar_url=v_avatar_url where id=v_uid returning * into v_row;
  if v_row.id is null then raise exception 'Profile not found'; end if;
  return pg_catalog.jsonb_build_object('id',v_row.id,'avatar_url',v_row.avatar_url);
end;
$$;

revoke all on function public.update_my_public_profile(text,text,text) from public, anon;
revoke all on function public.update_my_public_avatar(text) from public, anon;
grant execute on function public.update_my_public_profile(text,text,text) to authenticated;
grant execute on function public.update_my_public_avatar(text) to authenticated;
revoke update on table public.profiles from authenticated;
