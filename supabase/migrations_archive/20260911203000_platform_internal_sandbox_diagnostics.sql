-- Internal sandbox diagnostics authority. The internal development API key remains in Vault.
create or replace function public.platform_internal_development_api_key()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='kleenest_internal_development_api_key'
  limit 1
$$;

revoke all on function public.platform_internal_development_api_key() from public,anon,authenticated;
grant execute on function public.platform_internal_development_api_key() to service_role;
