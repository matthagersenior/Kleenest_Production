-- KleenestOS owner control plane for Developer Platform partner products.
-- Existing partners retain current route access; bundles become enforceable when assigned/customized.

create table if not exists public.platform_product_bundles(
  bundle_key text primary key,
  label text not null,
  description text not null,
  plan text not null check(plan in ('developer','growth','fleet','enterprise')),
  scopes text[] not null default array['recommendations:read']::text[],
  api_products text[] not null default '{}'::text[],
  integration_surfaces text[] not null default '{}'::text[],
  default_quota_per_minute integer not null check(default_quota_per_minute between 1 and 100000),
  default_quota_per_month bigint not null check(default_quota_per_month between 1 and 1000000000),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_partner_product_access(
  partner_id uuid primary key references public.platform_partners(id) on delete cascade,
  bundle_key text references public.platform_product_bundles(bundle_key) on delete set null,
  api_products text[] not null default array['nearby','route','place_details','place_match']::text[],
  integration_surfaces text[] not null default array['rest','sdk','widget','map','route_sdk','webhooks','mcp']::text[],
  scopes text[] not null default array['recommendations:read','platform:read']::text[],
  pilot_session_id uuid references public.capability_pilot_sessions(id) on delete set null,
  owner_notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_partner_control_log(
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  action text not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  previous_state jsonb,
  next_state jsonb,
  created_at timestamptz not null default now()
);
create index if not exists platform_partner_control_log_partner_idx
  on public.platform_partner_control_log(partner_id,created_at desc);

alter table public.platform_product_bundles enable row level security;
alter table public.platform_partner_product_access enable row level security;
alter table public.platform_partner_control_log enable row level security;
revoke all on table public.platform_product_bundles from public,anon,authenticated;
revoke all on table public.platform_partner_product_access from public,anon,authenticated;
revoke all on table public.platform_partner_control_log from public,anon,authenticated;
grant select,insert,update,delete on table public.platform_product_bundles to service_role;
grant select,insert,update,delete on table public.platform_partner_product_access to service_role;
grant select,insert on table public.platform_partner_control_log to service_role;

drop policy if exists platform_product_bundles_client_deny on public.platform_product_bundles;
create policy platform_product_bundles_client_deny on public.platform_product_bundles
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_partner_product_access_client_deny on public.platform_partner_product_access;
create policy platform_partner_product_access_client_deny on public.platform_partner_product_access
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_partner_control_log_client_deny on public.platform_partner_control_log;
create policy platform_partner_control_log_client_deny on public.platform_partner_control_log
  for all to anon,authenticated using(false) with check(false);

insert into public.platform_product_bundles(
  bundle_key,label,description,plan,scopes,api_products,integration_surfaces,
  default_quota_per_minute,default_quota_per_month,sort_order
) values
('starter_api','Starter API','Nearby restroom intelligence and canonical place details for simple server, web, widget and map integrations.','developer',
 array['recommendations:read']::text[],
 array['nearby','place_details']::text[],
 array['rest','sdk','widget','map']::text[],
 60,10000,10),
('route_intelligence','Route Intelligence','Nearby plus along-route restroom intelligence for route planning and next-stop experiences.','developer',
 array['recommendations:read']::text[],
 array['nearby','route','place_details']::text[],
 array['rest','sdk','widget','map','route_sdk']::text[],
 120,50000,20),
('place_intelligence','Place Intelligence','Canonical place details and deterministic external-place matching with Kleenest location intelligence.','growth',
 array['recommendations:read','platform:read']::text[],
 array['nearby','place_details','place_match']::text[],
 array['rest','sdk','map','webhooks','mcp']::text[],
 120,100000,30),
('fleet_integration','Fleet Integration','Route, place and matching intelligence with webhooks and AI integration for mobile-workforce products.','fleet',
 array['recommendations:read','platform:read']::text[],
 array['nearby','route','place_details','place_match']::text[],
 array['rest','sdk','map','route_sdk','webhooks','mcp']::text[],
 240,500000,40),
('enterprise_data','Enterprise Data','Full current Developer Platform surface with high-volume quotas and all supported integration modes.','enterprise',
 array['recommendations:read','platform:read']::text[],
 array['nearby','route','place_details','place_match']::text[],
 array['rest','sdk','widget','map','route_sdk','webhooks','mcp']::text[],
 600,2000000,50)
on conflict(bundle_key) do update set
  label=excluded.label,description=excluded.description,plan=excluded.plan,scopes=excluded.scopes,
  api_products=excluded.api_products,integration_surfaces=excluded.integration_surfaces,
  default_quota_per_minute=excluded.default_quota_per_minute,
  default_quota_per_month=excluded.default_quota_per_month,
  sort_order=excluded.sort_order,active=true,updated_at=now();

-- Preserve all current route access for existing partners until an owner assigns/customizes a bundle.
insert into public.platform_partner_product_access(partner_id,api_products,integration_surfaces,scopes)
select p.id,
  array['nearby','route','place_details','place_match']::text[],
  array['rest','sdk','widget','map','route_sdk','webhooks','mcp']::text[],
  array['recommendations:read','platform:read']::text[]
from public.platform_partners p
on conflict(partner_id) do nothing;

create or replace function public.platform_partner_product_enabled(p_partner_id uuid,p_product text)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select case
    when not exists(select 1 from public.platform_partner_product_access a where a.partner_id=p_partner_id)
      then true
    else coalesce(trim(p_product),'')=any(
      coalesce((select a.api_products from public.platform_partner_product_access a where a.partner_id=p_partner_id),'{}'::text[])
    )
  end
$function$;
revoke all on function public.platform_partner_product_enabled(uuid,text) from public,anon,authenticated;
grant execute on function public.platform_partner_product_enabled(uuid,text) to service_role;

create or replace function public.apply_platform_product_bundle(
  p_partner_id uuid,
  p_bundle_key text,
  p_reason text default 'Platform bundle applied'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bundle public.platform_product_bundles;
  v_before jsonb;
  v_after jsonb;
begin
  select * into v_bundle from public.platform_product_bundles
  where bundle_key=p_bundle_key and active;
  if v_bundle.bundle_key is null then raise exception 'Unknown or inactive platform product bundle'; end if;
  if not exists(select 1 from public.platform_partners p where p.id=p_partner_id) then raise exception 'Partner not found'; end if;

  select jsonb_build_object(
    'partner',(select to_jsonb(p)-'metadata' from public.platform_partners p where p.id=p_partner_id),
    'access',(select to_jsonb(a) from public.platform_partner_product_access a where a.partner_id=p_partner_id)
  ) into v_before;

  update public.platform_partners
  set plan=v_bundle.plan,
      quota_per_minute=v_bundle.default_quota_per_minute,
      quota_per_month=v_bundle.default_quota_per_month,
      updated_at=now()
  where id=p_partner_id;

  insert into public.platform_partner_product_access(
    partner_id,bundle_key,api_products,integration_surfaces,scopes,updated_by,updated_at
  ) values(
    p_partner_id,v_bundle.bundle_key,v_bundle.api_products,v_bundle.integration_surfaces,v_bundle.scopes,auth.uid(),now()
  )
  on conflict(partner_id) do update set
    bundle_key=excluded.bundle_key,
    api_products=excluded.api_products,
    integration_surfaces=excluded.integration_surfaces,
    scopes=excluded.scopes,
    updated_by=excluded.updated_by,
    updated_at=now();

  select jsonb_build_object(
    'partner',(select to_jsonb(p)-'metadata' from public.platform_partners p where p.id=p_partner_id),
    'access',(select to_jsonb(a) from public.platform_partner_product_access a where a.partner_id=p_partner_id)
  ) into v_after;

  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,previous_state,next_state)
  values(p_partner_id,'apply_bundle',auth.uid(),nullif(trim(p_reason),''),v_before,v_after);
  return v_after;
end;
$function$;
revoke all on function public.apply_platform_product_bundle(uuid,text,text) from public,anon,authenticated;
grant execute on function public.apply_platform_product_bundle(uuid,text,text) to service_role;

create or replace function public.create_platform_partner_with_bundle(
  p_slug text,
  p_name text,
  p_bundle_key text default 'starter_api'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_bundle public.platform_product_bundles; v_id uuid;
begin
  select * into v_bundle from public.platform_product_bundles
  where bundle_key=p_bundle_key and active;
  if v_bundle.bundle_key is null then raise exception 'Unknown or inactive platform product bundle'; end if;
  v_id:=public.create_platform_partner(
    p_slug,p_name,v_bundle.plan,v_bundle.default_quota_per_minute,v_bundle.default_quota_per_month
  );
  perform public.apply_platform_product_bundle(v_id,p_bundle_key,'Partner created with bundle');
  return v_id;
end;
$function$;
revoke all on function public.create_platform_partner_with_bundle(text,text,text) from public,anon,authenticated;
grant execute on function public.create_platform_partner_with_bundle(text,text,text) to service_role;

create or replace function public.platform_partner_summary(p_partner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
select jsonb_build_object(
  'partner',(
    select to_jsonb(p)-'metadata'
    from public.platform_partners p where p.id=p_partner_id
  ),
  'product_access',(
    select jsonb_build_object(
      'bundle_key',a.bundle_key,'bundle_label',b.label,'api_products',a.api_products,
      'integration_surfaces',a.integration_surfaces,'scopes',a.scopes,
      'pilot_session_id',a.pilot_session_id,'owner_notes',a.owner_notes,'updated_at',a.updated_at
    )
    from public.platform_partner_product_access a
    left join public.platform_product_bundles b on b.bundle_key=a.bundle_key
    where a.partner_id=p_partner_id
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
$function$;
revoke all on function public.platform_partner_summary(uuid) from public,anon,authenticated;
grant execute on function public.platform_partner_summary(uuid) to service_role;

-- Route authorization now enforces the owner-configured API product without breaking legacy scopes.
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
as $function$
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
  v_required_product text;
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

  v_required_product:=case
    when p_route='/v1/recommendations/nearby' then 'nearby'
    when p_route='/v1/recommendations/route' then 'route'
    when p_route='/v1/places/match' then 'place_match'
    when p_route like '/v1/places/%' then 'place_details'
    else null
  end;

  -- Keep current v1 places routes compatible with recommendation keys.
  v_required_scope:=case
    when p_route like '/v1/recommendations/%' or p_route like '/v1/places/%' then 'recommendations:read'
    else 'platform:read'
  end;

  if not ('*'=any(v_key.scopes) or v_required_scope=any(v_key.scopes)) then
    return jsonb_build_object('authorized',false,'reason','insufficient_scope','request_id',p_request_id);
  end if;

  if v_required_product is not null and not public.platform_partner_product_enabled(v_partner.id,v_required_product) then
    return jsonb_build_object(
      'authorized',false,'reason','product_not_enabled','request_id',p_request_id,'required_product',v_required_product
    );
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
    'authorized',true,'request_id',p_request_id,'partner_id',v_partner.id,'partner_slug',v_partner.slug,
    'plan',v_partner.plan,'api_key_id',v_key.id,'credential_type',v_key.credential_type,'scopes',to_jsonb(v_key.scopes),
    'product_access',(select to_jsonb(a.api_products) from public.platform_partner_product_access a where a.partner_id=v_partner.id),
    'minute_limit',v_partner.quota_per_minute,'minute_remaining',greatest(0,v_partner.quota_per_minute-v_minute_count),
    'month_limit',v_partner.quota_per_month,'month_remaining',greatest(0,v_partner.quota_per_month-v_month_count),
    'credential_minute_limit',case when v_key.credential_type='publishable' then v_key.credential_quota_per_minute else null end,
    'credential_minute_remaining',case when v_key.credential_type='publishable'
      then greatest(0,coalesce(v_key.credential_quota_per_minute,30)-v_key_minute_count) else null end
  );
end;
$function$;
revoke all on function public.authorize_platform_request(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_platform_request(text,text,uuid,text) to service_role;

create or replace function public.owner_platform_product_bundles()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.sort_order,b.label),'[]'::jsonb)
  into v_result from public.platform_product_bundles b where b.active;
  return v_result;
end;
$function$;

create or replace function public.owner_platform_partner_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'slug',p.slug,'name',p.name,'status',p.status,'plan',p.plan,
    'quota_per_minute',p.quota_per_minute,'quota_per_month',p.quota_per_month,
    'bundle_key',a.bundle_key,'bundle_label',b.label,'api_products',coalesce(a.api_products,'{}'::text[]),
    'pilot_session_id',a.pilot_session_id,'owner_notes',a.owner_notes,
    'member_count',(select count(*) from public.platform_partner_members m where m.partner_id=p.id),
    'active_key_count',(select count(*) from public.platform_api_keys k where k.partner_id=p.id and k.revoked_at is null and (k.expires_at is null or k.expires_at>now())),
    'active_webhook_count',(select count(*) from public.platform_webhook_endpoints w where w.partner_id=p.id and w.active),
    'month_requests',coalesce((select u.request_count from public.platform_api_usage_monthly u where u.partner_id=p.id and u.month_start=date_trunc('month',current_date)::date),0),
    'updated_at',p.updated_at
  ) order by p.name,p.created_at),'[]'::jsonb)
  into v_result
  from public.platform_partners p
  left join public.platform_partner_product_access a on a.partner_id=p.id
  left join public.platform_product_bundles b on b.bundle_key=a.bundle_key;
  return v_result;
end;
$function$;

create or replace function public.owner_platform_partner_detail(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if not exists(select 1 from public.platform_partners p where p.id=p_partner_id) then raise exception 'Partner not found'; end if;

  select public.platform_partner_summary(p_partner_id) || jsonb_build_object(
    'members',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',m.user_id,'email',u.email,'role',m.role,'joined_at',m.created_at
      ) order by m.created_at,u.email)
      from public.platform_partner_members m
      left join auth.users u on u.id=m.user_id
      where m.partner_id=p_partner_id
    ),'[]'::jsonb),
    'control_log',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select l.id,l.action,l.changed_by,l.reason,l.previous_state,l.next_state,l.created_at
        from public.platform_partner_control_log l where l.partner_id=p_partner_id
        order by l.created_at desc limit 100
      ) x
    ),'[]'::jsonb),
    'bundles',coalesce((
      select jsonb_agg(to_jsonb(b) order by b.sort_order,b.label)
      from public.platform_product_bundles b where b.active
    ),'[]'::jsonb),
    'available_pilots',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'offer_key',s.offer_key,'organization_name',s.organization_name,'status',s.status
      ) order by s.created_at desc)
      from public.capability_pilot_sessions s
      where s.status in ('draft','active','paused')
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.owner_create_platform_partner(
  p_slug text,
  p_name text,
  p_bundle_key text default 'starter_api',
  p_pilot_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_bundle public.platform_product_bundles; v_id uuid;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select * into v_bundle from public.platform_product_bundles where bundle_key=p_bundle_key and active;
  if v_bundle.bundle_key is null then raise exception 'Unknown or inactive platform product bundle'; end if;
  if p_pilot_session_id is not null and not exists(select 1 from public.capability_pilot_sessions s where s.id=p_pilot_session_id) then
    raise exception 'Pilot session not found';
  end if;
  v_id:=public.create_platform_partner_with_bundle(p_slug,p_name,p_bundle_key);
  update public.platform_partner_product_access set pilot_session_id=p_pilot_session_id,updated_by=auth.uid(),updated_at=now() where partner_id=v_id;
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,next_state)
  values(v_id,'create_partner',auth.uid(),'Created in KleenestOS',public.platform_partner_summary(v_id));
  return v_id;
