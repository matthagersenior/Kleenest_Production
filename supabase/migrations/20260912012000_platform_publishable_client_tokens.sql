-- Browser-safe publishable credentials for Kleenest Platform.
-- Publishable tokens are intentionally limited: read-only, expiring, exact-origin bound,
-- independently rate limited, and still counted against the partner's canonical quota.

alter table public.platform_api_keys
  add column if not exists credential_type text not null default 'secret',
  add column if not exists allowed_origins text[] not null default '{}'::text[],
  add column if not exists credential_quota_per_minute integer;

do $constraints$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.platform_api_keys'::regclass
      and conname='platform_api_keys_credential_type_check'
  ) then
    alter table public.platform_api_keys
      add constraint platform_api_keys_credential_type_check
      check(credential_type in ('secret','publishable'));
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.platform_api_keys'::regclass
      and conname='platform_api_keys_credential_quota_check'
  ) then
    alter table public.platform_api_keys
      add constraint platform_api_keys_credential_quota_check
      check(credential_quota_per_minute is null or credential_quota_per_minute between 1 and 300);
  end if;
end;
$constraints$;

create table if not exists public.platform_api_key_rate_buckets(
  api_key_id uuid not null references public.platform_api_keys(id) on delete cascade,
  bucket_start timestamptz not null,
  request_count integer not null default 0 check(request_count>=0),
  updated_at timestamptz not null default now(),
  primary key(api_key_id,bucket_start)
);

alter table public.platform_api_key_rate_buckets enable row level security;
revoke all on table public.platform_api_key_rate_buckets from public,anon,authenticated;
grant select,insert,update,delete on table public.platform_api_key_rate_buckets to service_role;

drop policy if exists platform_api_key_rate_buckets_client_deny on public.platform_api_key_rate_buckets;
create policy platform_api_key_rate_buckets_client_deny on public.platform_api_key_rate_buckets
  for all to anon,authenticated using(false) with check(false);

