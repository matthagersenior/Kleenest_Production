-- Owner-operated Live Network notification + ingestion control plane.
-- OTA changes client capabilities; this migration keeps targeting, delivery, consent, and ingestion authority server-side.

alter table public.notification_preferences
  add column if not exists platform_updates boolean not null default true,
  add column if not exists progression boolean not null default true,
  add column if not exists offers boolean not null default true,
  add column if not exists sponsored boolean not null default false,
  add column if not exists location_alerts boolean not null default true,
  add column if not exists social boolean not null default true,
  add column if not exists personalized_ads boolean not null default false,
  add column if not exists location_based_offers boolean not null default false,
  add column if not exists quiet_hours_start time without time zone,
  add column if not exists quiet_hours_end time without time zone,
  add column if not exists ads_personalization_consent_at timestamptz,
  add column if not exists location_offers_consent_at timestamptz;

create table if not exists public.platform_owner_control_audit (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain in ('ingestion','notifications')),
  action text not null,
  target_key text,
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists platform_owner_control_audit_domain_created_idx
  on public.platform_owner_control_audit(domain,created_at desc);

create table if not exists public.platform_notification_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  enabled boolean not null default false,
  dry_run boolean not null default true,
  event_pattern text not null,
  match_mode text not null default 'exact' check (match_mode in ('exact','prefix')),
  notification_class text not null check (notification_class in ('platform','progression','incentive','sponsored','operational','intelligence','social','location')),
  audience_scope text not null default 'actor' check (audience_scope in ('actor','all_users','nearby','business_members','fleet_members','enterprise_members','followers')),
  app_targets text[] not null default array['consumer']::text[],
  channels text[] not null default array['in_app','realtime','push']::text[],
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  radius_meters integer not null default 5000 check (radius_meters between 1 and 50000),
  frequency_cap_count integer not null default 1 check (frequency_cap_count between 1 and 100),
  frequency_cap_window_minutes integer not null default 120 check (frequency_cap_window_minutes between 1 and 10080),
  starts_at timestamptz,
  ends_at timestamptz,
  title_template text not null,
  body_template text not null,
  deep_link text,
  image_url text,
  targeting jsonb not null default '{}'::jsonb,
  incentive jsonb not null default '{}'::jsonb,
  attribution jsonb not null default '{}'::jsonb,
  sponsored_message boolean not null default false,
  personalized boolean not null default false,
  location_targeted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_notification_rule_app_targets_check check (
    cardinality(app_targets) > 0 and app_targets <@ array['consumer','business','fleet','kleenestos']::text[]
  ),
  constraint platform_notification_rule_channels_check check (
    cardinality(channels) > 0 and channels <@ array['in_app','realtime','push']::text[]
  ),
  constraint platform_notification_rule_window_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint platform_notification_rule_ad_location_check check (
    not sponsored_message or lower(coalesce(targeting->>'location_source','foreground')) <> 'background'
  )
);

create index if not exists platform_notification_rules_active_event_idx
  on public.platform_notification_rules(enabled,event_pattern,match_mode);

create table if not exists public.platform_notification_rule_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.platform_notification_rules(id) on delete cascade,
  event_id uuid references public.live_network_events(id) on delete set null,
  trigger_type text not null default 'live_network',
  dry_run boolean not null default false,
  status text not null default 'running' check (status in ('running','completed','failed')),
  candidate_count integer not null default 0,
  delivered_count integer not null default 0,
  suppressed_count integer not null default 0,
  error text,
  initiated_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists platform_notification_rule_runs_rule_started_idx
  on public.platform_notification_rule_runs(rule_id,started_at desc);

