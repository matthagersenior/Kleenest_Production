-- Partner platform advisor/security hardening:
-- explicit client-deny RLS policies, webhook FK index, Vault-backed secrets,
-- owner-auth admin control, and scheduled webhook/rate-bucket workers.

create index if not exists platform_webhook_deliveries_event_idx
  on public.platform_webhook_deliveries(event_id);

drop policy if exists platform_partners_client_deny on public.platform_partners;
create policy platform_partners_client_deny on public.platform_partners
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_partner_billing_client_deny on public.platform_partner_billing;
create policy platform_partner_billing_client_deny on public.platform_partner_billing
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_api_keys_client_deny on public.platform_api_keys;
create policy platform_api_keys_client_deny on public.platform_api_keys
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_api_rate_buckets_client_deny on public.platform_api_rate_buckets;
create policy platform_api_rate_buckets_client_deny on public.platform_api_rate_buckets
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_api_usage_monthly_client_deny on public.platform_api_usage_monthly;
create policy platform_api_usage_monthly_client_deny on public.platform_api_usage_monthly
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_api_usage_daily_client_deny on public.platform_api_usage_daily;
create policy platform_api_usage_daily_client_deny on public.platform_api_usage_daily
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_webhook_endpoints_client_deny on public.platform_webhook_endpoints;
create policy platform_webhook_endpoints_client_deny on public.platform_webhook_endpoints
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_webhook_events_client_deny on public.platform_webhook_events;
create policy platform_webhook_events_client_deny on public.platform_webhook_events
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_webhook_deliveries_client_deny on public.platform_webhook_deliveries;
create policy platform_webhook_deliveries_client_deny on public.platform_webhook_deliveries
  for all to anon,authenticated using(false) with check(false);

do $vault$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='kleenest_platform_webhook_master_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'kleenest_platform_webhook_master_key',
      'Kleenest Platform webhook endpoint encryption key'
    );
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='kleenest_platform_webhook_worker_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'kleenest_platform_webhook_worker_secret',
      'Kleenest Platform scheduled webhook worker credential'
    );
  end if;
end;
$vault$;

create or replace function public.platform_webhook_master_key()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='kleenest_platform_webhook_master_key'
  limit 1
$$;
revoke all on function public.platform_webhook_master_key() from public,anon,authenticated;
grant execute on function public.platform_webhook_master_key() to service_role;

create or replace function public.authorize_platform_webhook_worker(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    encode(extensions.digest(coalesce(p_secret,''),'sha256'),'hex') =
    encode(extensions.digest(coalesce((
      select decrypted_secret
      from vault.decrypted_secrets
      where name='kleenest_platform_webhook_worker_secret'
      limit 1
    ),''),'sha256'),'hex'),
    false
  )
$$;
revoke all on function public.authorize_platform_webhook_worker(text) from public,anon,authenticated;
grant execute on function public.authorize_platform_webhook_worker(text) to service_role;