end;
$function$;

create or replace function public.owner_update_platform_partner(
  p_partner_id uuid,
  p_patch jsonb,
  p_reason text default 'KleenestOS partner update'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
  v_before jsonb;
  v_after jsonb;
  v_products text[];
  v_surfaces text[];
  v_scopes text[];
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if not exists(select 1 from public.platform_partners p where p.id=p_partner_id) then raise exception 'Partner not found'; end if;
  if exists(select 1 from jsonb_object_keys(v_patch) k where k not in (
    'name','status','plan','quota_per_minute','quota_per_month','api_products','integration_surfaces','scopes','pilot_session_id','owner_notes'
  )) then raise exception 'unsupported partner control field'; end if;
  if v_patch?'status' and v_patch->>'status' not in ('active','suspended','closed') then raise exception 'invalid partner status'; end if;
  if v_patch?'plan' and v_patch->>'plan' not in ('developer','growth','fleet','enterprise') then raise exception 'invalid partner plan'; end if;

  select public.platform_partner_summary(p_partner_id) into v_before;

  if v_patch?'api_products' then
    select coalesce(array_agg(value),'{}'::text[]) into v_products from jsonb_array_elements_text(v_patch->'api_products') value;
    if exists(select 1 from unnest(v_products) x where x not in ('nearby','route','place_details','place_match')) then raise exception 'invalid API product'; end if;
  end if;
  if v_patch?'integration_surfaces' then
    select coalesce(array_agg(value),'{}'::text[]) into v_surfaces from jsonb_array_elements_text(v_patch->'integration_surfaces') value;
    if exists(select 1 from unnest(v_surfaces) x where x not in ('rest','sdk','widget','map','route_sdk','webhooks','mcp')) then raise exception 'invalid integration surface'; end if;
  end if;
  if v_patch?'scopes' then
    select coalesce(array_agg(value),'{}'::text[]) into v_scopes from jsonb_array_elements_text(v_patch->'scopes') value;
    if exists(select 1 from unnest(v_scopes) x where x not in ('recommendations:read','platform:read','*')) then raise exception 'invalid platform scope'; end if;
  end if;
  if v_patch?'pilot_session_id' and nullif(v_patch->>'pilot_session_id','') is not null
     and not exists(select 1 from public.capability_pilot_sessions s where s.id=(v_patch->>'pilot_session_id')::uuid) then
    raise exception 'Pilot session not found';
  end if;

  update public.platform_partners p set
    name=case when v_patch?'name' then trim(v_patch->>'name') else p.name end,
    status=case when v_patch?'status' then v_patch->>'status' else p.status end,
    plan=case when v_patch?'plan' then v_patch->>'plan' else p.plan end,
    quota_per_minute=case when v_patch?'quota_per_minute' then (v_patch->>'quota_per_minute')::integer else p.quota_per_minute end,
    quota_per_month=case when v_patch?'quota_per_month' then (v_patch->>'quota_per_month')::bigint else p.quota_per_month end,
    updated_at=now()
  where p.id=p_partner_id;

  insert into public.platform_partner_product_access(partner_id,updated_by)
  values(p_partner_id,auth.uid())
  on conflict(partner_id) do nothing;

  update public.platform_partner_product_access a set
    bundle_key=case when v_patch ?| array['api_products','integration_surfaces','scopes'] then null else a.bundle_key end,
    api_products=case when v_patch?'api_products' then v_products else a.api_products end,
    integration_surfaces=case when v_patch?'integration_surfaces' then v_surfaces else a.integration_surfaces end,
    scopes=case when v_patch?'scopes' then v_scopes else a.scopes end,
    pilot_session_id=case when v_patch?'pilot_session_id' then nullif(v_patch->>'pilot_session_id','')::uuid else a.pilot_session_id end,
    owner_notes=case when v_patch?'owner_notes' then nullif(trim(v_patch->>'owner_notes'),'') else a.owner_notes end,
    updated_by=auth.uid(),updated_at=now()
  where a.partner_id=p_partner_id;

  select public.platform_partner_summary(p_partner_id) into v_after;
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,previous_state,next_state)
  values(p_partner_id,'update_partner',auth.uid(),nullif(trim(p_reason),''),v_before,v_after);
  return v_after;
