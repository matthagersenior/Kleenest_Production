create or replace function public.archive_export_authorized(p_secret text)
returns boolean
language sql
security definer
set search_path=''
as $$
  select exists(select 1 from vault.decrypted_secrets where name='kleenest_archive_trigger' and decrypted_secret=p_secret);
$$;
revoke all on function public.archive_export_authorized(text) from public, anon, authenticated;
grant execute on function public.archive_export_authorized(text) to service_role;
