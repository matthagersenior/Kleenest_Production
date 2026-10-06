create or replace function public.get_internal_geo_archive_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'kleenest_geo_archive'
  limit 1
$$;
revoke all on function public.get_internal_geo_archive_secret() from public, anon, authenticated;
grant execute on function public.get_internal_geo_archive_secret() to service_role;
