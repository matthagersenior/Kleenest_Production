-- Service-role-only launcher for the private Kleenest Platform integration smoke.
-- Keeps the Vault worker credential entirely inside Postgres.

create or replace function public.trigger_platform_integration_smoke()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project_url text;
  v_worker_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name='kleenest_platform_project_url'
  limit 1;

  select decrypted_secret into v_worker_secret
  from vault.decrypted_secrets
  where name='kleenest_platform_webhook_worker_secret'
  limit 1;

  if nullif(v_project_url,'') is null or nullif(v_worker_secret,'') is null then
    raise exception 'Kleenest Platform smoke authority unavailable';
  end if;

  select net.http_post(
    url := regexp_replace(v_project_url,'/$','') || '/functions/v1/platform-integration-smoke',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-kleenest-worker-secret',v_worker_secret
    ),
    timeout_milliseconds := 30000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.trigger_platform_integration_smoke() from public,anon,authenticated;
grant execute on function public.trigger_platform_integration_smoke() to service_role;
