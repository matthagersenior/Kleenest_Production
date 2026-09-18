create or replace function public.is_platform_owner() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_platform_owner=true); $$;
revoke execute on function public.is_platform_owner() from public,anon;
grant execute on function public.is_platform_owner() to authenticated;