create or replace function public.create_platform_webhook_endpoint(
  p_partner_id uuid,
  p_url text,
  p_label text,
  p_event_types text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret text;
  v_id uuid;
  v_master text:=public.platform_webhook_master_key();
begin
  if nullif(v_master,'') is null then raise exception 'Webhook encryption authority unavailable'; end if;
  if p_url !~ '^https://' then raise exception 'Webhook URL must use HTTPS'; end if;
  if not exists(select 1 from public.platform_partners p where p.id=p_partner_id and p.status='active') then
    raise exception 'Active partner not found';
  end if;
  v_secret:=('wh'||'sec_')||encode(extensions.gen_random_bytes(24),'hex');
  insert into public.platform_webhook_endpoints(partner_id,url,label,event_types,signing_secret_encrypted)
  values(
    p_partner_id,p_url,coalesce(nullif(trim(p_label),''),'Default'),
    coalesce(nullif(p_event_types,'{}'::text[]),array['*']::text[]),
    extensions.pgp_sym_encrypt(v_secret,v_master,'cipher-algo=aes256')
  )
  returning id into v_id;
  return jsonb_build_object('endpoint_id',v_id,'signing_secret',v_secret,'url',p_url);
end;
$$;
revoke all on function public.create_platform_webhook_endpoint(uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function public.create_platform_webhook_endpoint(uuid,text,text,text[]) to service_role;

create or replace function public.claim_platform_webhook_deliveries(
  p_limit integer default 20
)
returns table(
  delivery_id uuid,
  endpoint_id uuid,
  event_id uuid,
  event_type text,
  event_created_at timestamptz,
  url text,
  signing_secret text,
  payload jsonb,
  attempt integer
)
language sql
security definer
set search_path=''
as $$
with due as (
  select d.id
  from public.platform_webhook_deliveries d
  join public.platform_webhook_endpoints e on e.id=d.endpoint_id
  where d.status='pending'
    and d.next_attempt_at<=now()
    and e.active
  order by d.next_attempt_at,d.created_at
  for update of d skip locked
  limit greatest(1,least(coalesce(p_limit,20),100))
),
claimed as (
  update public.platform_webhook_deliveries d
  set status='delivering',attempts=d.attempts+1,last_attempt_at=now()
  from due
  where d.id=due.id
  returning d.*
)
select
  c.id,
  c.endpoint_id,
  c.event_id,
  ev.event_type,
  ev.created_at,
  ep.url,
  extensions.pgp_sym_decrypt(ep.signing_secret_encrypted,public.platform_webhook_master_key())::text,
  ev.payload,
  c.attempts
from claimed c
join public.platform_webhook_endpoints ep on ep.id=c.endpoint_id
join public.platform_webhook_events ev on ev.id=c.event_id;
$$;
revoke all on function public.claim_platform_webhook_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_platform_webhook_deliveries(integer) to service_role;

drop function if exists public.create_platform_webhook_endpoint(uuid,text,text,text[],text);
drop function if exists public.claim_platform_webhook_deliveries(text,integer);

create or replace function public.configure_platform_partner_jobs(p_project_url text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_url text:=regexp_replace(trim(coalesce(p_project_url,'')),'/$','');
  v_project_secret_id uuid;
  v_worker_job bigint;
  v_cleanup_job bigint;
begin
  if v_url !~ '^https://[a-z0-9-]+\.supabase\.co$' then
    raise exception 'A valid Supabase project URL is required';
  end if;

  select id into v_project_secret_id
  from vault.decrypted_secrets
  where name='kleenest_platform_project_url'
  limit 1;

  if v_project_secret_id is null then
    perform vault.create_secret(v_url,'kleenest_platform_project_url','Kleenest Platform production project URL');
  else
    perform vault.update_secret(v_project_secret_id,v_url,'kleenest_platform_project_url','Kleenest Platform production project URL');
  end if;

  if exists(select 1 from cron.job where jobname='kleenest-platform-webhook-worker') then
    perform cron.unschedule('kleenest-platform-webhook-worker');
  end if;
  if exists(select 1 from cron.job where jobname='kleenest-platform-rate-bucket-cleanup') then
    perform cron.unschedule('kleenest-platform-rate-bucket-cleanup');
  end if;

  v_worker_job:=cron.schedule(
    'kleenest-platform-webhook-worker',
    '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='kleenest_platform_project_url' limit 1)
          || '/functions/v1/deliver-platform-webhooks',
        body := '{"limit":50}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-kleenest-worker-secret',
          (select decrypted_secret from vault.decrypted_secrets where name='kleenest_platform_webhook_worker_secret' limit 1)
        ),
        timeout_milliseconds := 15000
      );
    $job$
  );

  v_cleanup_job:=cron.schedule(
    'kleenest-platform-rate-bucket-cleanup',
    '17 3 * * *',
    'select public.cleanup_platform_rate_buckets();'
  );

  return jsonb_build_object(
    'webhook_worker_job_id',v_worker_job,
    'rate_bucket_cleanup_job_id',v_cleanup_job,
    'project_url',v_url
  );
end;
$$;
revoke all on function public.configure_platform_partner_jobs(text) from public,anon,authenticated;
grant execute on function public.configure_platform_partner_jobs(text) to service_role;