end;
$function$;

create or replace function public.owner_apply_platform_product_bundle(
  p_partner_id uuid,p_bundle_key text,p_reason text default 'KleenestOS bundle update'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  return public.apply_platform_product_bundle(p_partner_id,p_bundle_key,p_reason);
end;
$function$;

create or replace function public.owner_platform_partner_invite(
  p_partner_id uuid,p_email text,p_role text default 'developer',p_expires_at timestamptz default now()+interval '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  v_result:=public.create_platform_partner_invite(auth.uid(),p_partner_id,p_email,p_role,true,p_expires_at);
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,next_state)
  values(p_partner_id,'invite_member',auth.uid(),'Developer invitation created',v_result-'invite_token');
  return v_result;
end;
$function$;

create or replace function public.owner_update_platform_partner_member(
  p_partner_id uuid,p_user_id uuid,p_role text default null,p_reason text default 'KleenestOS team access update'
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select to_jsonb(m) into v_before from public.platform_partner_members m where m.partner_id=p_partner_id and m.user_id=p_user_id;
  if v_before is null then raise exception 'Partner member not found'; end if;
  if p_role is null then
    delete from public.platform_partner_members where partner_id=p_partner_id and user_id=p_user_id;
  else
    if p_role not in ('owner','admin','developer') then raise exception 'Invalid partner role'; end if;
    update public.platform_partner_members set role=p_role where partner_id=p_partner_id and user_id=p_user_id;
  end if;
  select to_jsonb(m) into v_after from public.platform_partner_members m where m.partner_id=p_partner_id and m.user_id=p_user_id;
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,previous_state,next_state)
  values(p_partner_id,'team_access',auth.uid(),nullif(trim(p_reason),''),v_before,v_after);
  return true;
end;
$function$;

create or replace function public.owner_issue_platform_api_key(
  p_partner_id uuid,p_label text,p_scopes text[] default null,p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_allowed text[]; v_scopes text[]; v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select a.scopes into v_allowed from public.platform_partner_product_access a where a.partner_id=p_partner_id;
  v_scopes:=coalesce(p_scopes,v_allowed,array['recommendations:read']::text[]);
  if not (v_scopes <@ coalesce(v_allowed,v_scopes)) then raise exception 'Requested scopes exceed partner access'; end if;
  v_result:=public.issue_platform_api_key(p_partner_id,p_label,v_scopes,p_expires_at);
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,next_state)
  values(p_partner_id,'issue_api_key',auth.uid(),'Server API key issued',v_result-'api_key');
  return v_result;
end;
$function$;

create or replace function public.owner_issue_platform_publishable_token(
  p_partner_id uuid,p_label text,p_allowed_origins text[],p_expires_at timestamptz default now()+interval '7 days',p_quota_per_minute integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  v_result:=public.issue_platform_publishable_token(p_partner_id,p_label,p_allowed_origins,p_expires_at,p_quota_per_minute);
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,next_state)
  values(p_partner_id,'issue_browser_token',auth.uid(),'Browser token issued',v_result-'client_token');
  return v_result;
end;
$function$;

create or replace function public.owner_revoke_platform_api_key(p_partner_id uuid,p_api_key_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare v_before jsonb; v_result boolean;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select to_jsonb(k)-'secret_hash' into v_before from public.platform_api_keys k where k.id=p_api_key_id and k.partner_id=p_partner_id;
  if v_before is null then raise exception 'API key not found for partner'; end if;
  v_result:=public.revoke_platform_api_key(p_api_key_id);
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,previous_state)
  values(p_partner_id,'revoke_api_key',auth.uid(),'Credential revoked',v_before);
  return v_result;
end;
$function$;

create or replace function public.owner_create_platform_webhook(
  p_partner_id uuid,p_url text,p_label text,p_event_types text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  v_result:=public.create_platform_webhook_endpoint(p_partner_id,p_url,p_label,p_event_types);
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,next_state)
  values(p_partner_id,'create_webhook',auth.uid(),'Webhook endpoint created',v_result-'signing_secret');
  return v_result;
end;
$function$;

create or replace function public.owner_disable_platform_webhook(p_partner_id uuid,p_endpoint_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare v_before jsonb; v_result boolean;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select to_jsonb(e)-'signing_secret_encrypted' into v_before from public.platform_webhook_endpoints e where e.id=p_endpoint_id and e.partner_id=p_partner_id;
  if v_before is null then raise exception 'Webhook not found for partner'; end if;
  v_result:=public.disable_platform_webhook_endpoint(p_endpoint_id);
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,previous_state)
  values(p_partner_id,'disable_webhook',auth.uid(),'Webhook disabled',v_before);
  return v_result;
end;
$function$;

create or replace function public.owner_set_platform_partner_billing(
  p_partner_id uuid,p_provider text,p_status text,p_plan_code text default null,
  p_external_customer_id text default null,p_external_subscription_id text default null,
  p_current_period_end timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select to_jsonb(b) into v_before from public.platform_partner_billing b where b.partner_id=p_partner_id;
  perform public.set_platform_partner_billing_state(
    p_partner_id,p_provider,p_status,p_plan_code,p_external_customer_id,p_external_subscription_id,p_current_period_end,'{}'::jsonb
  );
  select to_jsonb(b) into v_after from public.platform_partner_billing b where b.partner_id=p_partner_id;
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,previous_state,next_state)
  values(p_partner_id,'billing',auth.uid(),'Billing state updated',v_before,v_after);
  return true;
end;
$function$;

do $grant$
declare v_sig regprocedure;
begin
  foreach v_sig in array array[
    'public.owner_platform_product_bundles()'::regprocedure,
    'public.owner_platform_partner_directory()'::regprocedure,
    'public.owner_platform_partner_detail(uuid)'::regprocedure,
    'public.owner_create_platform_partner(text,text,text,uuid)'::regprocedure,
    'public.owner_update_platform_partner(uuid,jsonb,text)'::regprocedure,
    'public.owner_apply_platform_product_bundle(uuid,text,text)'::regprocedure,
    'public.owner_platform_partner_invite(uuid,text,text,timestamptz)'::regprocedure,
    'public.owner_update_platform_partner_member(uuid,uuid,text,text)'::regprocedure,
    'public.owner_issue_platform_api_key(uuid,text,text[],timestamptz)'::regprocedure,
    'public.owner_issue_platform_publishable_token(uuid,text,text[],timestamptz,integer)'::regprocedure,
    'public.owner_revoke_platform_api_key(uuid,uuid)'::regprocedure,
    'public.owner_create_platform_webhook(uuid,text,text,text[])'::regprocedure,
    'public.owner_disable_platform_webhook(uuid,uuid)'::regprocedure,
    'public.owner_set_platform_partner_billing(uuid,text,text,text,text,text,timestamptz)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon',v_sig);
    execute format('grant execute on function %s to authenticated,service_role',v_sig);
  end loop;
end
$grant$;