create table if not exists public.platform_notification_attribution (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.platform_notification_rules(id) on delete cascade,
  run_id uuid references public.platform_notification_rule_runs(id) on delete set null,
  event_id uuid references public.live_network_events(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  opened_at timestamptz,
  acted_at timestamptz,
  redeemed_at timestamptz,
  action text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists platform_notification_attribution_rule_user_idx
  on public.platform_notification_attribution(rule_id,user_id,delivered_at desc);
create index if not exists platform_notification_attribution_notification_idx
  on public.platform_notification_attribution(notification_id);

alter table public.platform_owner_control_audit enable row level security;
alter table public.platform_notification_rules enable row level security;
alter table public.platform_notification_rule_runs enable row level security;
alter table public.platform_notification_attribution enable row level security;

revoke all on public.platform_owner_control_audit from public,anon,authenticated;
revoke all on public.platform_notification_rules from public,anon,authenticated;
revoke all on public.platform_notification_rule_runs from public,anon,authenticated;
revoke all on public.platform_notification_attribution from public,anon,authenticated;
grant all on public.platform_owner_control_audit to service_role;
grant all on public.platform_notification_rules to service_role;
grant all on public.platform_notification_rule_runs to service_role;
grant all on public.platform_notification_attribution to service_role;

create or replace function internal.platform_notification_preference_allowed(
  p_user_id uuid,
  p_class text,
  p_sponsored boolean default false,
  p_personalized boolean default false,
  p_location_targeted boolean default false
) returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when p_user_id is null then false
    when lower(coalesce(p_class,''))='platform' then coalesce(np.platform_updates,true)
    when lower(coalesce(p_class,''))='progression' then coalesce(np.rewards,true) and coalesce(np.progression,true)
    when lower(coalesce(p_class,''))='incentive' then coalesce(np.offers,true)
    when lower(coalesce(p_class,''))='sponsored' then coalesce(np.sponsored,false)
      and (not coalesce(p_personalized,false) or coalesce(np.personalized_ads,false))
      and (not coalesce(p_location_targeted,false) or coalesce(np.location_based_offers,false))
    when lower(coalesce(p_class,''))='social' then coalesce(np.community,true) and coalesce(np.social,true)
    when lower(coalesce(p_class,''))='location' then coalesce(np.location_alerts,true)
    when lower(coalesce(p_class,'')) in ('operational','intelligence') then coalesce(np.intelligence,true)
    else true
  end
  from (select 1) seed
  left join public.notification_preferences np on np.user_id=p_user_id;
$$;

revoke execute on function internal.platform_notification_preference_allowed(uuid,text,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function internal.platform_notification_preference_allowed(uuid,text,boolean,boolean,boolean) to service_role;

create or replace function internal.notification_preference_category(p_type text,p_data jsonb default '{}'::jsonb)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when lower(coalesce(p_type,'')) like 'support%' or coalesce(p_data,'{}'::jsonb) ? 'support_request_id' then null
    when lower(coalesce(p_type,'')) like 'sponsored_%' or lower(coalesce(p_type,'')) like 'ad_%' or coalesce(p_data->>'notification_class','')='sponsored' then 'sponsored'
    when lower(coalesce(p_type,'')) like 'incentive_%' or lower(coalesce(p_type,'')) like 'offer_%' or coalesce(p_data->>'notification_class','')='incentive' then 'offers'
    when lower(coalesce(p_type,'')) like 'platform_%' or lower(coalesce(p_type,'')) like 'system_%' or coalesce(p_data->>'notification_class','')='platform' then 'platform'
    when lower(coalesce(p_type,'')) like 'location_%' or lower(coalesce(p_type,'')) like 'nearby_%' or lower(coalesce(p_type,'')) like 'geofence_%' or coalesce(p_data->>'notification_class','')='location' then 'location'
    when lower(coalesce(p_type,'')) in ('review','new_follower','review_helpful','business_review_reply')
      or lower(coalesce(p_type,'')) like 'community_%'
      or lower(coalesce(p_type,'')) like 'follow_%'
      or lower(coalesce(p_type,'')) like 'review_%'
      or lower(coalesce(p_type,'')) like '%reply%'
      or coalesce(p_data->>'notification_class','')='social' then 'community'
    when lower(coalesce(p_type,''))='game_challenge'
      or lower(coalesce(p_type,'')) like 'badge%'
      or lower(coalesce(p_type,'')) like 'quest%'
      or lower(coalesce(p_type,'')) like 'contest%'
      or lower(coalesce(p_type,'')) like 'progress%'
      or lower(coalesce(p_type,'')) like 'reward%'
      or coalesce(p_data->>'notification_class','')='progression' then 'progression'
    when lower(coalesce(p_type,'')) in ('scheduled_report','trusted_place','popular_place','operational_attention','demand_opportunity','high_activity_zone')
      or lower(coalesce(p_type,'')) like 'intelligence_%'
      or lower(coalesce(p_type,'')) like 'report_%'
      or coalesce(p_data->>'notification_class','') in ('operational','intelligence') then 'intelligence'
    else null
  end;
$$;

create or replace function internal.enforce_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_category text;
  v_allowed boolean:=true;
  v_personalized boolean:=coalesce((new.data->>'personalized')::boolean,false);
  v_location_targeted boolean:=coalesce((new.data->>'location_targeted')::boolean,false);
begin
  v_category:=internal.notification_preference_category(new.type,coalesce(new.data,'{}'::jsonb));
  if v_category is null then return new; end if;
  if v_category='community' then
    select coalesce(np.community,true) and coalesce(np.social,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='progression' then
    select coalesce(np.rewards,true) and coalesce(np.progression,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='intelligence' then
    select coalesce(np.intelligence,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='platform' then
    select coalesce(np.platform_updates,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='offers' then
    select coalesce(np.offers,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='location' then
    select coalesce(np.location_alerts,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='sponsored' then
    select coalesce(np.sponsored,false)
      and (not v_personalized or coalesce(np.personalized_ads,false))
      and (not v_location_targeted or coalesce(np.location_based_offers,false))
      into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  end if;
  if coalesce(v_allowed,true) then return new; end if;
  insert into internal.notification_preference_suppressions(user_id,notification_type,preference_category)
  values(new.user_id,new.type,v_category);
  return null;
end;
$$;

create or replace function public.get_my_notification_preferences_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_row public.notification_preferences%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  insert into public.notification_preferences(user_id) values(v_uid) on conflict(user_id) do nothing;
  select * into v_row from public.notification_preferences where user_id=v_uid;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_my_notification_preferences_v2(
  p_intelligence boolean default null,
  p_rewards boolean default null,
  p_community boolean default null,
  p_push boolean default null,
  p_platform_updates boolean default null,
  p_progression boolean default null,
  p_offers boolean default null,
  p_sponsored boolean default null,
  p_location_alerts boolean default null,
  p_social boolean default null,
  p_personalized_ads boolean default null,
  p_location_based_offers boolean default null,
  p_quiet_hours_start time without time zone default null,
  p_quiet_hours_end time without time zone default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_row public.notification_preferences%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  insert into public.notification_preferences(user_id) values(v_uid) on conflict(user_id) do nothing;
  update public.notification_preferences set
    intelligence=coalesce(p_intelligence,intelligence),
    rewards=coalesce(p_rewards,rewards),
    community=coalesce(p_community,community),
    push=coalesce(p_push,push),
    platform_updates=coalesce(p_platform_updates,platform_updates),
    progression=coalesce(p_progression,progression),
    offers=coalesce(p_offers,offers),
    sponsored=coalesce(p_sponsored,sponsored),
    location_alerts=coalesce(p_location_alerts,location_alerts),
    social=coalesce(p_social,social),
    personalized_ads=coalesce(p_personalized_ads,personalized_ads),
    location_based_offers=coalesce(p_location_based_offers,location_based_offers),
    quiet_hours_start=coalesce(p_quiet_hours_start,quiet_hours_start),
    quiet_hours_end=coalesce(p_quiet_hours_end,quiet_hours_end),
    ads_personalization_consent_at=case when p_personalized_ads=true then coalesce(ads_personalization_consent_at,now()) when p_personalized_ads=false then null else ads_personalization_consent_at end,
    location_offers_consent_at=case when p_location_based_offers=true then coalesce(location_offers_consent_at,now()) when p_location_based_offers=false then null else location_offers_consent_at end,
    updated_at=now()
  where user_id=v_uid returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.get_my_notification_preferences_v2() from public,anon;
revoke execute on function public.update_my_notification_preferences_v2(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time without time zone,time without time zone) from public,anon;
grant execute on function public.get_my_notification_preferences_v2() to authenticated,service_role;
grant execute on function public.update_my_notification_preferences_v2(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time without time zone,time without time zone) to authenticated,service_role;

create or replace function public.owner_notification_control_snapshot(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  return jsonb_build_object(
    'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc) from (select * from public.platform_notification_rules order by updated_at desc limit v_limit) r),'[]'::jsonb),
    'recent_runs',coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at desc) from (select * from public.platform_notification_rule_runs order by started_at desc limit v_limit) x),'[]'::jsonb),
    'outcomes',jsonb_build_object(
      'delivered',(select count(*) from public.platform_notification_attribution where delivered_at>=now()-interval '24 hours'),
      'opened',(select count(*) from public.platform_notification_attribution where opened_at>=now()-interval '24 hours'),
      'acted',(select count(*) from public.platform_notification_attribution where acted_at>=now()-interval '24 hours'),
      'redeemed',(select count(*) from public.platform_notification_attribution where redeemed_at>=now()-interval '24 hours')
    ),
    'delivery_health',public.admin_notification_native_push_delivery_health(now()-interval '24 hours',now()),
    'generated_at',now()
  );
end;
$$;

create or replace function public.owner_upsert_platform_notification_rule(p_rule jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid(); v_id uuid; v_before jsonb:='{}'::jsonb; v_after jsonb;
  v_code text:=lower(trim(coalesce(p_rule->>'code','')));
  v_name text:=trim(coalesce(p_rule->>'name',''));
  v_pattern text:=trim(coalesce(p_rule->>'event_pattern',''));
  v_class text:=lower(coalesce(p_rule->>'notification_class','platform'));
  v_scope text:=lower(coalesce(p_rule->>'audience_scope','actor'));
  v_match text:=lower(coalesce(p_rule->>'match_mode','exact'));
  v_targets text[]:=coalesce(array(select jsonb_array_elements_text(coalesce(p_rule->'app_targets','["consumer"]'::jsonb))),array['consumer']::text[]);
  v_channels text[]:=coalesce(array(select jsonb_array_elements_text(coalesce(p_rule->'channels','["in_app","realtime","push"]'::jsonb))),array['in_app','realtime','push']::text[]);
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  if v_code='' or v_code !~ '^[a-z0-9][a-z0-9._-]{1,79}$' then raise exception 'Rule code must be 2-80 safe characters'; end if;
  if v_name='' or length(v_name)>120 then raise exception 'Rule name is required and must be <=120 characters'; end if;
  if v_pattern='' or length(v_pattern)>160 then raise exception 'event_pattern is required and must be <=160 characters'; end if;
  if v_class not in ('platform','progression','incentive','sponsored','operational','intelligence','social','location') then raise exception 'Invalid notification class'; end if;
  if v_scope not in ('actor','all_users','nearby','business_members','fleet_members','enterprise_members','followers') then raise exception 'Invalid audience scope'; end if;
  if v_match not in ('exact','prefix') then raise exception 'Invalid match mode'; end if;
  if cardinality(v_targets)=0 or not (v_targets <@ array['consumer','business','fleet','kleenestos']::text[]) then raise exception 'Invalid app target'; end if;
  if cardinality(v_channels)=0 or not (v_channels <@ array['in_app','realtime','push']::text[]) then raise exception 'Invalid delivery channel'; end if;
  if coalesce((p_rule->>'sponsored_message')::boolean,false) and lower(coalesce(p_rule->'targeting'->>'location_source','foreground'))='background' then raise exception 'Background location cannot be used for sponsored targeting'; end if;
  if coalesce((p_rule->>'requires_background_location')::boolean,false) then raise exception 'Platform notification rules cannot require background location'; end if;

  if nullif(p_rule->>'id','') is not null then
    v_id:=(p_rule->>'id')::uuid;
    select to_jsonb(r) into v_before from public.platform_notification_rules r where r.id=v_id;
    if v_before is null then raise exception 'Notification rule not found'; end if;
    update public.platform_notification_rules set
      code=v_code,name=v_name,description=nullif(trim(coalesce(p_rule->>'description','')),''),
      enabled=coalesce((p_rule->>'enabled')::boolean,enabled),dry_run=coalesce((p_rule->>'dry_run')::boolean,dry_run),
      event_pattern=v_pattern,match_mode=v_match,notification_class=v_class,audience_scope=v_scope,
      app_targets=v_targets,channels=v_channels,
      priority=case when lower(coalesce(p_rule->>'priority','normal')) in ('low','normal','high','urgent') then lower(coalesce(p_rule->>'priority','normal')) else 'normal' end,
      radius_meters=least(greatest(coalesce((p_rule->>'radius_meters')::integer,radius_meters),1),50000),
      frequency_cap_count=least(greatest(coalesce((p_rule->>'frequency_cap_count')::integer,frequency_cap_count),1),100),
      frequency_cap_window_minutes=least(greatest(coalesce((p_rule->>'frequency_cap_window_minutes')::integer,frequency_cap_window_minutes),1),10080),
      starts_at=case when nullif(p_rule->>'starts_at','') is null then starts_at else (p_rule->>'starts_at')::timestamptz end,
      ends_at=case when nullif(p_rule->>'ends_at','') is null then ends_at else (p_rule->>'ends_at')::timestamptz end,
      title_template=left(trim(coalesce(p_rule->>'title_template',title_template)),160),
      body_template=left(trim(coalesce(p_rule->>'body_template',body_template)),1000),
      deep_link=nullif(trim(coalesce(p_rule->>'deep_link',deep_link)),''),image_url=nullif(trim(coalesce(p_rule->>'image_url',image_url)),''),
      targeting=coalesce(p_rule->'targeting',targeting),incentive=coalesce(p_rule->'incentive',incentive),attribution=coalesce(p_rule->'attribution',attribution),
      sponsored_message=coalesce((p_rule->>'sponsored_message')::boolean,sponsored_message),personalized=coalesce((p_rule->>'personalized')::boolean,personalized),location_targeted=coalesce((p_rule->>'location_targeted')::boolean,location_targeted),
      updated_by=v_uid,updated_at=now()
    where id=v_id returning to_jsonb(public.platform_notification_rules.*) into v_after;
  else
    insert into public.platform_notification_rules(code,name,description,enabled,dry_run,event_pattern,match_mode,notification_class,audience_scope,app_targets,channels,priority,radius_meters,frequency_cap_count,frequency_cap_window_minutes,starts_at,ends_at,title_template,body_template,deep_link,image_url,targeting,incentive,attribution,sponsored_message,personalized,location_targeted,created_by,updated_by)
    values(v_code,v_name,nullif(trim(coalesce(p_rule->>'description','')),''),coalesce((p_rule->>'enabled')::boolean,false),coalesce((p_rule->>'dry_run')::boolean,true),v_pattern,v_match,v_class,v_scope,v_targets,v_channels,
      case when lower(coalesce(p_rule->>'priority','normal')) in ('low','normal','high','urgent') then lower(coalesce(p_rule->>'priority','normal')) else 'normal' end,
      least(greatest(coalesce((p_rule->>'radius_meters')::integer,5000),1),50000),least(greatest(coalesce((p_rule->>'frequency_cap_count')::integer,1),1),100),least(greatest(coalesce((p_rule->>'frequency_cap_window_minutes')::integer,120),1),10080),
      nullif(p_rule->>'starts_at','')::timestamptz,nullif(p_rule->>'ends_at','')::timestamptz,left(trim(coalesce(p_rule->>'title_template','Kleenest update')),160),left(trim(coalesce(p_rule->>'body_template','There is something new in Kleenest.')),1000),nullif(trim(coalesce(p_rule->>'deep_link','')),''),nullif(trim(coalesce(p_rule->>'image_url','')),''),coalesce(p_rule->'targeting','{}'::jsonb),coalesce(p_rule->'incentive','{}'::jsonb),coalesce(p_rule->'attribution','{}'::jsonb),coalesce((p_rule->>'sponsored_message')::boolean,false),coalesce((p_rule->>'personalized')::boolean,false),coalesce((p_rule->>'location_targeted')::boolean,false),v_uid,v_uid)
    returning id,to_jsonb(public.platform_notification_rules.*) into v_id,v_after;
  end if;
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
  values(v_uid,'notifications','upsert_rule',v_code,coalesce(v_before,'{}'::jsonb),v_after,p_reason);
  return v_after;
end;
$$;

create or replace function public.owner_delete_platform_notification_rule(p_rule_id uuid,p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_before jsonb; v_code text;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  select to_jsonb(r),r.code into v_before,v_code from public.platform_notification_rules r where r.id=p_rule_id;
  if v_before is null then return false; end if;
  delete from public.platform_notification_rules where id=p_rule_id;
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
  values(v_uid,'notifications','delete_rule',v_code,v_before,'{}'::jsonb,p_reason);
  return true;
end;
$$;

create or replace function internal.resolve_platform_notification_rule_recipients(p_rule_id uuid,p_event_id uuid)
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_rule public.platform_notification_rules%rowtype; v_event public.live_network_events%rowtype; v_business_id uuid;
begin
  select * into v_rule from public.platform_notification_rules where id=p_rule_id;
  select * into v_event from public.live_network_events where id=p_event_id;
  if v_rule.id is null or v_event.id is null then return; end if;
  select coalesce(case when v_event.actor_type in ('business','fleet','enterprise') then v_event.actor_id else null end,l.business_id)
    into v_business_id from (select 1) seed left join public.locations l on l.id=v_event.location_id;

  if v_rule.audience_scope='actor' then
    return query select v_event.actor_id where v_event.actor_type='user' and v_event.actor_id is not null;
  elsif v_rule.audience_scope='all_users' then
    return query select p.id from public.profiles p where coalesce(p.is_demo_test,false)=false;
  elsif v_rule.audience_scope='followers' then
    return query select f.follower_id from public.follows f where v_event.actor_type='user' and f.following_id=v_event.actor_id;
  elsif v_rule.audience_scope='business_members' then
    return query select bm.user_id from public.business_members bm where bm.business_id=v_business_id;
  elsif v_rule.audience_scope='fleet_members' then
    return query select bm.user_id from public.business_members bm join public.businesses b on b.id=bm.business_id where bm.business_id=v_business_id and lower(b.business_tier::text) in ('fleet','enterprise');
  elsif v_rule.audience_scope='enterprise_members' then
    return query select bm.user_id from public.business_members bm join public.businesses b on b.id=bm.business_id where bm.business_id=v_business_id and lower(b.business_tier::text)='enterprise';
  elsif v_rule.audience_scope='nearby' then
    return query
      with target as (select latitude,longitude from public.locations where id=v_event.location_id),
      latest as (select distinct on (ls.user_id) ls.user_id,ls.latitude,ls.longitude from public.location_discovery_sessions ls order by ls.user_id,ls.created_at desc),
      obs as (select distinct on (lo.observer_user_id) lo.observer_user_id user_id,lo.latitude,lo.longitude from public.location_observations lo where lo.latitude is not null and lo.longitude is not null order by lo.observer_user_id,lo.observed_at desc),
      pos as (select coalesce(o.user_id,l.user_id) user_id,coalesce(o.latitude,l.latitude) latitude,coalesce(o.longitude,l.longitude) longitude from latest l full join obs o on o.user_id=l.user_id)
      select distinct pos.user_id from pos cross join target t
      where t.latitude is not null and t.longitude is not null
        and 111320*sqrt(power((pos.latitude-t.latitude),2)+power((pos.longitude-t.longitude)*cos(radians(t.latitude)),2))<=v_rule.radius_meters;
  end if;
end;
$$;

revoke execute on function internal.resolve_platform_notification_rule_recipients(uuid,uuid) from public,anon,authenticated;
grant execute on function internal.resolve_platform_notification_rule_recipients(uuid,uuid) to service_role;

create or replace function internal.materialize_platform_notification_rule(p_rule_id uuid,p_event_id uuid,p_trigger_type text default 'live_network',p_initiated_by uuid default null,p_force_dry_run boolean default null)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rule public.platform_notification_rules%rowtype; v_event public.live_network_events%rowtype; v_run uuid; v_user uuid; v_profile public.profiles%rowtype;
  v_candidate integer:=0; v_delivered integer:=0; v_suppressed integer:=0; v_notification_id uuid; v_title text; v_body text; v_location_name text; v_business_name text; v_recent integer; v_dry boolean;
begin
  select * into v_rule from public.platform_notification_rules where id=p_rule_id;
  select * into v_event from public.live_network_events where id=p_event_id;
  if v_rule.id is null or v_event.id is null then raise exception 'Rule/event not found'; end if;
  v_dry:=coalesce(p_force_dry_run,v_rule.dry_run);
  insert into public.platform_notification_rule_runs(rule_id,event_id,trigger_type,dry_run,initiated_by) values(v_rule.id,v_event.id,coalesce(p_trigger_type,'live_network'),v_dry,p_initiated_by) returning id into v_run;
  select l.name,b.name into v_location_name,v_business_name from public.locations l left join public.businesses b on b.id=l.business_id where l.id=v_event.location_id;
  v_title:=replace(replace(replace(v_rule.title_template,'{{event_type}}',v_event.event_type),'{{location_name}}',coalesce(v_location_name,'Kleenest location')),'{{business_name}}',coalesce(v_business_name,'Kleenest business'));
  v_body:=replace(replace(replace(v_rule.body_template,'{{event_type}}',v_event.event_type),'{{location_name}}',coalesce(v_location_name,'this location')),'{{business_name}}',coalesce(v_business_name,'this business'));
  for v_user in select distinct r.user_id from internal.resolve_platform_notification_rule_recipients(v_rule.id,v_event.id) r loop
    v_candidate:=v_candidate+1;
    select * into v_profile from public.profiles where id=v_user;
    if v_profile.id is null
      or (v_rule.targeting ? 'min_level' and coalesce(v_profile.level,0)<(v_rule.targeting->>'min_level')::integer)
      or (v_rule.targeting ? 'max_level' and coalesce(v_profile.level,0)>(v_rule.targeting->>'max_level')::integer)
      or (v_rule.targeting ? 'min_streak' and coalesce(v_profile.streak,0)<(v_rule.targeting->>'min_streak')::integer)
      or (v_rule.targeting ? 'min_checkins' and coalesce(v_profile.total_check_ins,0)<(v_rule.targeting->>'min_checkins')::integer)
      or (jsonb_typeof(v_rule.targeting->'subscription_tiers')='array' and not exists(select 1 from jsonb_array_elements_text(v_rule.targeting->'subscription_tiers') x where lower(x)=lower(coalesce(v_profile.subscription_tier::text,''))))
      or not internal.platform_notification_preference_allowed(v_user,v_rule.notification_class,v_rule.sponsored_message,v_rule.personalized,v_rule.location_targeted)
    then v_suppressed:=v_suppressed+1; continue; end if;
    select count(*) into v_recent from public.platform_notification_attribution a where a.rule_id=v_rule.id and a.user_id=v_user and a.delivered_at>now()-make_interval(mins=>v_rule.frequency_cap_window_minutes);
    if v_recent>=v_rule.frequency_cap_count then v_suppressed:=v_suppressed+1; continue; end if;
    if v_dry then continue; end if;
    insert into public.notifications(user_id,type,title,body,data)
    values(v_user,
      case when v_rule.sponsored_message then 'sponsored_campaign' else v_rule.notification_class||'_campaign' end,
      v_title,v_body,
      jsonb_build_object('notification_class',v_rule.notification_class,'platform_notification_rule_id',v_rule.id,'platform_notification_run_id',v_run,'live_network_event_id',v_event.id,'location_id',v_event.location_id,'app_targets',to_jsonb(v_rule.app_targets),'channels',to_jsonb(v_rule.channels),'priority',v_rule.priority,'deep_link',v_rule.deep_link,'image_url',v_rule.image_url,'incentive',v_rule.incentive,'attribution',v_rule.attribution,'sponsored',v_rule.sponsored_message,'personalized',v_rule.personalized,'location_targeted',v_rule.location_targeted,'campaign_code',v_rule.code)
        || coalesce(v_event.payload,'{}'::jsonb))
    returning id into v_notification_id;
    if v_notification_id is not null then
      insert into public.platform_notification_attribution(rule_id,run_id,event_id,notification_id,user_id,metadata)
      values(v_rule.id,v_run,v_event.id,v_notification_id,v_user,jsonb_build_object('event_type',v_event.event_type,'campaign_code',v_rule.code));
      v_delivered:=v_delivered+1;
    else v_suppressed:=v_suppressed+1; end if;
  end loop;
  update public.platform_notification_rule_runs set status='completed',candidate_count=v_candidate,delivered_count=v_delivered,suppressed_count=v_suppressed,finished_at=now() where id=v_run;
  return v_run;
exception when others then
  if v_run is not null then update public.platform_notification_rule_runs set status='failed',candidate_count=v_candidate,delivered_count=v_delivered,suppressed_count=v_suppressed,error=left(sqlerrm,1000),finished_at=now() where id=v_run; end if;
  raise;
end;
$$;

revoke execute on function internal.materialize_platform_notification_rule(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function internal.materialize_platform_notification_rule(uuid,uuid,text,uuid,boolean) to service_role;

create or replace function internal.evaluate_platform_notification_rules()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_rule record; v_requested uuid;
begin
  begin v_requested:=nullif(new.payload->>'platform_rule_id','')::uuid; exception when invalid_text_representation then v_requested:=null; end;
  for v_rule in
    select r.id from public.platform_notification_rules r
    where r.enabled=true
      and (r.starts_at is null or r.starts_at<=now()) and (r.ends_at is null or r.ends_at>now())
      and (v_requested is null or r.id=v_requested)
      and ((r.match_mode='exact' and r.event_pattern=new.event_type) or (r.match_mode='prefix' and new.event_type like r.event_pattern||'%'))
  loop
    begin perform internal.materialize_platform_notification_rule(v_rule.id,new.id,'live_network',null,null); exception when others then null; end;
  end loop;
  return new;
end;
$$;

revoke execute on function internal.evaluate_platform_notification_rules() from public,anon,authenticated;

drop trigger if exists trg_platform_notification_rules on public.live_network_events;
create trigger trg_platform_notification_rules after insert on public.live_network_events for each row execute function internal.evaluate_platform_notification_rules();

create or replace function public.owner_publish_platform_notification_rule(p_rule_id uuid,p_location_id uuid default null,p_payload jsonb default '{}'::jsonb,p_force_dry_run boolean default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_rule public.platform_notification_rules%rowtype; v_event uuid; v_event_type text; v_run uuid;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  select * into v_rule from public.platform_notification_rules where id=p_rule_id;
  if v_rule.id is null then raise exception 'Notification rule not found'; end if;
  v_event_type:=case when v_rule.match_mode='prefix' then v_rule.event_pattern||'owner_test' else v_rule.event_pattern end;
  insert into public.live_network_events(event_type,location_id,actor_type,actor_id,payload)
  values(v_event_type,p_location_id,'platform',v_uid,coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('platform_rule_id',v_rule.id,'owner_initiated',true)) returning id into v_event;
  select r.id into v_run from public.platform_notification_rule_runs r where r.event_id=v_event and r.rule_id=v_rule.id order by r.started_at desc limit 1;
  if p_force_dry_run is not null and v_run is not null then
    -- trigger used stored dry-run; explicit override requires a second isolated run and is only for owner preview/testing.
    v_run:=internal.materialize_platform_notification_rule(v_rule.id,v_event,'owner_manual',v_uid,p_force_dry_run);
  end if;
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,new_state)
  values(v_uid,'notifications','publish_rule',v_rule.code,jsonb_build_object('rule_id',v_rule.id,'event_id',v_event,'run_id',v_run,'force_dry_run',p_force_dry_run));
  return jsonb_build_object('rule_id',v_rule.id,'event_id',v_event,'run_id',v_run);
end;
$$;

create or replace function public.record_platform_notification_engagement(p_notification_id uuid,p_action text,p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_action text:=lower(trim(coalesce(p_action,''))); v_row public.platform_notification_attribution%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_action not in ('opened','acted','redeemed') then raise exception 'Unsupported notification action'; end if;
  select * into v_row from public.platform_notification_attribution where notification_id=p_notification_id and user_id=v_uid order by delivered_at desc limit 1;
  if v_row.id is null then raise exception 'Notification attribution not found'; end if;
  update public.platform_notification_attribution set
    opened_at=case when v_action='opened' then coalesce(opened_at,now()) else opened_at end,
    acted_at=case when v_action='acted' then coalesce(acted_at,now()) else acted_at end,
    redeemed_at=case when v_action='redeemed' then coalesce(redeemed_at,now()) else redeemed_at end,
    action=v_action,metadata=metadata||coalesce(p_metadata,'{}'::jsonb)
  where id=v_row.id returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.owner_notification_control_snapshot(integer) from public,anon;
revoke execute on function public.owner_upsert_platform_notification_rule(jsonb,text) from public,anon;
revoke execute on function public.owner_delete_platform_notification_rule(uuid,text) from public,anon;
revoke execute on function public.owner_publish_platform_notification_rule(uuid,uuid,jsonb,boolean) from public,anon;
revoke execute on function public.record_platform_notification_engagement(uuid,text,jsonb) from public,anon;
grant execute on function public.owner_notification_control_snapshot(integer) to authenticated,service_role;
grant execute on function public.owner_upsert_platform_notification_rule(jsonb,text) to authenticated,service_role;
grant execute on function public.owner_delete_platform_notification_rule(uuid,text) to authenticated,service_role;
grant execute on function public.owner_publish_platform_notification_rule(uuid,uuid,jsonb,boolean) to authenticated,service_role;
grant execute on function public.record_platform_notification_engagement(uuid,text,jsonb) to authenticated,service_role;

create or replace function public.owner_ingestion_control_snapshot(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  return jsonb_build_object(
    'status',public.admin_national_ingestion_status(),
    'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.priority) from public.national_ingestion_source_policies s),'[]'::jsonb),
    'markets',coalesce((select jsonb_agg(to_jsonb(m) order by m.priority,m.population_rank nulls last) from (select * from public.national_ingestion_markets order by priority,population_rank nulls last limit v_limit) m),'[]'::jsonb),
    'storage_guard',(select to_jsonb(g) from public.national_ingestion_storage_guard g where g.singleton=true),
    'history',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from public.platform_owner_control_audit where domain='ingestion' order by created_at desc limit v_limit) a),'[]'::jsonb),
    'generated_at',now()
  );
end;
$$;

create or replace function public.owner_update_ingestion_source_policy(p_source_key text,p_patch jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_key text:=trim(coalesce(p_source_key,'')); v_before jsonb; v_after jsonb;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  select to_jsonb(s) into v_before from public.national_ingestion_source_policies s where s.source_key=v_key;
  if v_before is null then raise exception 'Unknown ingestion source'; end if;
  update public.national_ingestion_source_policies set
    enabled=coalesce((p_patch->>'enabled')::boolean,enabled),
    priority=least(greatest(coalesce((p_patch->>'priority')::integer,priority),1),10000),
    quota_mode=case when lower(coalesce(p_patch->>'quota_mode',quota_mode)) in ('fixed','adaptive','unlimited') then lower(coalesce(p_patch->>'quota_mode',quota_mode)) else quota_mode end,
    daily_request_limit=case when p_patch ? 'daily_request_limit' then nullif(p_patch->>'daily_request_limit','')::integer else daily_request_limit end,
    hourly_request_limit=case when p_patch ? 'hourly_request_limit' then nullif(p_patch->>'hourly_request_limit','')::integer else hourly_request_limit end,
    daily_byte_limit=case when p_patch ? 'daily_byte_limit' then nullif(p_patch->>'daily_byte_limit','')::bigint else daily_byte_limit end,
    min_interval_seconds=least(greatest(coalesce((p_patch->>'min_interval_seconds')::integer,min_interval_seconds),0),86400),
    max_requests_per_cycle=least(greatest(coalesce((p_patch->>'max_requests_per_cycle')::integer,max_requests_per_cycle),1),1000),
    notes=case when p_patch ? 'notes' then nullif(left(trim(coalesce(p_patch->>'notes','')),1000),'') else notes end,
    updated_at=now()
  where source_key=v_key returning to_jsonb(public.national_ingestion_source_policies.*) into v_after;
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
  values(v_uid,'ingestion','update_source_policy',v_key,v_before,v_after,p_reason);
  return v_after;
end;
$$;

create or replace function public.owner_update_ingestion_storage_guard(p_patch jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_before jsonb; v_after jsonb; v_pause numeric; v_hard numeric;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  select to_jsonb(g),g.pause_fraction,g.hard_stop_fraction into v_before,v_pause,v_hard from public.national_ingestion_storage_guard g where g.singleton=true;
  v_pause:=coalesce((p_patch->>'pause_fraction')::numeric,v_pause); v_hard:=coalesce((p_patch->>'hard_stop_fraction')::numeric,v_hard);
  if v_pause<=0 or v_pause>=1 or v_hard<=0 or v_hard>1 or v_pause>=v_hard then raise exception 'Storage thresholds must satisfy 0 < pause < hard_stop <= 1'; end if;
  update public.national_ingestion_storage_guard set
    allocation_bytes=greatest(coalesce((p_patch->>'allocation_bytes')::bigint,allocation_bytes),104857600),
    pause_fraction=v_pause,hard_stop_fraction=v_hard,
    updated_at=now()
  where singleton=true returning to_jsonb(public.national_ingestion_storage_guard.*) into v_after;
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
  values(v_uid,'ingestion','update_storage_guard','singleton',coalesce(v_before,'{}'::jsonb),v_after,p_reason);
  return v_after;
end;
$$;

create or replace function public.owner_update_ingestion_market(p_market_id uuid,p_priority integer default null,p_enabled boolean default null,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_before jsonb; v_after jsonb; v_status text;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  select to_jsonb(m),m.status into v_before,v_status from public.national_ingestion_markets m where m.id=p_market_id;
  if v_before is null then raise exception 'Ingestion market not found'; end if;
  if p_enabled=false and v_status='running' then raise exception 'A running market cannot be disabled until the current cycle completes'; end if;
  update public.national_ingestion_markets set
    priority=coalesce(least(greatest(p_priority,1),100000),priority),
    status=case when p_enabled=false then 'blocked' when p_enabled=true and status='blocked' then 'pending' else status end,
    last_error=case when p_enabled=true and status='blocked' then null else last_error end,
    updated_at=now()
  where id=p_market_id returning to_jsonb(public.national_ingestion_markets.*) into v_after;
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,previous_state,new_state,reason)
  values(v_uid,'ingestion','update_market',p_market_id::text,v_before,v_after,p_reason);
  return v_after;
end;
$$;

create or replace function public.owner_run_ingestion_cycle(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  perform public.run_national_ingestion_scheduler();
  v_result:=public.admin_national_ingestion_status();
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,new_state,reason) values(v_uid,'ingestion','run_cycle','national',v_result,p_reason);
  return v_result;
end;
$$;

create or replace function public.owner_repair_ingestion_cells(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then raise exception 'Platform owner access required'; end if;
  perform public.repair_stalled_national_ingestion_cells();
  v_result:=public.admin_national_ingestion_status();
  insert into public.platform_owner_control_audit(owner_user_id,domain,action,target_key,new_state,reason) values(v_uid,'ingestion','repair_stalled_cells','national',v_result,p_reason);
  return v_result;
end;
$$;

revoke execute on function public.owner_ingestion_control_snapshot(integer) from public,anon;
revoke execute on function public.owner_update_ingestion_source_policy(text,jsonb,text) from public,anon;
revoke execute on function public.owner_update_ingestion_storage_guard(jsonb,text) from public,anon;
revoke execute on function public.owner_update_ingestion_market(uuid,integer,boolean,text) from public,anon;
revoke execute on function public.owner_run_ingestion_cycle(text) from public,anon;
revoke execute on function public.owner_repair_ingestion_cells(text) from public,anon;
grant execute on function public.owner_ingestion_control_snapshot(integer) to authenticated,service_role;
grant execute on function public.owner_update_ingestion_source_policy(text,jsonb,text) to authenticated,service_role;
grant execute on function public.owner_update_ingestion_storage_guard(jsonb,text) to authenticated,service_role;
grant execute on function public.owner_update_ingestion_market(uuid,integer,boolean,text) to authenticated,service_role;
grant execute on function public.owner_run_ingestion_cycle(text) to authenticated,service_role;
grant execute on function public.owner_repair_ingestion_cells(text) to authenticated,service_role;

-- Bridge canonical progression into the Live Network so owner-configured rules can react without client coupling.
create or replace function internal.bridge_progression_to_live_network()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.live_network_events(event_type,location_id,actor_type,actor_id,payload)
  values('progression.'||lower(coalesce(new.action,'event')),new.location_id,'user',new.user_id,
    jsonb_build_object('progression_event_id',new.id,'action',new.action,'xp_awarded',new.xp_awarded,'evidence_tier',new.evidence_tier,'subject',coalesce(new.subject,'{}'::jsonb),'status',new.status));
  return new;
end;
$$;
revoke execute on function internal.bridge_progression_to_live_network() from public,anon,authenticated;
drop trigger if exists trg_progression_live_network on public.progression_events_v2;
create trigger trg_progression_live_network after insert on public.progression_events_v2 for each row execute function internal.bridge_progression_to_live_network();

create or replace function internal.bridge_badge_to_live_network()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.live_network_events(event_type,location_id,actor_type,actor_id,payload)
  values('progression.badge_earned',null,'user',new.user_id,jsonb_build_object('badge_id',new.badge_id,'earned_at',new.earned_at));
  return new;
end;
$$;
revoke execute on function internal.bridge_badge_to_live_network() from public,anon,authenticated;
drop trigger if exists trg_badge_live_network on public.user_badges;
create trigger trg_badge_live_network after insert on public.user_badges for each row execute function internal.bridge_badge_to_live_network();

-- Native/web push transport respects rule channels and app targets.
create or replace function public.enqueue_notification_native_push_delivery()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare worker_secret text;
begin
  if (not (coalesce(new.data,'{}'::jsonb) ? 'channels') or coalesce(new.data->'channels','[]'::jsonb) ? 'push')
     and coalesce((select np.push from public.notification_preferences np where np.user_id=new.user_id),true)
     and exists(select 1 from public.notification_native_push_tokens t where t.user_id=new.user_id and t.active=true)
  then
    select c.worker_secret into worker_secret from internal.push_worker_config c where c.id=true;
    perform net.http_post(
      url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/deliver-native-push-notification',
      headers:=jsonb_build_object('Content-Type','application/json','x-kleenest-worker-secret',worker_secret),
      body:=jsonb_build_object('record',jsonb_build_object('id',new.id)),
      timeout_milliseconds:=5000
    );
  end if;
  return new;
end;
$$;
revoke execute on function public.enqueue_notification_native_push_delivery() from public,anon,authenticated;

create or replace function public.claim_native_push_deliveries(p_notification_id uuid,p_max_attempts integer default 5)
returns table(id uuid,token_id uuid,token text,platform text,attempts integer)
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_notification_id is null then raise exception 'notification_id is required'; end if;
  if p_max_attempts is null or p_max_attempts<1 or p_max_attempts>20 then raise exception 'invalid max attempts'; end if;
  return query
  with eligible as (
    select t.id token_id,t.token,t.platform,coalesce(d.attempts,0) prior_attempts
    from public.notification_native_push_tokens t
    left join public.notification_native_push_deliveries d on d.notification_id=p_notification_id and d.token_id=t.id
    join public.notifications n on n.id=p_notification_id and n.user_id=t.user_id
    where t.active=true
      and (not (coalesce(n.data,'{}'::jsonb) ? 'app_targets') or exists(select 1 from jsonb_array_elements_text(n.data->'app_targets') a where lower(a)=lower(t.app_id)))
      and coalesce(d.attempts,0)<p_max_attempts
      and (d.id is null or d.status='failed' or (d.status='pending' and d.updated_at<now()-interval '5 minutes'))
    for update of t
  ), claimed as (
    insert into public.notification_native_push_deliveries(notification_id,token_id,status,attempts,updated_at)
    select p_notification_id,e.token_id,'pending',e.prior_attempts+1,now() from eligible e
    on conflict(notification_id,token_id) do update set status='pending',attempts=public.notification_native_push_deliveries.attempts+1,updated_at=now(),last_error=null
      where public.notification_native_push_deliveries.attempts<p_max_attempts and (public.notification_native_push_deliveries.status='failed' or (public.notification_native_push_deliveries.status='pending' and public.notification_native_push_deliveries.updated_at<now()-interval '5 minutes'))
    returning public.notification_native_push_deliveries.id,public.notification_native_push_deliveries.token_id,public.notification_native_push_deliveries.attempts
  )
  select c.id,c.token_id,e.token,e.platform,c.attempts from claimed c join eligible e on e.token_id=c.token_id;
end;
$$;
revoke execute on function public.claim_native_push_deliveries(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_native_push_deliveries(uuid,integer) to service_role;
