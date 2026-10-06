-- Restored from the applied Kleenest_Data ledger with embedded Vault credential provisioning deliberately omitted.
-- Provision/rotate the kleenest_archive_bridge secret independently; never commit credential literals.
create or replace function public.archive_ingest_authenticated(p_secret text, p_kind text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_expected text;
begin
  select decrypted_secret into v_expected from vault.decrypted_secrets where name='kleenest_archive_bridge' limit 1;
  if v_expected is null or p_secret is distinct from v_expected then
    raise exception 'archive authentication failed' using errcode='42501';
  end if;
  return public.archive_ingest_batch(p_kind,p_rows);
end;
$$;
revoke all on function public.archive_ingest_authenticated(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.archive_ingest_authenticated(text,text,jsonb) to service_role;
