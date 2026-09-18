
create schema if not exists internal;

create table if not exists public.owner_email_notification_settings (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  recipient_email text,
  timezone text not null default 'America/Chicago',
  daily_digest_hour smallint not null default 8 check (daily_digest_hour between 0 and 23),
  weekly_digest_dow smallint not null default 1 check (weekly_digest_dow between 0 and 6),
  weekly_digest_hour smallint not null default 8 check (weekly_digest_hour between 0 and 23),
  max_immediate_per_hour smallint not null default 6 check (max_immediate_per_hour between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_email_notification_rules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  source_key text not null check (source_key in (
    'security_access','data_integrity','ingestion_storage','automation_delivery',
    'moderation_safety','tasks','audits','owner_activity','business_network','economy_anomalies'
  )),
  category text not null,
  enabled boolean not null default true,
  cadence text not null default 'daily' check (cadence in ('immediate','hourly','daily','weekly')),
  severity_floor text not null default 'info' check (severity_floor in ('info','warning','critical')),
  noteworthy_immediate boolean not null default true,
  dedupe_window_minutes integer not null default 360 check (dedupe_window_minutes between 1 and 10080),
  max_per_digest integer not null default 50 check (max_per_digest between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, code),
  unique(owner_user_id, source_key)
);

create table if not exists public.owner_email_notification_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.owner_email_notification_rules(id) on delete set null,
  source_key text not null,
  category text not null,
  severity text not null check (severity in ('info','warning','critical')),
  noteworthy boolean not null default false,
  title text not null,
  reason text not null,
  body text,
  details jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  occurrences integer not null default 1,
  first_occurred_at timestamptz not null default now(),
  last_occurred_at timestamptz not null default now(),
  effective_cadence text not null check (effective_cadence in ('immediate','hourly','daily','weekly')),
  delivery_after timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','sending','sent','suppressed','failed')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_email_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  cadence text not null check (cadence in ('immediate','hourly','daily','weekly','test')),
  subject text not null,
  event_ids uuid[] not null default '{}',
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists owner_email_events_due_idx
  on public.owner_email_notification_events(status, delivery_after);
create index if not exists owner_email_events_owner_created_idx
  on public.owner_email_notification_events(owner_user_id, created_at desc);
create index if not exists owner_email_events_dedupe_idx
  on public.owner_email_notification_events(owner_user_id, source_key, dedupe_key, created_at desc);
create index if not exists owner_email_deliveries_owner_created_idx
  on public.owner_email_notification_deliveries(owner_user_id, created_at desc);

alter table public.owner_email_notification_settings enable row level security;
alter table public.owner_email_notification_rules enable row level security;
alter table public.owner_email_notification_events enable row level security;
alter table public.owner_email_notification_deliveries enable row level security;

revoke all on public.owner_email_notification_settings from public, anon, authenticated;
revoke all on public.owner_email_notification_rules from public, anon, authenticated;
revoke all on public.owner_email_notification_events from public, anon, authenticated;
revoke all on public.owner_email_notification_deliveries from public, anon, authenticated;
grant select,insert,update,delete on public.owner_email_notification_settings to service_role;
grant select,insert,update,delete on public.owner_email_notification_rules to service_role;
grant select,insert,update,delete on public.owner_email_notification_events to service_role;
grant select,insert,update,delete on public.owner_email_notification_deliveries to service_role;

create or replace function internal.owner_email_severity_rank(p_severity text)
returns integer
language sql
immutable
set search_path=''
as $$
  select case lower(coalesce(p_severity,'info'))
    when 'critical' then 3
    when 'warning' then 2
    else 1
  end
$$;

create or replace function internal.owner_email_next_delivery(
  p_cadence text,
  p_timezone text,
  p_daily_hour integer,
  p_weekly_dow integer,
  p_weekly_hour integer
)
returns timestamptz
language plpgsql
stable
set search_path=''
as $$
declare
  v_now timestamptz := now();
  v_local timestamp;
  v_target timestamp;
  v_days integer;
begin
  if p_cadence='immediate' then return v_now; end if;
  if p_cadence='hourly' then return date_trunc('hour',v_now)+interval '1 hour'; end if;
  v_local := timezone(p_timezone,v_now);
  if p_cadence='daily' then
    v_target := date_trunc('day',v_local)+make_interval(hours=>p_daily_hour);
    if v_target<=v_local then v_target:=v_target+interval '1 day'; end if;
    return v_target at time zone p_timezone;
  end if;
  v_days := ((p_weekly_dow-extract(dow from v_local)::integer)+7)%7;
  v_target := date_trunc('day',v_local)+make_interval(days=>v_days,hours=>p_weekly_hour);
  if v_target<=v_local then v_target:=v_target+interval '7 days'; end if;
  return v_target at time zone p_timezone;
end
$$;

create or replace function internal.ensure_owner_email_defaults(p_owner uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_email text;
begin
  select u.email into v_email from auth.users u where u.id=p_owner;

  insert into public.owner_email_notification_settings(owner_user_id,recipient_email)
  values(p_owner,v_email)
  on conflict(owner_user_id) do update
    set recipient_email=coalesce(public.owner_email_notification_settings.recipient_email,excluded.recipient_email);

  insert into public.owner_email_notification_rules
    (owner_user_id,code,name,description,source_key,category,enabled,cadence,severity_floor,noteworthy_immediate,dedupe_window_minutes,max_per_digest)
  values
    (p_owner,'security-access','Security & access','Owner/admin access and security-sensitive control changes.','security_access','Security',true,'immediate','warning',true,120,30),
    (p_owner,'data-integrity','Data integrity','Orphaned or contradictory canonical records.','data_integrity','Data',true,'immediate','warning',true,360,30),
    (p_owner,'ingestion-storage','Ingestion & storage','Storage guards, scheduler health and failed ingestion runs.','ingestion_storage','Operations',true,'immediate','warning',true,120,30),
    (p_owner,'automation-delivery','Automation & delivery','Reporting and notification-delivery failures.','automation_delivery','Delivery',true,'daily','info',true,360,50),
    (p_owner,'moderation-safety','Moderation & safety','Open moderation, safety and AI-response reports.','moderation_safety','Trust',true,'daily','info',true,360,50),
    (p_owner,'owner-tasks','Owner work queue','Beta incidents and other owner work waiting for action.','tasks','Tasks',true,'daily','info',true,360,50),
    (p_owner,'audits','Audits','Capability audits and governance findings. Routine results are weekly; findings break out immediately.','audits','Audit',true,'weekly','info',true,10080,100),
    (p_owner,'owner-activity','Owner activity','Material control-plane changes made by owners/admins.','owner_activity','Governance',true,'daily','info',false,360,100),
    (p_owner,'business-network','Business network','Pending business verification and network administration.','business_network','Business',true,'daily','info',true,720,50),
    (p_owner,'economy-anomalies','Economy anomalies','High-velocity or unusually large progression activity.','economy_anomalies','Economy',true,'daily','warning',true,720,50)
  on conflict(owner_user_id,source_key) do nothing;
end
$$;

create or replace function internal.owner_email_enqueue(
  p_owner uuid,
  p_source_key text,
  p_severity text,
  p_noteworthy boolean,
  p_title text,
  p_reason text,
  p_body text,
  p_details jsonb,
  p_dedupe_key text,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rule public.owner_email_notification_rules%rowtype;
  v_settings public.owner_email_notification_settings%rowtype;
  v_existing uuid;
  v_cadence text;
  v_delivery timestamptz;
  v_immediate_count integer;
  v_id uuid;
begin
  perform internal.ensure_owner_email_defaults(p_owner);

  select * into v_rule
  from public.owner_email_notification_rules
  where owner_user_id=p_owner and source_key=p_source_key and enabled
  limit 1;

  if v_rule.id is null then return null; end if;
  if internal.owner_email_severity_rank(p_severity) < internal.owner_email_severity_rank(v_rule.severity_floor) then
    return null;
  end if;

  select * into v_settings from public.owner_email_notification_settings where owner_user_id=p_owner;
  if not coalesce(v_settings.enabled,false) or nullif(trim(coalesce(v_settings.recipient_email,'')),'') is null then
    return null;
  end if;

  select e.id into v_existing
  from public.owner_email_notification_events e
  where e.owner_user_id=p_owner
    and e.source_key=p_source_key
    and e.dedupe_key=p_dedupe_key
    and e.created_at>=now()-make_interval(mins=>v_rule.dedupe_window_minutes)
    and e.status in ('queued','sending','sent','failed')
  order by e.created_at desc
  limit 1;

  if v_existing is not null then
    update public.owner_email_notification_events
      set occurrences=occurrences+1,
          last_occurred_at=greatest(last_occurred_at,p_occurred_at),
          severity=case when internal.owner_email_severity_rank(p_severity)>internal.owner_email_severity_rank(severity) then p_severity else severity end,
          noteworthy=noteworthy or coalesce(p_noteworthy,false),
          details=coalesce(details,'{}'::jsonb)||coalesce(p_details,'{}'::jsonb),
          updated_at=now()
    where id=v_existing;
    return v_existing;
  end if;

  v_cadence := v_rule.cadence;
  if coalesce(p_noteworthy,false) and v_rule.noteworthy_immediate and internal.owner_email_severity_rank(p_severity)>=2 then
    v_cadence:='immediate';
  end if;

  if v_cadence='immediate' then
    select count(*) into v_immediate_count
    from public.owner_email_notification_events
    where owner_user_id=p_owner
      and effective_cadence='immediate'
      and created_at>=now()-interval '1 hour'
      and status in ('queued','sending','sent');
    if v_immediate_count>=v_settings.max_immediate_per_hour then
      v_cadence:='hourly';
    end if;
  end if;

  v_delivery:=internal.owner_email_next_delivery(
    v_cadence,v_settings.timezone,v_settings.daily_digest_hour,
    v_settings.weekly_digest_dow,v_settings.weekly_digest_hour
  );

  insert into public.owner_email_notification_events(
    owner_user_id,rule_id,source_key,category,severity,noteworthy,title,reason,body,details,
    dedupe_key,first_occurred_at,last_occurred_at,effective_cadence,delivery_after
  ) values(
    p_owner,v_rule.id,p_source_key,v_rule.category,p_severity,coalesce(p_noteworthy,false),
    left(p_title,180),left(p_reason,1200),left(coalesce(p_body,''),4000),coalesce(p_details,'{}'::jsonb),
    left(p_dedupe_key,240),p_occurred_at,p_occurred_at,v_cadence,v_delivery
  ) returning id into v_id;

  return v_id;
end
$$;

create or replace function public.owner_email_notification_snapshot(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then
    raise exception 'Platform owner access required';
  end if;
  perform internal.ensure_owner_email_defaults(v_uid);
  return jsonb_build_object(
    'settings',(select to_jsonb(s) from public.owner_email_notification_settings s where s.owner_user_id=v_uid),
    'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.category,r.name) from public.owner_email_notification_rules r where r.owner_user_id=v_uid),'[]'::jsonb),
    'recent_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from public.owner_email_notification_events where owner_user_id=v_uid order by created_at desc limit v_limit) e),'[]'::jsonb),
    'recent_deliveries',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select * from public.owner_email_notification_deliveries where owner_user_id=v_uid order by created_at desc limit v_limit) d),'[]'::jsonb),
    'queue',jsonb_build_object(
      'queued',(select count(*) from public.owner_email_notification_events where owner_user_id=v_uid and status='queued'),
      'failed',(select count(*) from public.owner_email_notification_events where owner_user_id=v_uid and status='failed'),
      'sent_24h',(select count(*) from public.owner_email_notification_events where owner_user_id=v_uid and sent_at>=now()-interval '24 hours')
    ),
    'generated_at',now()
  );
end
$$;

create or replace function public.owner_update_email_notification_settings(p_settings jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_email text;
  v_timezone text;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  perform internal.ensure_owner_email_defaults(v_uid);
  select to_jsonb(s) into v_before from public.owner_email_notification_settings s where s.owner_user_id=v_uid;

  v_email:=coalesce(nullif(trim(p_settings->>'recipient_email'),''),v_before->>'recipient_email');
  if v_email is null or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid recipient email is required'; end if;
  v_timezone:=coalesce(nullif(trim(p_settings->>'timezone'),''),v_before->>'timezone');
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then raise exception 'Invalid timezone'; end if;

  update public.owner_email_notification_settings
  set enabled=coalesce((p_settings->>'enabled')::boolean,enabled),
      recipient_email=v_email,
      timezone=v_timezone,
      daily_digest_hour=least(greatest(coalesce((p_settings->>'daily_digest_hour')::integer,daily_digest_hour),0),23),
      weekly_digest_dow=least(greatest(coalesce((p_settings->>'weekly_digest_dow')::integer,weekly_digest_dow),0),6),
      weekly_digest_hour=least(greatest(coalesce((p_settings->>'weekly_digest_hour')::integer,weekly_digest_hour),0),23),
      max_immediate_per_hour=least(greatest(coalesce((p_settings->>'max_immediate_per_hour')::integer,max_immediate_per_hour),1),50),
      updated_at=now()
  where owner_user_id=v_uid
  returning to_jsonb(public.owner_email_notification_settings.*) into v_after;

  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
  values(v_uid,'owner_email_notifications','update_settings',v_uid::text,coalesce(v_before,'{}'::jsonb),v_after,p_reason);

  return v_after;
end
$$;

create or replace function public.owner_upsert_email_notification_rule(p_rule jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_before jsonb:='{}'::jsonb;
  v_after jsonb;
  v_source text:=lower(trim(coalesce(p_rule->>'source_key','')));
  v_code text:=lower(trim(coalesce(p_rule->>'code',v_source)));
  v_name text:=trim(coalesce(p_rule->>'name',''));
  v_cadence text:=lower(coalesce(p_rule->>'cadence','daily'));
  v_floor text:=lower(coalesce(p_rule->>'severity_floor','info'));
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  perform internal.ensure_owner_email_defaults(v_uid);
  if v_source not in ('security_access','data_integrity','ingestion_storage','automation_delivery','moderation_safety','tasks','audits','owner_activity','business_network','economy_anomalies') then raise exception 'Invalid owner email source'; end if;
  if v_code='' or v_code !~ '^[a-z0-9][a-z0-9._-]{1,79}$' then raise exception 'Rule code must be 2-80 safe characters'; end if;
  if v_name='' or length(v_name)>120 then raise exception 'Rule name is required and must be <=120 characters'; end if;
  if v_cadence not in ('immediate','hourly','daily','weekly') then raise exception 'Invalid cadence'; end if;
  if v_floor not in ('info','warning','critical') then raise exception 'Invalid severity floor'; end if;

  if nullif(p_rule->>'id','') is not null then
    v_id:=(p_rule->>'id')::uuid;
    select to_jsonb(r) into v_before from public.owner_email_notification_rules r where r.id=v_id and r.owner_user_id=v_uid;
    if v_before is null then raise exception 'Owner email rule not found'; end if;
    update public.owner_email_notification_rules
    set code=v_code,name=v_name,description=nullif(trim(coalesce(p_rule->>'description',description)),''),
        source_key=v_source,category=left(trim(coalesce(p_rule->>'category',category)),80),
        enabled=coalesce((p_rule->>'enabled')::boolean,enabled),cadence=v_cadence,severity_floor=v_floor,
        noteworthy_immediate=coalesce((p_rule->>'noteworthy_immediate')::boolean,noteworthy_immediate),
        dedupe_window_minutes=least(greatest(coalesce((p_rule->>'dedupe_window_minutes')::integer,dedupe_window_minutes),1),10080),
        max_per_digest=least(greatest(coalesce((p_rule->>'max_per_digest')::integer,max_per_digest),1),200),
        updated_at=now()
    where id=v_id and owner_user_id=v_uid
    returning to_jsonb(public.owner_email_notification_rules.*) into v_after;
  else
    insert into public.owner_email_notification_rules(owner_user_id,code,name,description,source_key,category,enabled,cadence,severity_floor,noteworthy_immediate,dedupe_window_minutes,max_per_digest)
    values(v_uid,v_code,v_name,nullif(trim(coalesce(p_rule->>'description','')),''),v_source,left(trim(coalesce(p_rule->>'category','Owner')),80),
      coalesce((p_rule->>'enabled')::boolean,true),v_cadence,v_floor,coalesce((p_rule->>'noteworthy_immediate')::boolean,true),
      least(greatest(coalesce((p_rule->>'dedupe_window_minutes')::integer,360),1),10080),
      least(greatest(coalesce((p_rule->>'max_per_digest')::integer,50),1),200))
    returning to_jsonb(public.owner_email_notification_rules.*),id into v_after,v_id;
  end if;

  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
  values(v_uid,'owner_email_notifications','upsert_rule',v_code,coalesce(v_before,'{}'::jsonb),v_after,p_reason);
  return v_after;
end
$$;

create or replace function public.owner_delete_email_notification_rule(p_rule_id uuid,p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_before jsonb; v_code text;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  select to_jsonb(r),r.code into v_before,v_code from public.owner_email_notification_rules r where r.id=p_rule_id and r.owner_user_id=v_uid;
  if v_before is null then return false; end if;
  delete from public.owner_email_notification_rules where id=p_rule_id and owner_user_id=v_uid;
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
  values(v_uid,'owner_email_notifications','delete_rule',v_code,v_before,'{}'::jsonb,p_reason);
  return true;
end
$$;

create or replace function public.owner_queue_test_email_notification()
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_id uuid; v_settings public.owner_email_notification_settings%rowtype;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  perform internal.ensure_owner_email_defaults(v_uid);
  select * into v_settings from public.owner_email_notification_settings where owner_user_id=v_uid;
  if not v_settings.enabled then raise exception 'Owner email notifications are disabled'; end if;
  if nullif(trim(coalesce(v_settings.recipient_email,'')),'') is null then raise exception 'Recipient email is not configured'; end if;
  insert into public.owner_email_notification_events(
    owner_user_id,source_key,category,severity,noteworthy,title,reason,body,details,dedupe_key,effective_cadence,delivery_after
  ) values(
    v_uid,'owner_activity','Test','info',true,'Kleenest Owner email test',
    'You requested a test from the Owner Email Notification Center.',
    'This confirms the Owner operational email path can generate a reasoned notification.',
    jsonb_build_object('test',true),'test:'||gen_random_uuid()::text,'immediate',now()
  ) returning id into v_id;
  return v_id;
end
$$;

create or replace function public.owner_email_worker_authorized(p_secret text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_expected text;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then return false; end if;
  select decrypted_secret into v_expected from vault.decrypted_secrets where name='owner_email_worker_secret' limit 1;
  return v_expected is not null and p_secret is not null and v_expected=p_secret;
end
$$;

create or replace function public.owner_email_collect_signals()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_owner uuid;
  v_storage jsonb;
  v_audit public.capability_audit_runs%rowtype;
  v_count bigint;
  v_fail bigint;
  v_expired bigint;
  v_pending_reviews bigint;
  v_open_safety bigint;
  v_open_ai bigint;
  v_pending_business bigint;
  v_tasks bigint;
  v_anomalies bigint;
  v_activity bigint;
  v_scheduler_active boolean:=true;
  v_row record;
  v_enqueued integer:=0;
  v_id uuid;
  v_today text:=to_char(now() at time zone 'UTC','YYYY-MM-DD');
  v_week text:=to_char(now() at time zone 'UTC','IYYY-IW');
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required'; end if;

  if not exists(select 1 from public.capability_audit_runs where source='scheduled' and executed_at>=now()-interval '24 hours') then
    select * into v_audit from public.run_capability_audit('scheduled');
  else
    select * into v_audit from public.capability_audit_runs order by executed_at desc limit 1;
  end if;

  select public.national_ingestion_storage_status() into v_storage;
  begin
    select coalesce(j.active,false) into v_scheduler_active from cron.job j where j.jobname='kleenest-national-ingestion' limit 1;
    if not found then v_scheduler_active:=false; end if;
  exception when others then
    v_scheduler_active:=true;
  end;

  select count(*) into v_pending_reviews from public.review_reports where status='pending';
  select count(*) into v_open_safety from public.user_safety_reports where status in ('open','reviewing');
  select count(*) into v_open_ai from public.ai_response_reports where status in ('open','reviewing');
  select count(*) into v_pending_business from public.businesses where verification_status='pending' and not is_demo_test;
  select count(*) into v_tasks from public.beta_report_events where owner_status in ('new','open');
  select count(*) into v_anomalies from (
    select user_id from public.progression_events_v2
    where status='awarded' and created_at>=now()-interval '24 hours'
    group by user_id having count(*)>=50 or sum(xp_awarded)>=5000
  ) q;

  for v_owner in
    select p.id from public.profiles p where coalesce(p.is_platform_owner,false)
  loop
    perform internal.ensure_owner_email_defaults(v_owner);

    for v_row in
      select * from (
        select 'orphan_business_members'::text issue_code,count(*)::bigint issue_count,'critical'::text severity from public.business_members bm left join public.businesses b on b.id=bm.business_id where b.id is null
        union all select 'orphan_business_locations',count(*)::bigint,'critical' from public.locations l left join public.businesses b on b.id=l.business_id where l.business_id is not null and b.id is null
        union all select 'orphan_qr_locations',count(*)::bigint,'critical' from public.qr_codes q left join public.locations l on l.id=q.location_id where q.location_id is not null and l.id is null
        union all select 'orphan_enterprise_campaign_networks',count(*)::bigint,'critical' from public.enterprise_partner_campaigns c left join public.enterprise_partner_networks n on n.id=c.network_id where n.id is null
        union all select 'orphan_enterprise_network_members',count(*)::bigint,'critical' from public.enterprise_partner_network_members m left join public.enterprise_partner_networks n on n.id=m.network_id where n.id is null
        union all select 'orphan_notifications',count(*)::bigint,'warning' from public.notifications n left join public.profiles p on p.id=n.user_id where p.id is null
      ) x where issue_count>0
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'data_integrity',v_row.severity,true,
        'Data integrity issue: '||replace(v_row.issue_code,'_',' '),
        v_row.issue_count||' canonical record'||case when v_row.issue_count=1 then ' is' else 's are' end||' currently inconsistent.',
        'Open KleenestOS Operations to inspect the affected records.',
        jsonb_build_object('issue_code',v_row.issue_code,'issue_count',v_row.issue_count),
        'integrity:'||v_row.issue_code,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    if coalesce((v_storage->>'hard_stop')::boolean,false) or coalesce((v_storage->>'paused')::boolean,false) then
      v_id:=internal.owner_email_enqueue(v_owner,'ingestion_storage',
        case when coalesce((v_storage->>'hard_stop')::boolean,false) then 'critical' else 'warning' end,true,
        case when coalesce((v_storage->>'hard_stop')::boolean,false) then 'Ingestion storage hard stop' else 'Ingestion is paused' end,
        coalesce(v_storage->>'pause_reason','The storage guard paused ingestion.'),
        'Database observed: '||coalesce(v_storage->>'database_percent','?')||'%. Disk observed: '||coalesce(v_storage->>'disk_observed_percent','?')||'%.',
        v_storage,'storage:'||coalesce(v_storage->>'pause_reason','paused'),now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    if not v_scheduler_active then
      v_id:=internal.owner_email_enqueue(v_owner,'ingestion_storage','critical',true,
        'National ingestion scheduler is inactive',
        'The canonical pg_cron job kleenest-national-ingestion is missing or disabled.',
        'Ingestion may stop advancing even if existing runs finish.','{}'::jsonb,'scheduler:inactive',now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    for v_row in
      select id,source_key,status,error,started_at from public.national_ingestion_runs
      where started_at>=now()-interval '15 minutes' and status='failed'
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'ingestion_storage','warning',true,
        'Ingestion run failed: '||v_row.source_key,
        coalesce(v_row.error,'An ingestion run failed without a recorded error message.'),
        'The failure occurred in the last 15 minutes.',
        jsonb_build_object('run_id',v_row.id,'source_key',v_row.source_key),
        'ingestion-run:'||v_row.id::text,v_row.started_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    for v_row in
      select id,status,error,created_at from public.reporting_runs
      where created_at>=now()-interval '15 minutes' and lower(status) in ('failed','error')
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'automation_delivery','warning',true,
        'Reporting automation failed',
        coalesce(v_row.error,'A reporting run failed.'),
        'KleenestOS recorded a failed reporting run that may require attention.',
        jsonb_build_object('reporting_run_id',v_row.id),'reporting-run:'||v_row.id::text,v_row.created_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    select count(*) filter(where status='failed'),count(*) filter(where status='expired')
      into v_fail,v_expired
    from public.notification_native_push_deliveries
    where created_at>=now()-interval '24 hours';
    if coalesce(v_fail,0)+coalesce(v_expired,0)>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'automation_delivery',
        case when coalesce(v_fail,0)+coalesce(v_expired,0)>=25 then 'warning' else 'info' end,
        coalesce(v_fail,0)+coalesce(v_expired,0)>=25,
        'Notification delivery health needs review',
        (coalesce(v_fail,0)+coalesce(v_expired,0))||' native push deliver'||case when coalesce(v_fail,0)+coalesce(v_expired,0)=1 then 'y has' else 'ies have' end||' failed or expired in the last 24 hours.',
        'Routine delivery issues stay in the daily digest unless volume becomes material.',
        jsonb_build_object('failed',v_fail,'expired',v_expired),
        'native-push:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    if v_pending_reviews+v_open_safety+v_open_ai>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'moderation_safety','info',false,
        'Trust & safety queue update',
        (v_pending_reviews+v_open_safety+v_open_ai)||' moderation or safety item'||case when v_pending_reviews+v_open_safety+v_open_ai=1 then ' is' else 's are' end||' waiting for review.',
        'Review reports: '||v_pending_reviews||'. User safety: '||v_open_safety||'. AI response reports: '||v_open_ai||'.',
        jsonb_build_object('review_reports',v_pending_reviews,'user_safety',v_open_safety,'ai_reports',v_open_ai),
        'moderation:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    for v_row in
      select id,reason,details,created_at from public.user_safety_reports
      where created_at>=now()-interval '15 minutes' and status='open'
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'moderation_safety','warning',true,
        'New user safety report',
        coalesce(v_row.reason,'A user safety report was opened.'),
        coalesce(v_row.details,'Open Trust & Moderation for details.'),
        jsonb_build_object('report_id',v_row.id),'user-safety:'||v_row.id::text,v_row.created_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    if v_tasks>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'tasks','info',false,
        'Owner work queue update',
        v_tasks||' beta incident or owner task'||case when v_tasks=1 then ' is' else 's are' end||' waiting.',
        'Open the Owner app to review the active queue.',
        jsonb_build_object('open_items',v_tasks),'tasks:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    if v_audit.id is not null then
      v_id:=internal.owner_email_enqueue(v_owner,'audits',
        case when v_audit.issue_count>0 then 'warning' else 'info' end,
        v_audit.issue_count>0,
        case when v_audit.issue_count>0 then 'Audit found issues' else 'Weekly audit status' end,
        case when v_audit.issue_count>0 then v_audit.issue_count||' capability audit issue'||case when v_audit.issue_count=1 then ' was' else 's were' end||' found.' else 'No capability contract issues were found in the latest scheduled audit.' end,
        'Duplicate domains: '||v_audit.duplicate_domain_count||'. Uncovered RPCs: '||v_audit.uncovered_rpc_count||'.',
        jsonb_build_object('audit_run_id',v_audit.id,'issue_count',v_audit.issue_count,'duplicate_domain_count',v_audit.duplicate_domain_count,'uncovered_rpc_count',v_audit.uncovered_rpc_count),
        'audit-week:'||v_week,v_audit.executed_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    select count(*) into v_activity
    from public.platform_owner_control_audit
    where created_at>=now()-interval '24 hours' and domain<>'owner_email_notifications';
    if v_activity>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'owner_activity','info',false,
        'Owner control-plane activity',
        v_activity||' audited owner/admin control change'||case when v_activity=1 then ' occurred' else 's occurred' end||' in the last 24 hours.',
        'Routine administrative activity is grouped into the daily digest.',
        jsonb_build_object('changes_24h',v_activity),'owner-activity:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    for v_row in
      select id,domain,action,target_key,reason,created_at
      from public.platform_owner_control_audit
      where created_at>=now()-interval '15 minutes'
        and domain in ('access','people','auth','security','users')
        and (action ~* '(revoke|disable|delete|admin|owner|role|access|security)')
    loop
      v_id:=internal.owner_email_enqueue(v_owner,'security_access','warning',true,
        'Security/access control changed',
        coalesce(v_row.reason,v_row.domain||' · '||v_row.action),
        'Target: '||coalesce(v_row.target_key,'unspecified')||'.',
        jsonb_build_object('audit_id',v_row.id,'domain',v_row.domain,'action',v_row.action),
        'access-change:'||v_row.id::text,v_row.created_at);
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end loop;

    if v_pending_business>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'business_network','info',false,
        'Business network queue update',
        v_pending_business||' business verification item'||case when v_pending_business=1 then ' is' else 's are' end||' pending.',
        'Routine business administration stays in the daily digest.',
        jsonb_build_object('pending_businesses',v_pending_business),'business-network:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;

    if v_anomalies>0 then
      v_id:=internal.owner_email_enqueue(v_owner,'economy_anomalies','warning',true,
        'Progression economy anomaly detected',
        v_anomalies||' account'||case when v_anomalies=1 then ' has' else 's have' end||' unusually high XP/event velocity in the last 24 hours.',
        'Threshold: at least 50 awarded events or 5,000 XP in 24 hours.',
        jsonb_build_object('anomaly_accounts',v_anomalies),'economy-anomaly:'||v_today,now());
      if v_id is not null then v_enqueued:=v_enqueued+1; end if;
    end if;
  end loop;

  return jsonb_build_object('enqueued_or_updated',v_enqueued,'collected_at',now());
end
$$;

create or replace function public.owner_email_worker_claim_due(p_limit integer default 200)
returns setof public.owner_email_notification_events
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required'; end if;
  return query
  with due as (
    select e.id
    from public.owner_email_notification_events e
    join public.owner_email_notification_settings s on s.owner_user_id=e.owner_user_id
    where s.enabled
      and nullif(trim(coalesce(s.recipient_email,'')),'') is not null
      and e.status='queued'
      and e.delivery_after<=now()
    order by e.delivery_after,e.created_at
    for update of e skip locked
    limit least(greatest(coalesce(p_limit,200),1),500)
  )
  update public.owner_email_notification_events e
     set status='sending',attempts=e.attempts+1,last_attempt_at=now(),updated_at=now()
  from due
  where e.id=due.id
  returning e.*;
end
$$;

revoke all on function public.owner_email_worker_authorized(text) from public, anon, authenticated;
revoke all on function public.owner_email_collect_signals() from public, anon, authenticated;
revoke all on function public.owner_email_worker_claim_due(integer) from public, anon, authenticated;
grant execute on function public.owner_email_worker_authorized(text) to service_role;
grant execute on function public.owner_email_collect_signals() to service_role;
grant execute on function public.owner_email_worker_claim_due(integer) to service_role;

revoke all on function public.owner_email_notification_snapshot(integer) from public, anon;
revoke all on function public.owner_update_email_notification_settings(jsonb,text) from public, anon;
revoke all on function public.owner_upsert_email_notification_rule(jsonb,text) from public, anon;
revoke all on function public.owner_delete_email_notification_rule(uuid,text) from public, anon;
revoke all on function public.owner_queue_test_email_notification() from public, anon;
grant execute on function public.owner_email_notification_snapshot(integer) to authenticated;
grant execute on function public.owner_update_email_notification_settings(jsonb,text) to authenticated;
grant execute on function public.owner_upsert_email_notification_rule(jsonb,text) to authenticated;
grant execute on function public.owner_delete_email_notification_rule(uuid,text) to authenticated;
grant execute on function public.owner_queue_test_email_notification() to authenticated;

do $$
declare v_owner uuid;
begin
  for v_owner in select p.id from public.profiles p where coalesce(p.is_platform_owner,false)
  loop
    perform internal.ensure_owner_email_defaults(v_owner);
  end loop;
end $$;

do $$
begin
  if not exists(select 1 from vault.secrets where name='owner_email_worker_secret') then
    perform vault.create_secret(gen_random_uuid()::text,'owner_email_worker_secret','Kleenest Owner email scheduler credential');
  end if;
end $$;