create or replace function public.normalize_platform_origin(p_origin text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when nullif(trim(coalesce(p_origin,'')),'') is null then null
    else regexp_replace(lower(trim(p_origin)),'/$','')
  end
$$;
revoke all on function public.normalize_platform_origin(text) from public,anon,authenticated;
grant execute on function public.normalize_platform_origin(text) to service_role;

create or replace function public.issue_platform_publishable_token(
  p_partner_id uuid,
  p_label text,
  p_allowed_origins text[],
  p_expires_at timestamptz default now()+interval '7 days',
  p_quota_per_minute integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_partner public.platform_partners;
  v_origins text[];
  v_origin text;
  v_raw text;
  v_prefix text;
  v_id uuid;
  v_active integer;
begin
  select * into v_partner
  from public.platform_partners p
  where p.id=p_partner_id and p.status='active';

  if v_partner.id is null then raise exception 'Active partner not found'; end if;

  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '30 days' then
    raise exception 'Publishable token expiration must be within 30 days';
  end if;

  if p_quota_per_minute is null or p_quota_per_minute<1
     or p_quota_per_minute>least(v_partner.quota_per_minute,120) then
    raise exception 'Publishable token minute quota is invalid';
  end if;

  select array_agg(origin order by origin) into v_origins
  from (
    select distinct public.normalize_platform_origin(x) as origin
    from unnest(coalesce(p_allowed_origins,'{}'::text[])) x
    where public.normalize_platform_origin(x) is not null
  ) normalized;

  if coalesce(cardinality(v_origins),0)=0 then
    raise exception 'At least one allowed origin is required';
  end if;

  foreach v_origin in array v_origins loop
    if v_origin !~ '^https://[a-z0-9.-]+(:[0-9]+)?$'
       and v_origin !~ '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]+)?$' then
      raise exception 'Allowed origins must be exact HTTPS origins or localhost HTTP origins';
    end if;
  end loop;

  select count(*) into v_active
  from public.platform_api_keys k
  where k.partner_id=p_partner_id
    and k.credential_type='publishable'
    and k.revoked_at is null
    and (k.expires_at is null or k.expires_at>now());

  if v_active>=20 then raise exception 'Partner publishable token limit reached'; end if;

  v_raw:='kln_pub_'||encode(extensions.gen_random_bytes(24),'hex');
  v_prefix:=left(v_raw,16);

  insert into public.platform_api_keys(
    partner_id,label,key_prefix,secret_hash,scopes,expires_at,
    credential_type,allowed_origins,credential_quota_per_minute
  )
  values(
    p_partner_id,
    coalesce(nullif(trim(p_label),''),'Browser token'),
    v_prefix,
    encode(extensions.digest(v_raw,'sha256'),'hex'),
    array['recommendations:read']::text[],
    p_expires_at,
    'publishable',
    v_origins,
    p_quota_per_minute
  )
  returning id into v_id;

  return jsonb_build_object(
    'api_key_id',v_id,
    'client_token',v_raw,
    'key_prefix',v_prefix,
    'credential_type','publishable',
    'allowed_origins',to_jsonb(v_origins),
    'quota_per_minute',p_quota_per_minute,
    'expires_at',p_expires_at
  );
end;
$$;
revoke all on function public.issue_platform_publishable_token(uuid,text,text[],timestamptz,integer) from public,anon,authenticated;
grant execute on function public.issue_platform_publishable_token(uuid,text,text[],timestamptz,integer) to service_role;

create or replace function public.issue_platform_member_publishable_token(
  p_user_id uuid,
  p_partner_id uuid,
  p_label text,
  p_allowed_origins text[],
  p_expires_at timestamptz default now()+interval '7 days',
  p_quota_per_minute integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if public.platform_partner_member_role(p_user_id,p_partner_id) is null then
    raise exception 'Partner membership required';
  end if;

  return public.issue_platform_publishable_token(
    p_partner_id,p_label,p_allowed_origins,p_expires_at,p_quota_per_minute
  );
end;
$$;
revoke all on function public.issue_platform_member_publishable_token(uuid,uuid,text,text[],timestamptz,integer) from public,anon,authenticated;
grant execute on function public.issue_platform_member_publishable_token(uuid,uuid,text,text[],timestamptz,integer) to service_role;

create or replace function public.issue_platform_member_api_key(
  p_user_id uuid,
  p_partner_id uuid,
  p_label text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_active integer;
begin
  v_role:=public.platform_partner_member_role(p_user_id,p_partner_id);
  if v_role is null then raise exception 'Partner membership required'; end if;

  select count(*) into v_active
  from public.platform_api_keys k
  where k.partner_id=p_partner_id
    and k.credential_type='secret'
    and k.revoked_at is null
    and (k.expires_at is null or k.expires_at>now());

  if v_active>=5 then raise exception 'Partner API key limit reached'; end if;
  if p_expires_at is not null and (p_expires_at<=now() or p_expires_at>now()+interval '2 years') then
    raise exception 'API key expiration is invalid';
  end if;

  return public.issue_platform_api_key(
    p_partner_id,
    coalesce(nullif(trim(p_label),''),'Integration key'),
    array['recommendations:read']::text[],
    p_expires_at
  );
end;
$$;
revoke all on function public.issue_platform_member_api_key(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.issue_platform_member_api_key(uuid,uuid,text,timestamptz) to service_role;

create or replace function public.authorize_platform_request(
  p_raw_key text,
  p_route text,
  p_request_id uuid,
  p_origin text
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
  v_key_minute_count integer:=0;
  v_origin text:=public.normalize_platform_origin(p_origin);
  v_required_scope text:='recommendations:read';
begin
  if nullif(trim(coalesce(p_raw_key,'')),'') is null then
    return jsonb_build_object('authorized',false,'reason','missing_key','request_id',p_request_id);
  end if;

  select * into v_key
  from public.platform_api_keys k
  where k.secret_hash=encode(extensions.digest(p_raw_key,'sha256'),'hex')
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

  if v_key.credential_type='publishable' then
    if v_origin is null then
      return jsonb_build_object('authorized',false,'reason','origin_required','request_id',p_request_id);
    end if;
    if not (v_origin=any(coalesce(v_key.allowed_origins,'{}'::text[]))) then
      return jsonb_build_object('authorized',false,'reason','origin_not_allowed','request_id',p_request_id);
    end if;
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

  if v_key.credential_type='publishable' then
    select coalesce(request_count,0) into v_key_minute_count
    from public.platform_api_key_rate_buckets
    where api_key_id=v_key.id and bucket_start=v_bucket;

    if coalesce(v_key_minute_count,0)>=coalesce(v_key.credential_quota_per_minute,30) then
      return jsonb_build_object(
        'authorized',false,'reason','credential_minute_quota_exceeded','request_id',p_request_id,
        'retry_after_seconds',greatest(1,60-extract(second from now())::integer)
      );
    end if;
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

  if v_key.credential_type='publishable' then
    insert into public.platform_api_key_rate_buckets(api_key_id,bucket_start,request_count,updated_at)
    values(v_key.id,v_bucket,1,now())
    on conflict(api_key_id,bucket_start) do update
    set request_count=public.platform_api_key_rate_buckets.request_count+1,updated_at=now()
    returning request_count into v_key_minute_count;
  end if;

  update public.platform_api_keys set last_used_at=now() where id=v_key.id;

  return jsonb_build_object(
    'authorized',true,
    'request_id',p_request_id,
    'partner_id',v_partner.id,
    'partner_slug',v_partner.slug,
    'plan',v_partner.plan,
    'api_key_id',v_key.id,
    'credential_type',v_key.credential_type,
    'scopes',to_jsonb(v_key.scopes),
    'minute_limit',v_partner.quota_per_minute,
    'minute_remaining',greatest(0,v_partner.quota_per_minute-v_minute_count),
    'month_limit',v_partner.quota_per_month,
    'month_remaining',greatest(0,v_partner.quota_per_month-v_month_count),
    'credential_minute_limit',case when v_key.credential_type='publishable' then v_key.credential_quota_per_minute else null end,
    'credential_minute_remaining',case
      when v_key.credential_type='publishable'
      then greatest(0,coalesce(v_key.credential_quota_per_minute,30)-v_key_minute_count)
      else null
    end
  );
end;
$$;
revoke all on function public.authorize_platform_request(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_platform_request(text,text,uuid,text) to service_role;

create or replace function public.authorize_platform_request(
  p_raw_key text,
  p_route text,
  p_request_id uuid default gen_random_uuid()
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select public.authorize_platform_request(p_raw_key,p_route,p_request_id,null)
$$;
revoke all on function public.authorize_platform_request(text,text,uuid) from public,anon,authenticated;
grant execute on function public.authorize_platform_request(text,text,uuid) to service_role;

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
      'credential_type',k.credential_type,'allowed_origins',k.allowed_origins,
      'credential_quota_per_minute',k.credential_quota_per_minute,
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
declare
  v_partner_deleted bigint:=0;
  v_key_deleted bigint:=0;
begin
  delete from public.platform_api_rate_buckets where bucket_start<now()-interval '2 days';
  get diagnostics v_partner_deleted=row_count;

  delete from public.platform_api_key_rate_buckets where bucket_start<now()-interval '2 days';
  get diagnostics v_key_deleted=row_count;

  return v_partner_deleted+v_key_deleted;
end;
$$;
revoke all on function public.cleanup_platform_rate_buckets() from public,anon,authenticated;
grant execute on function public.cleanup_platform_rate_buckets() to service_role;
