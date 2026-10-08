-- Kleenest Mail: service-only VAPID key storage in Supabase Vault.
-- Version mirrors the applied production migration 20261008213822.
-- These invoker functions are callable ONLY with a Supabase service role.
create or replace function public.owner_email_vapid_get()
returns jsonb language sql security invoker set search_path=''
as $fn$
  select pg_catalog.jsonb_build_object(
    'public_key', (select decrypted_secret from vault.decrypted_secrets where name='kleenest_mail_vapid_public' limit 1),
    'private_key', (select decrypted_secret from vault.decrypted_secrets where name='kleenest_mail_vapid_private' limit 1)
  )
$fn$;
revoke all on function public.owner_email_vapid_get() from public,anon,authenticated;
grant execute on function public.owner_email_vapid_get() to service_role;

create or replace function public.owner_email_vapid_seed(p_public_key text,p_private_key text)
returns boolean language plpgsql security invoker set search_path=''
as $fn$
begin
  if pg_catalog.length(p_public_key) < 80 or pg_catalog.length(p_public_key) > 110
     or pg_catalog.length(p_private_key) < 40 or pg_catalog.length(p_private_key) > 70
     or p_public_key !~ '^[A-Za-z0-9_-]+$' or p_private_key !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Invalid Web Push credentials.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(220008,62001);
  if exists(select 1 from vault.decrypted_secrets where name='kleenest_mail_vapid_public')
    or exists(select 1 from vault.decrypted_secrets where name='kleenest_mail_vapid_private') then
    return false;
  end if;
  perform vault.create_secret(p_public_key,'kleenest_mail_vapid_public','Mail PWA public VAPID key');
  perform vault.create_secret(p_private_key,'kleenest_mail_vapid_private','Mail PWA private VAPID key');
  return true;
end;
$fn$;
revoke all on function public.owner_email_vapid_seed(text,text) from public,anon,authenticated;
grant execute on function public.owner_email_vapid_seed(text,text) to service_role;
