-- Kleenest Platform partner authority: durable credentials, compact quota metering,
-- encrypted webhook configuration, retryable event delivery, and operator summaries.

create extension if not exists pgcrypto;

create table if not exists public.platform_partners(
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  name text not null check(length(trim(name)) between 1 and 160),
  status text not null default 'active' check(status in ('active','suspended','closed')),
  plan text not null default 'developer' check(plan in ('developer','growth','fleet','enterprise')),
  quota_per_minute integer not null default 60 check(quota_per_minute between 1 and 100000),
  quota_per_month bigint not null default 10000 check(quota_per_month between 1 and 1000000000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_partner_billing(
  partner_id uuid primary key references public.platform_partners(id) on delete cascade,
  provider text not null default 'manual' check(provider in ('manual','stripe','shopify','other')),
  external_customer_id text,
  external_subscription_id text,
  status text not null default 'inactive' check(status in ('inactive','trialing','active','past_due','canceled')),
  plan_code text,
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_api_keys(
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  label text not null check(length(trim(label)) between 1 and 120),
  key_prefix text not null,
  secret_hash text not null unique,
  scopes text[] not null default array['recommendations:read']::text[],
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check(cardinality(scopes) between 1 and 32)
);
create index if not exists platform_api_keys_partner_idx on public.platform_api_keys(partner_id,created_at desc);

create table if not exists public.platform_api_rate_buckets(
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  bucket_start timestamptz not null,
  request_count integer not null default 0 check(request_count>=0),
  updated_at timestamptz not null default now(),
  primary key(partner_id,bucket_start)
);

create table if not exists public.platform_api_usage_monthly(
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  month_start date not null,
  request_count bigint not null default 0 check(request_count>=0),
  updated_at timestamptz not null default now(),
  primary key(partner_id,month_start)
);

create table if not exists public.platform_api_usage_daily(
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  usage_date date not null,
  route text not null,
  request_count bigint not null default 0 check(request_count>=0),
  success_count bigint not null default 0 check(success_count>=0),
  client_error_count bigint not null default 0 check(client_error_count>=0),
  server_error_count bigint not null default 0 check(server_error_count>=0),
  units bigint not null default 0 check(units>=0),
  updated_at timestamptz not null default now(),
  primary key(partner_id,usage_date,route)
);

create table if not exists public.platform_webhook_endpoints(
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  url text not null check(url ~ '^https://'),
  label text not null default 'Default',
  event_types text[] not null default array['*']::text[],
  signing_secret_encrypted bytea not null,
  active boolean not null default true,
  consecutive_failures integer not null default 0 check(consecutive_failures>=0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(cardinality(event_types) between 1 and 64)
);
create index if not exists platform_webhook_endpoints_partner_idx on public.platform_webhook_endpoints(partner_id,active);

create table if not exists public.platform_webhook_events(
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  event_type text not null check(length(event_type) between 3 and 120),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists platform_webhook_events_partner_created_idx on public.platform_webhook_events(partner_id,created_at desc);

create table if not exists public.platform_webhook_deliveries(
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.platform_webhook_endpoints(id) on delete cascade,
  event_id uuid not null references public.platform_webhook_events(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','delivering','delivered','dead')),
  attempts integer not null default 0 check(attempts>=0),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_http_status integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(endpoint_id,event_id)
);
create index if not exists platform_webhook_deliveries_due_idx
  on public.platform_webhook_deliveries(status,next_attempt_at)
  where status='pending';

alter table public.platform_partners enable row level security;
alter table public.platform_partner_billing enable row level security;
alter table public.platform_api_keys enable row level security;
alter table public.platform_api_rate_buckets enable row level security;
alter table public.platform_api_usage_monthly enable row level security;
alter table public.platform_api_usage_daily enable row level security;
alter table public.platform_webhook_endpoints enable row level security;
alter table public.platform_webhook_events enable row level security;
alter table public.platform_webhook_deliveries enable row level security;

revoke all on table public.platform_partners from public,anon,authenticated;
revoke all on table public.platform_partner_billing from public,anon,authenticated;
revoke all on table public.platform_api_keys from public,anon,authenticated;
revoke all on table public.platform_api_rate_buckets from public,anon,authenticated;
revoke all on table public.platform_api_usage_monthly from public,anon,authenticated;
revoke all on table public.platform_api_usage_daily from public,anon,authenticated;
revoke all on table public.platform_webhook_endpoints from public,anon,authenticated;
revoke all on table public.platform_webhook_events from public,anon,authenticated;
revoke all on table public.platform_webhook_deliveries from public,anon,authenticated;

grant select,insert,update,delete on table public.platform_partners to service_role;
grant select,insert,update,delete on table public.platform_partner_billing to service_role;
grant select,insert,update,delete on table public.platform_api_keys to service_role;
grant select,insert,update,delete on table public.platform_api_rate_buckets to service_role;
grant select,insert,update,delete on table public.platform_api_usage_monthly to service_role;
grant select,insert,update,delete on table public.platform_api_usage_daily to service_role;
grant select,insert,update,delete on table public.platform_webhook_endpoints to service_role;
grant select,insert,update,delete on table public.platform_webhook_events to service_role;
grant select,insert,update,delete on table public.platform_webhook_deliveries to service_role;

create or replace function public.create_platform_partner(
  p_slug text,
  p_name text,
  p_plan text default 'developer',
  p_quota_per_minute integer default 60,
  p_quota_per_month bigint default 10000
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  insert into public.platform_partners(slug,name,plan,quota_per_minute,quota_per_month)
  values(lower(trim(p_slug)),trim(p_name),lower(trim(p_plan)),p_quota_per_minute,p_quota_per_month)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_platform_partner(text,text,text,integer,bigint) from public,anon,authenticated;
grant execute on function public.create_platform_partner(text,text,text,integer,bigint) to service_role;

create or replace function public.set_platform_partner_billing_state(
  p_partner_id uuid,
  p_provider text,
  p_status text,
  p_plan_code text default null,
  p_external_customer_id text default null,
  p_external_subscription_id text default null,
  p_current_period_end timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $
begin
  insert into public.platform_partner_billing(
    partner_id,provider,status,plan_code,external_customer_id,external_subscription_id,current_period_end,metadata,updated_at
  )
  values(
    p_partner_id,lower(trim(p_provider)),lower(trim(p_status)),p_plan_code,p_external_customer_id,p_external_subscription_id,p_current_period_end,coalesce(p_metadata,'{}'::jsonb),now()
  )
  on conflict(partner_id) do update set
    provider=excluded.provider,
    status=excluded.status,
    plan_code=excluded.plan_code,
    external_customer_id=excluded.external_customer_id,
    external_subscription_id=excluded.external_subscription_id,
    current_period_end=excluded.current_period_end,
    metadata=excluded.metadata,
    updated_at=now();

  if p_plan_code is not null then
    update public.platform_partners
    set plan=lower(trim(p_plan_code)),updated_at=now()
    where id=p_partner_id and lower(trim(p_plan_code)) in ('developer','growth','fleet','enterprise');
  end if;
end;
$;
revoke all on function public.set_platform_partner_billing_state(uuid,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.set_platform_partner_billing_state(uuid,text,text,text,text,text,timestamptz,jsonb) to service_role;

create or replace function public.issue_platform_api_key(
  p_partner_id uuid,
  p_label text,
  p_scopes text[] default array['recommendations:read']::text[],
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_raw text;
  v_prefix text;
  v_id uuid;
begin
  if not exists(select 1 from public.platform_partners p where p.id=p_partner_id and p.status='active') then
    raise exception 'Active partner not found';
  end if;
  v_raw:='kln_live_'||encode(gen_random_bytes(24),'hex');
  v_prefix:=left(v_raw,17);
  insert into public.platform_api_keys(partner_id,label,key_prefix,secret_hash,scopes,expires_at)
  values(
    p_partner_id,
    trim(p_label),
    v_prefix,
    encode(digest(v_raw,'sha256'),'hex'),
    coalesce(nullif(p_scopes,'{}'::text[]),array['recommendations:read']::text[]),
    p_expires_at
  )
  returning id into v_id;
  return jsonb_build_object('api_key_id',v_id,'api_key',v_raw,'key_prefix',v_prefix,'expires_at',p_expires_at);
end;
$$;
revoke all on function public.issue_platform_api_key(uuid,text,text[],timestamptz) from public,anon,authenticated;
grant execute on function public.issue_platform_api_key(uuid,text,text[],timestamptz) to service_role;

create or replace function public.revoke_platform_api_key(p_api_key_id uuid)
returns boolean
language sql
security definer
set search_path=''
as $$
  update public.platform_api_keys
  set revoked_at=coalesce(revoked_at,now())
  where id=p_api_key_id
  returning true
$$;
revoke all on function public.revoke_platform_api_key(uuid) from public,anon,authenticated;
grant execute on function public.revoke_platform_api_key(uuid) to service_role;

create or replace function public.authorize_platform_request(
  p_raw_key text,
  p_route text,
  p_request_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key public.platform_api_keys;
  v_partner public.platform_partners;
  v_bucket timestamptz:=date_trunc('minute',now());
  v_month date:=date_trunc('month',current_date)::date;
  v_minute_count integer:=0;
  v_month_count bigint:=0;
  v_required_scope text:='recommendations:read';
begin
  if nullif(trim(coalesce(p_raw_key,'')),'') is null then
    return jsonb_build_object('authorized',false,'reason','missing_key','request_id',p_request_id);
  end if;

  select * into v_key
  from public.platform_api_keys k
  where k.secret_hash=encode(digest(p_raw_key,'sha256'),'hex')
    and k.revoked_at is null
    and (k.expires_at is null or k.expires_at>now())
  limit 1;

  if v_key.id is null then
    return jsonb_build_object('authorized',false,'reason','invalid_key','request_id',p_request_id);
  end if;

  select * into v_partner from public.platform_partners p where p.id=v_key.partner_id;
  if v_partner.id is null or v_partner.status<>'active' then
    return jsonb_build_object('authorized',false,'reason','partner_inactive','request_id',p_request_id);
  end if;

  if p_route not like '/v1/recommendations/%' then v_required_scope:='platform:read'; end if;
  if not ('*'=any(v_key.scopes) or v_required_scope=any(v_key.scopes)) then
    return jsonb_build_object('authorized',false,'reason','insufficient_scope','request_id',p_request_id);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_partner.id::text,0));

  select coalesce(request_count,0) into v_minute_count
  from public.platform_api_rate_buckets
  where partner_id=v_partner.id and bucket_start=v_bucket;

  select coalesce(request_count,0) into v_month_count
  from public.platform_api_usage_monthly
  where partner_id=v_partner.id and month_start=v_month;

  if coalesce(v_minute_count,0)>=v_partner.quota_per_minute then
    return jsonb_build_object(
      'authorized',false,'reason','minute_quota_exceeded','request_id',p_request_id,
      'retry_after_seconds',greatest(1,60-extract(second from now())::integer)
    );
  end if;

  if coalesce(v_month_count,0)>=v_partner.quota_per_month then
    return jsonb_build_object('authorized',false,'reason','monthly_quota_exceeded','request_id',p_request_id);
  end if;

  insert into public.platform_api_rate_buckets(partner_id,bucket_start,request_count,updated_at)
  values(v_partner.id,v_bucket,1,now())
  on conflict(partner_id,bucket_start) do update
  set request_count=public.platform_api_rate_buckets.request_count+1,updated_at=now()
  returning request_count into v_minute_count;

  insert into public.platform_api_usage_monthly(partner_id,month_start,request_count,updated_at)
  values(v_partner.id,v_month,1,now())
  on conflict(partner_id,month_start) do update
  set request_count=public.platform_api_usage_monthly.request_count+1,updated_at=now()
  returning request_count into v_month_count;

  update public.platform_api_keys set last_used_at=now() where id=v_key.id;

  return jsonb_build_object(
    'authorized',true,
    'request_id',p_request_id,
    'partner_id',v_partner.id,
    'partner_slug',v_partner.slug,
    'plan',v_partner.plan,
    'api_key_id',v_key.id,
    'scopes',to_jsonb(v_key.scopes),
    'minute_limit',v_partner.quota_per_minute,
    'minute_remaining',greatest(0,v_partner.quota_per_minute-v_minute_count),
    'month_limit',v_partner.quota_per_month,
    'month_remaining',greatest(0,v_partner.quota_per_month-v_month_count)
  );
end;
$$;
revoke all on function public.authorize_platform_request(text,text,uuid) from public,anon,authenticated;
grant execute on function public.authorize_platform_request(text,text,uuid) to service_role;

create or replace function public.record_platform_request_outcome(
  p_partner_id uuid,
  p_api_key_id uuid,
  p_route text,
  p_status_code integer,
  p_units integer default 1
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_status_code<100 or p_status_code>599 then raise exception 'Invalid status code'; end if;
  insert into public.platform_api_usage_daily(
    partner_id,usage_date,route,request_count,success_count,client_error_count,server_error_count,units,updated_at
  )
  values(
    p_partner_id,current_date,left(coalesce(p_route,'unknown'),160),1,
    case when p_status_code between 200 and 399 then 1 else 0 end,
    case when p_status_code between 400 and 499 then 1 else 0 end,
    case when p_status_code>=500 then 1 else 0 end,
    greatest(1,coalesce(p_units,1)),now()
  )
  on conflict(partner_id,usage_date,route) do update set
    request_count=public.platform_api_usage_daily.request_count+1,
    success_count=public.platform_api_usage_daily.success_count+excluded.success_count,
    client_error_count=public.platform_api_usage_daily.client_error_count+excluded.client_error_count,
    server_error_count=public.platform_api_usage_daily.server_error_count+excluded.server_error_count,
    units=public.platform_api_usage_daily.units+excluded.units,
    updated_at=now();
end;
$$;
revoke all on function public.record_platform_request_outcome(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.record_platform_request_outcome(uuid,uuid,text,integer,integer) to service_role;

create or replace function public.create_platform_webhook_endpoint(
  p_partner_id uuid,
  p_url text,
  p_label text,
  p_event_types text[],
  p_master_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_secret text;
  v_id uuid;
begin
  if nullif(p_master_key,'') is null then raise exception 'Webhook master key required'; end if;
  if p_url !~ '^https://' then raise exception 'Webhook URL must use HTTPS'; end if;
  if not exists(select 1 from public.platform_partners p where p.id=p_partner_id and p.status='active') then
    raise exception 'Active partner not found';
  end if;
  v_secret:='whsec_'||encode(gen_random_bytes(24),'hex');
  insert into public.platform_webhook_endpoints(partner_id,url,label,event_types,signing_secret_encrypted)
  values(
    p_partner_id,p_url,coalesce(nullif(trim(p_label),''),'Default'),
    coalesce(nullif(p_event_types,'{}'::text[]),array['*']::text[]),
    pgp_sym_encrypt(v_secret,p_master_key,'cipher-algo=aes256')
  )
  returning id into v_id;
  return jsonb_build_object('endpoint_id',v_id,'signing_secret',v_secret,'url',p_url);
end;
$$;
revoke all on function public.create_platform_webhook_endpoint(uuid,text,text,text[],text) from public,anon,authenticated;
grant execute on function public.create_platform_webhook_endpoint(uuid,text,text,text[],text) to service_role;

create or replace function public.disable_platform_webhook_endpoint(p_endpoint_id uuid)
returns boolean
language sql
security definer
set search_path=''
as $$
  update public.platform_webhook_endpoints
  set active=false,updated_at=now()
  where id=p_endpoint_id
  returning true
$$;
revoke all on function public.disable_platform_webhook_endpoint(uuid) from public,anon,authenticated;
grant execute on function public.disable_platform_webhook_endpoint(uuid) to service_role;

create or replace function public.enqueue_platform_webhook_event(
  p_partner_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_event_id uuid;
begin
  insert into public.platform_webhook_events(partner_id,event_type,payload)
  values(p_partner_id,p_event_type,coalesce(p_payload,'{}'::jsonb))
  returning id into v_event_id;

  insert into public.platform_webhook_deliveries(endpoint_id,event_id)
  select e.id,v_event_id
  from public.platform_webhook_endpoints e
  where e.partner_id=p_partner_id
    and e.active
    and ('*'=any(e.event_types) or p_event_type=any(e.event_types));

  return v_event_id;
end;
$$;
revoke all on function public.enqueue_platform_webhook_event(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_platform_webhook_event(uuid,text,jsonb) to service_role;

create or replace function public.claim_platform_webhook_deliveries(
  p_master_key text,
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
  pgp_sym_decrypt(ep.signing_secret_encrypted,p_master_key)::text,
  ev.payload,
  c.attempts
from claimed c
join public.platform_webhook_endpoints ep on ep.id=c.endpoint_id
join public.platform_webhook_events ev on ev.id=c.event_id;
$$;
revoke all on function public.claim_platform_webhook_deliveries(text,integer) from public,anon,authenticated;
grant execute on function public.claim_platform_webhook_deliveries(text,integer) to service_role;

create or replace function public.complete_platform_webhook_delivery(
  p_delivery_id uuid,
  p_success boolean,
  p_http_status integer default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_delivery public.platform_webhook_deliveries;
  v_delay integer;
begin
  select * into v_delivery from public.platform_webhook_deliveries where id=p_delivery_id for update;
  if v_delivery.id is null then raise exception 'Delivery not found'; end if;

  if p_success then
    update public.platform_webhook_deliveries
    set status='delivered',last_http_status=p_http_status,last_error=null,delivered_at=now()
    where id=p_delivery_id;
    update public.platform_webhook_endpoints
    set consecutive_failures=0,last_success_at=now(),updated_at=now()
    where id=v_delivery.endpoint_id;
  else
    v_delay:=least(86400,(30*power(2,greatest(0,v_delivery.attempts-1)))::integer);
    update public.platform_webhook_deliveries
    set
      status=case when attempts>=8 then 'dead' else 'pending' end,
      next_attempt_at=case when attempts>=8 then next_attempt_at else now()+make_interval(secs=>v_delay) end,
      last_http_status=p_http_status,
      last_error=left(coalesce(p_error,'delivery failed'),1000)
    where id=p_delivery_id;
    update public.platform_webhook_endpoints
    set consecutive_failures=consecutive_failures+1,last_failure_at=now(),updated_at=now()
    where id=v_delivery.endpoint_id;
  end if;
end;
$$;
revoke all on function public.complete_platform_webhook_delivery(uuid,boolean,integer,text) from public,anon,authenticated;
grant execute on function public.complete_platform_webhook_delivery(uuid,boolean,integer,text) to service_role;

create or replace function public.platform_partner_summary(p_partner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'partner',(
    select to_jsonb(p)-'metadata'
    from public.platform_partners p where p.id=p_partner_id
  ),
  'billing',(
    select jsonb_build_object(
      'provider',b.provider,'status',b.status,'plan_code',b.plan_code,
      'external_customer_id',b.external_customer_id,
      'external_subscription_id',b.external_subscription_id,
      'current_period_end',b.current_period_end,'updated_at',b.updated_at
    )
    from public.platform_partner_billing b where b.partner_id=p_partner_id
  ),
  'api_keys',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',k.id,'label',k.label,'key_prefix',k.key_prefix,'scopes',k.scopes,
      'expires_at',k.expires_at,'revoked_at',k.revoked_at,'last_used_at',k.last_used_at,'created_at',k.created_at
    ) order by k.created_at desc)
    from public.platform_api_keys k where k.partner_id=p_partner_id
  ),'[]'::jsonb),
  'month_usage',coalesce((
    select jsonb_build_object('month_start',u.month_start,'request_count',u.request_count)
    from public.platform_api_usage_monthly u
    where u.partner_id=p_partner_id and u.month_start=date_trunc('month',current_date)::date
  ),jsonb_build_object('month_start',date_trunc('month',current_date)::date,'request_count',0)),
  'daily_usage',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.usage_date desc,x.route)
    from (
      select u.usage_date,u.route,u.request_count,u.success_count,u.client_error_count,u.server_error_count,u.units
      from public.platform_api_usage_daily u
      where u.partner_id=p_partner_id and u.usage_date>=current_date-30
      order by u.usage_date desc,u.route
      limit 200
    ) x
  ),'[]'::jsonb),
  'webhooks',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',e.id,'label',e.label,'url',e.url,'event_types',e.event_types,'active',e.active,
      'consecutive_failures',e.consecutive_failures,'last_success_at',e.last_success_at,'last_failure_at',e.last_failure_at,
      'created_at',e.created_at
    ) order by e.created_at desc)
    from public.platform_webhook_endpoints e where e.partner_id=p_partner_id
  ),'[]'::jsonb)
);
$$;
revoke all on function public.platform_partner_summary(uuid) from public,anon,authenticated;
grant execute on function public.platform_partner_summary(uuid) to service_role;

create or replace function public.cleanup_platform_rate_buckets()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare v_deleted bigint;
begin
  delete from public.platform_api_rate_buckets where bucket_start<now()-interval '2 days';
  get diagnostics v_deleted=row_count;
  return v_deleted;
end;
$$;
revoke all on function public.cleanup_platform_rate_buckets() from public,anon,authenticated;
grant execute on function public.cleanup_platform_rate_buckets() to service_role;
